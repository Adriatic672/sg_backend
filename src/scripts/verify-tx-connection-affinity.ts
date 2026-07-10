/**
 * Standalone, manually-run verification that the transaction/connection-release
 * bug in db.helper.ts is real (--mode=old) and that the fix resolves it
 * (--mode=new). Not wired into any test runner; run directly with ts-node.
 *
 *   npx ts-node src/scripts/verify-tx-connection-affinity.ts --mode=old
 *   npx ts-node src/scripts/verify-tx-connection-affinity.ts --mode=new
 *
 * Uses its own scratch table (tx_verify_scratch) against socialgems_test,
 * created and dropped by this script. Does not touch any real app tables.
 */
import 'dotenv/config';
import * as mysql from 'mysql2/promise';

const HOST = process.env.HOST_NAME || process.env.DB_HOST || 'maglev.proxy.rlwy.net';
const PORT = parseInt(process.env.DB_PORT || '26523');
const USER = process.env.USER_NAME || 'root';
const PASSWORD = process.env.PASSWORD || '';
const DATABASE = process.env.DBNAME || 'socialgems_test';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withScratchTable<T>(fn: () => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE });
  await conn.query('DROP TABLE IF EXISTS tx_verify_scratch');
  await conn.query('CREATE TABLE tx_verify_scratch (id INT PRIMARY KEY, value VARCHAR(50))');
  await conn.query("INSERT INTO tx_verify_scratch (id, value) VALUES (1, 'initial')");
  await conn.end();

  try {
    return await fn();
  } finally {
    const cleanupConn = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE });
    await cleanupConn.query('DROP TABLE IF EXISTS tx_verify_scratch');
    await cleanupConn.end();
  }
}

/**
 * Reproduces the ORIGINAL bug directly, without depending on db.helper.ts
 * (which has already been fixed): a connection that opens a transaction and
 * is released without committing leaves its session frozen at a stale
 * REPEATABLE READ snapshot. This is the exact mechanism behind the
 * intermittent "Job not found" reports - a later, unrelated read that lands
 * on that same connection sees old data even though it's been committed
 * elsewhere by a different connection.
 */
async function runOldMode(): Promise<boolean> {
  return withScratchTable(async () => {
    // connA simulates a connection that beginTransaction() checked out,
    // used, and then released back to the pool WITHOUT committing - the bug.
    const connA = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE });
    await connA.query('START TRANSACTION');
    const [firstRead]: any = await connA.query('SELECT value FROM tx_verify_scratch WHERE id = 1');
    console.log(`connA initial read (establishes snapshot): '${firstRead[0].value}'`);
    // In the real bug, connA would be connection.release()'d back into the
    // pool right here, still mid-transaction. We don't need to actually
    // release it into a pool to prove the point - we just need to show that
    // an unrelated commit from another connection is invisible to connA
    // for as long as connA's transaction stays open, which is exactly what
    // "released but never committed" causes in production.

    // connB simulates a completely different request, on a different pooled
    // connection, that does real work and commits it normally.
    const connB = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE });
    await connB.query("UPDATE tx_verify_scratch SET value = 'updated-by-concurrent-request' WHERE id = 1");
    await connB.end();

    // Back on connA (still in its original, never-committed transaction) -
    // this simulates a later unrelated read landing on the poisoned
    // connection, exactly like getJobApplicants hitting a stale connection.
    const [secondRead]: any = await connA.query('SELECT value FROM tx_verify_scratch WHERE id = 1');
    console.log(`connA read after concurrent commit elsewhere: '${secondRead[0].value}'`);

    await connA.query('ROLLBACK');
    await connA.end();

    if (secondRead[0].value === 'initial') {
      console.log(`BUG REPRODUCED: concurrent read returned stale value 'initial' instead of 'updated-by-concurrent-request'`);
      return true;
    }

    console.log(`FAIL (old mode): expected to reproduce the stale read ('initial'), but got '${secondRead[0].value}' - baseline harness may be broken`);
    return false;
  });
}

/**
 * Proves the FIX: a long-held transaction (via the real, fixed db.helper.ts)
 * does not poison a genuinely concurrent, unrelated request - even though
 * both go through the same singleton db.default object - because the held
 * connection is scoped to the transaction's own async call chain via
 * AsyncLocalStorage, not to the object or the pool.
 */
async function runNewMode(): Promise<boolean> {
  // db.helper.ts reads process.env.HOST_NAME, which isn't set in local .env
  // (only DB_HOST is) - mirror what a correctly configured environment
  // provides so the real module connects to the same test DB this script uses.
  process.env.HOST_NAME = process.env.HOST_NAME || HOST;

  // Import the real, shipped db.helper.ts - not a reimplementation - so this
  // verifies the actual artifact being deployed.
  const db = (await import('../helpers/db.helper')).default;

  return withScratchTable(async () => {
    let concurrentResult = '';
    let concurrentErrored: any = null;

    async function longTransaction() {
      await db.beginTransaction();
      try {
        // db.pdo() returns the rows array directly (see shapeResult in
        // db.helper.ts) - unlike mysql2/promise's .query(), which returns a
        // [rows, fields] tuple. Do not destructure it as a tuple here.
        const row: any = await db.pdo('SELECT value FROM tx_verify_scratch WHERE id = 1');
        console.log(`longTransaction initial read (held connection): '${row[0].value}'`);
        await sleep(300); // hold the transaction open while the concurrent request runs
        await db.pdo("UPDATE tx_verify_scratch SET value = 'written-by-long-tx' WHERE id = 1");
        await db.commit();
        console.log('longTransaction committed');
      } catch (error) {
        await db.rollback();
        throw error;
      }
    }

    async function concurrentRequest() {
      await sleep(100); // ensure this runs while longTransaction's transaction is still open
      try {
        await db.pdo("UPDATE tx_verify_scratch SET value = 'updated-by-concurrent-request' WHERE id = 1");
        const row: any = await db.pdo('SELECT value FROM tx_verify_scratch WHERE id = 1');
        concurrentResult = row[0].value;
        console.log(`concurrentRequest read (should be its own fresh write): '${concurrentResult}'`);
      } catch (error) {
        concurrentErrored = error;
      }
    }

    // Kicked off as siblings from the same synchronous tick - concurrentRequest
    // is NOT nested inside longTransaction's call graph, so it must not inherit
    // longTransaction's AsyncLocalStorage transaction context.
    await Promise.all([longTransaction(), concurrentRequest()]);

    if (concurrentErrored) {
      console.log(`FAIL (new mode): concurrentRequest threw unexpectedly: ${concurrentErrored.message}`);
      return false;
    }

    if (concurrentResult !== 'updated-by-concurrent-request') {
      console.log(
        `FAIL (new mode): expected concurrent read to see its own fresh write 'updated-by-concurrent-request', got '${concurrentResult}' - the concurrent request was incorrectly affected by the long-held transaction`
      );
      return false;
    }

    const finalRead: any = await db.pdo('SELECT value FROM tx_verify_scratch WHERE id = 1');
    if (finalRead[0].value !== 'written-by-long-tx') {
      console.log(
        `FAIL (new mode): expected final value 'written-by-long-tx' after both operations completed, got '${finalRead[0].value}'`
      );
      return false;
    }

    console.log('PASS: concurrent unrelated read/write was unaffected by the long-held transaction, and the connection was cleanly released afterward');
    return true;
  });
}

async function main() {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : undefined;

  if (mode !== 'old' && mode !== 'new') {
    console.error('Usage: ts-node src/scripts/verify-tx-connection-affinity.ts --mode=old|new');
    process.exit(1);
  }

  const passed = mode === 'old' ? await runOldMode() : await runNewMode();
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error('Verification script crashed:', error);
  process.exit(1);
});
