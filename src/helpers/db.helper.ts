import * as mysql from 'mysql2';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../utils/logger';
dotenv.config();

interface TransactionStore {
  connectionPromise: Promise<any>;
  depth: number;
  rollbackOnly: boolean;
}

interface OpenTransactionEntry {
  store: TransactionStore;
  openedAt: number;
  stack?: string;
}

const transactionContext = new AsyncLocalStorage<TransactionStore>();

// Safety net: with only a handful of pooled connections, a single leaked
// open transaction (future bug/regression) can exhaust the pool and hang
// the whole app. Anything left open past this threshold gets force-rolled-back.
const TRANSACTION_WATCHDOG_MS = 30000;
const openTransactions = new Set<OpenTransactionEntry>();

setInterval(() => {
  const now = Date.now();
  for (const entry of openTransactions) {
    if (now - entry.openedAt > TRANSACTION_WATCHDOG_MS) {
      openTransactions.delete(entry);
      logger.error('Transaction watchdog: force-rolling-back a stuck transaction', {
        openForMs: now - entry.openedAt,
        stack: entry.stack,
      });
      entry.store.connectionPromise
        .then((connection: any) => {
          connection.query('ROLLBACK', () => {
            connection.release();
          });
        })
        .catch(() => {
          // connection never resolved; nothing to release
        });
    }
  }
}, 10000).unref();

function shapeResult(query: string, results: any) {
  const isProcedureCall = query.trim().startsWith('CALL');
  if (isProcedureCall) {
    return results.length > 0 ? JSON.parse(JSON.stringify(results[0])) : [];
  }
  return results.length > 0 ? JSON.parse(JSON.stringify(results)) : [];
}

class DbHelper {
  private normalPool: any;
  private writePool: any;
  private readPool: any;
  constructor() {
    this.normalPool = this.initializePool('normal');
  }
  public initializePool(connectionType: string) {
    const commonOptions = {
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 30000,
      enableKeepAlive: true as true,
      keepAliveInitialDelay: 10000,
    };
    if (connectionType === 'normal') {
      return mysql.createPool({
        ...commonOptions,
        connectionLimit: 3,
        host: process.env.HOST_NAME,
        port: parseInt(process.env.DB_PORT || '3306'),
        database: process.env.DBNAME,
        user: process.env.USER_NAME,
        password: process.env.PASSWORD,
      });
    }
    if (connectionType === 'write') {
      return mysql.createPool({
        ...commonOptions,
        connectionLimit: 1,
        host: process.env.WRITE_NAME,
        database: process.env.WRITE_DBNAME,
        user: process.env.WRITE_USER_NAME,
        password: process.env.WRITE_PASSWORD,
      });
    }
    if (connectionType === 'read') {
      return mysql.createPool({
        ...commonOptions,
        connectionLimit: 1,
        host: process.env.READ_HOST_NAME,
        database: process.env.READ_DBNAME,
        user: process.env.READ_USER_NAME,
        password: process.env.READ_PASSWORD,
      });
    }
  }
  public pdoOld(query: any, conType: string = 'normal') {
    let pdoConnect: any;

    if (conType === 'read') {
      this.readOpreation();
      pdoConnect = this.readPool;
    } else if (conType === 'write') {
      this.writeOpreation();
      pdoConnect = this.writePool;
    } else {
      pdoConnect = this.normalPool;
    }

    return new Promise((resolve, reject) => {
      pdoConnect.getConnection((err: any, connection: any) => {
        if (err) {
          return reject(err);
        }

        connection.query(query, (error: any, results: any) => {
          connection.release();

          if (error) {
            return reject(error);
          }
          let data: any;
          const isProcedureCall = query.trim().startsWith('CALL');
          if (isProcedureCall) {
            data = results.length > 0 ? JSON.parse(JSON.stringify(results[0])) : [];
          } else {
            data = results.length > 0 ? JSON.parse(JSON.stringify(results)) : [];
          }
          resolve(data);
        });
      });
    });
  }


  public pdo(query: string, values: any[] = [], conType: string = 'normal') {
    let pdoConnect: any;

    if (conType === 'read') {
      this.readOpreation();
      pdoConnect = this.readPool;
    } else if (conType === 'write') {
      this.writeOpreation();
      pdoConnect = this.writePool;
    } else {
      pdoConnect = this.normalPool;
    }

    // If a transaction is active on this async chain (normal pool only),
    // run the query on the held connection instead of checking out a new one.
    const store = conType === 'normal' ? transactionContext.getStore() : undefined;

    if (store) {
      return store.connectionPromise.then((connection: any) => {
        return new Promise((resolve, reject) => {
          connection.query(query, values, (error: any, results: any) => {
            // No release here - the connection is owned by the transaction
            // and is only released by commit()/rollback() at depth 0.
            if (error) {
              return reject(error);
            }
            resolve(shapeResult(query, results));
          });
        });
      });
    }

    return new Promise((resolve, reject) => {
      pdoConnect.getConnection((err: any, connection: any) => {
        if (err) {
          return reject(err);
        }

        connection.query(query, values, (error: any, results: any) => {
          connection.release();

          if (error) {
            return reject(error);
          }
          resolve(shapeResult(query, results));
        });
      });
    });
  }

  public async beginTransaction(): Promise<void> {
    const store = transactionContext.getStore();

    if (store) {
      // Re-entrant: reuse the same held connection, just bump the depth counter.
      store.depth++;
      return;
    }

    const connectionPromise = new Promise<any>((resolve, reject) => {
      this.normalPool.getConnection((err: any, connection: any) => {
        if (err) {
          return reject(err);
        }
        resolve(connection);
      });
    });

    const newStore: TransactionStore = {
      connectionPromise,
      depth: 1,
      rollbackOnly: false,
    };

    // Must happen synchronously, before any await below, so that even a
    // caller who doesn't `await this.beginTransaction()` has the context
    // established before their very next statement runs.
    transactionContext.enterWith(newStore);

    const entry: OpenTransactionEntry = {
      store: newStore,
      openedAt: Date.now(),
      stack: new Error().stack,
    };
    openTransactions.add(entry);

    try {
      const connection = await connectionPromise;
      await new Promise<void>((resolve, reject) => {
        connection.query('START TRANSACTION', (error: any) => {
          if (error) {
            return reject(error);
          }
          resolve();
        });
      });
    } catch (error) {
      openTransactions.delete(entry);
      throw error;
    }

    // Stash the watchdog entry so commit()/rollback() can remove it.
    (newStore as any).__watchdogEntry = entry;
  }

  public async commit(): Promise<void> {
    const store = transactionContext.getStore();
    if (!store) {
      throw new Error('commit() called without an active transaction context');
    }

    store.depth--;

    if (store.depth > 0) {
      if (store.rollbackOnly) {
        throw new Error(
          'commit() called, but an earlier operation in this transaction already requested rollback; the transaction will be rolled back'
        );
      }
      return;
    }

    const connection = await store.connectionPromise;
    const shouldRollback = store.rollbackOnly;
    const entry: OpenTransactionEntry | undefined = (store as any).__watchdogEntry;

    try {
      await new Promise<void>((resolve, reject) => {
        connection.query(shouldRollback ? 'ROLLBACK' : 'COMMIT', (error: any) => {
          if (error) {
            return reject(error);
          }
          resolve();
        });
      });
    } finally {
      connection.release();
      if (entry) {
        openTransactions.delete(entry);
      }
      transactionContext.enterWith(undefined as any);
    }

    if (shouldRollback) {
      throw new Error('Transaction was rolled back because an earlier nested operation requested rollback');
    }
  }

  public async rollback(): Promise<void> {
    const store = transactionContext.getStore();
    if (!store) {
      throw new Error('rollback() called without an active transaction context');
    }

    store.rollbackOnly = true;
    store.depth--;

    if (store.depth > 0) {
      return;
    }

    const connection = await store.connectionPromise;
    const entry: OpenTransactionEntry | undefined = (store as any).__watchdogEntry;

    try {
      await new Promise<void>((resolve, reject) => {
        connection.query('ROLLBACK', (error: any) => {
          if (error) {
            return reject(error);
          }
          resolve();
        });
      });
    } finally {
      connection.release();
      if (entry) {
        openTransactions.delete(entry);
      }
      transactionContext.enterWith(undefined as any);
    }
  }



  public readOpreation() {
    this.readPool = this.initializePool('read');
  }
  public writeOpreation() {
    this.writePool = this.initializePool('read');
  }



}
export default new DbHelper();
