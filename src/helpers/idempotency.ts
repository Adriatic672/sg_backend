import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Lazy singleton to avoid circular import at module load time
let _db: any = null;
function db() {
  if (!_db) _db = new (require('./model').default)();
  return _db;
}

const TTL_HOURS = 24;

export function idempotencyCheck(operation: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = (req.headers['x-idempotency-key'] as string | undefined)?.trim();
    if (!key) return next();

    const userId = (req as any).user?.userId || (req as any).user?.user_id || 'anon';
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}:${operation}:${key}`)
      .digest('hex');

    try {
      const rows: any = await db().callQuerySafe(
        `SELECT response_status, response_body FROM idempotency_keys
         WHERE key_hash = ? AND expires_at > NOW() LIMIT 1`,
        [hash]
      );

      if (rows && rows.length > 0) {
        logger.info('idempotency: returning cached response', { operation, userId });
        return res
          .status(rows[0].response_status)
          .json(JSON.parse(rows[0].response_body));
      }
    } catch (err) {
      logger.warn('idempotency: lookup failed, proceeding', { err });
    }

    // Intercept res.json to persist the response before it is sent
    const originalJson = (res.json as any).bind(res);
    (res as any).json = function (body: any) {
      const status = res.statusCode;
      const expiry = new Date(Date.now() + TTL_HOURS * 3600 * 1000)
        .toISOString().slice(0, 19).replace('T', ' ');

      db().callQuerySafe(
        `INSERT IGNORE INTO idempotency_keys
           (key_hash, user_id, operation, response_status, response_body, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
        [hash, userId, operation, status, JSON.stringify(body), expiry]
      ).catch((e: any) => logger.warn('idempotency: save failed', { e }));

      return originalJson(body);
    };

    next();
  };
}
