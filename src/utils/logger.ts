// logger.ts (ESM / TypeScript)
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import cloudWatchLogger from '../helpers/cloudwatch.helper';


type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const {
  LOG_LEVEL = 'info',
  LOG_SERVICE = 'app-service',
  NODE_ENV = 'development',
  LOG_TO_FILES = 'false', // optional: if you still want simple flat-file mirroring
} = process.env as Record<string, string>;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// ── Optional: keep simple file mirroring (no winston) ───────────────────
const logsDir = path.join(process.cwd(), 'logs');
if (LOG_TO_FILES === 'true' && !existsSync(logsDir)) mkdirSync(logsDir);

function writeFileMirror(level: LogLevel, line: string) {
  if (LOG_TO_FILES !== 'true') return;
  const fs = require('fs') as typeof import('fs');
  const map: Record<LogLevel, string> = {
    error: 'error.log',
    warn: 'warn.log',
    info: 'combined.log',
    debug: 'combined.log',
  };
  fs.appendFile(path.join(logsDir, map[level]), line + '\n', () => { });
}

// ── Console printer ─────────────────────────────────────────────────────
function print(level: LogLevel, msg: string, meta?: any) {
  const time = new Date().toISOString();
  const line = `${time} ${level}: ${msg}${meta ? ` ${safeJSON(meta)}` : ''}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.log(line);

  writeFileMirror(level, line);
}

function safeJSON(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable-meta]';
  }
}

// ── Core logger ─────────────────────────────────────────────────────────
class Logger {
  min: LogLevel;

  constructor(minLevel: LogLevel = LOG_LEVEL as LogLevel) {
    this.min = ['debug', 'info', 'warn', 'error'].includes(minLevel)
      ? (minLevel as LogLevel)
      : 'info';
  }

  async saveLog(log: any) {
    return;
  }

  private enabled(level: LogLevel) {
    return levelOrder[level] >= levelOrder[this.min];
  }

  async log(level: LogLevel, message: any, meta?: any) {
    if (!this.enabled(level)) return;

    // 1) console
    print(level, message, meta);

    // 2) CloudWatch logging
    try {
      // Send to CloudWatch for structured logging and monitoring
      if (level === 'error') {
        cloudWatchLogger.error(message, meta?.error || new Error(message), meta);
      } else if (level === 'warn') {
        cloudWatchLogger.warn(message, meta);
      } else if (level === 'info') {
        cloudWatchLogger.info(message, meta);
      }
    } catch (err: any) {
      // never crash because CloudWatch logging failed
      console.error('[logger] CloudWatch logging failed:', err?.message || err);
    }

    // 3) your custom sink (DynamoDB)
    try {
      // Skip helper in tests unless explicitly enabled
      const skip = NODE_ENV === 'test' && process.env.LOG_TO_HELPER !== 'true';
      if (!skip) {
        await Promise.resolve(
          this.saveLog({
            level,
            message,
            service: LOG_SERVICE,
            ts: new Date().toISOString(),
            meta,
          })
        );
      }
    } catch (err: any) {
      // never crash because logging failed
      console.error('[logger] saveLog failed:', err?.message || err);
    }
  }

  debug(message: any, meta?: any) { return this.log('debug', message, meta); }
  info(message: any, meta?: any) { return this.log('info', message, meta); }
  warn(message: any, meta?: any) { return this.log('warn', message, meta); }
  error(message: any, meta?: any) { return this.log('error', message, meta); }

  // You asked for `.ing` → same as info()
  ing(message: any, meta?: any) { return this.info(message, meta); }
}

const logger = new Logger();

export { logger };
