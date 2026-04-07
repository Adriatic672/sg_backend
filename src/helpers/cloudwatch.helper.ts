import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogGroupCommand, CreateLogStreamCommand, DescribeLogGroupsCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';

interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  service: string;
  userId?: string;
  requestId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  error?: any;
  meta?: any;
}

class CloudWatchLogger {
  private client: CloudWatchLogsClient;
  private logGroupName: string;
  private logStreamName: string;
  private sequenceToken?: string;
  private logBuffer: LogEntry[] = [];
  private bufferSize = 10;
  private flushInterval = 5000; // 5 seconds
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    // Initialize CloudWatch client
    this.client = new CloudWatchLogsClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    const env = process.env.TABLE_IDENTIFIER || 'dev';
    this.logGroupName = `/aws/socialgems/${env}`;
    this.logStreamName = `api-${new Date().toISOString().split('T')[0]}-${Math.random().toString(36).substring(7)}`;
    
    this.initializeLogGroup();
    this.startFlushTimer();
  }

  private async initializeLogGroup() {
    try {
      // Check if log group exists
      const describeGroupsCommand = new DescribeLogGroupsCommand({
        logGroupNamePrefix: this.logGroupName,
      });
      
      const groups = await this.client.send(describeGroupsCommand);
      const groupExists = groups.logGroups?.some((group: any) => group.logGroupName === this.logGroupName);

      if (!groupExists) {
        // Create log group
        const createGroupCommand = new CreateLogGroupCommand({
          logGroupName: this.logGroupName,
        });
        await this.client.send(createGroupCommand);
        console.log(`Created CloudWatch log group: ${this.logGroupName}`);
      }

      // Create log stream
      const createStreamCommand = new CreateLogStreamCommand({
        logGroupName: this.logGroupName,
        logStreamName: this.logStreamName,
      });
      await this.client.send(createStreamCommand);
      console.log(`Created CloudWatch log stream: ${this.logStreamName}`);

    } catch (error) {
      console.error('Failed to initialize CloudWatch log group/stream:', error);
    }
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushLogs();
    }, this.flushInterval);
  }

  private async flushLogs() {
    if (this.logBuffer.length === 0) return;

    try {
      // CloudWatch limits: 1MB per batch, max 10,000 events per batch
      const MAX_BATCH_SIZE = 1048576; // 1MB in bytes
      const MAX_EVENTS_PER_BATCH = 10000;
      
      // Convert log entries to CloudWatch format
      const allLogEvents = this.logBuffer.map(entry => ({
        message: JSON.stringify({
          level: entry.level,
          message: entry.message,
          service: entry.service,
          timestamp: entry.timestamp,
          userId: entry.userId,
          requestId: entry.requestId,
          method: entry.method,
          url: entry.url,
          statusCode: entry.statusCode,
          error: entry.error ? this.sanitizeError(entry.error) : undefined,
          meta: entry.meta,
        }),
        timestamp: new Date(entry.timestamp).getTime(),
      }));

      // Process logs in chunks to stay under CloudWatch limits
      const chunks = this.chunkLogEvents(allLogEvents, MAX_BATCH_SIZE, MAX_EVENTS_PER_BATCH);
      
      for (const chunk of chunks) {
        const command = new PutLogEventsCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
          logEvents: chunk,
          sequenceToken: this.sequenceToken,
        });

        const response = await this.client.send(command);
        this.sequenceToken = response.nextSequenceToken;
      }
      
      // Clear buffer after successful flush
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to flush logs to CloudWatch:', error);
      // On error, keep only recent logs to prevent infinite growth
      if (this.logBuffer.length > 1000) {
        this.logBuffer = this.logBuffer.slice(-500); // Keep only last 500 logs
      }
    }
  }

  private chunkLogEvents(logEvents: any[], maxBatchSize: number, maxEventsPerBatch: number): any[][] {
    const chunks: any[][] = [];
    let currentChunk: any[] = [];
    let currentSize = 0;

    for (const logEvent of logEvents) {
      const eventSize = Buffer.byteLength(logEvent.message, 'utf8') + 26; // 26 bytes overhead per event
      
      // Check if adding this event would exceed limits
      if (
        currentChunk.length >= maxEventsPerBatch ||
        (currentSize + eventSize > maxBatchSize && currentChunk.length > 0)
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }

      // If single event is too large, truncate it
      if (eventSize > maxBatchSize) {
        const maxMessageSize = maxBatchSize - 26 - 100; // Leave some buffer
        const truncatedMessage = logEvent.message.substring(0, maxMessageSize) + '...[TRUNCATED]';
        logEvent.message = truncatedMessage;
      }

      currentChunk.push(logEvent);
      currentSize += eventSize;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private sanitizeError(error: any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    
    if (typeof error === 'object' && error !== null) {
      return {
        ...error,
        // Remove sensitive information
        password: '[REDACTED]',
        pin: '[REDACTED]',
        secret: '[REDACTED]',
        token: '[REDACTED]',
      };
    }
    
    return error;
  }

  public log(entry: LogEntry) {
    // Skip logging in test environment unless explicitly enabled
    if (process.env.NODE_ENV === 'test' && process.env.LOG_TO_CLOUDWATCH !== 'true') {
      return;
    }

    // Check if the entry is too large and truncate if necessary
    const serializedEntry = JSON.stringify(entry);
    if (serializedEntry.length > 100000) { // 100KB limit per entry
      console.warn('Large log entry detected, truncating...');
      entry.meta = '[LARGE_ENTRY_TRUNCATED]';
      if (entry.message && entry.message.length > 1000) {
        entry.message = entry.message.substring(0, 1000) + '...[TRUNCATED]';
      }
    }
    
    this.logBuffer.push(entry);

    // Flush if buffer gets too large or if we're approaching CloudWatch limits
    if (this.logBuffer.length >= this.bufferSize || entry.level === 'error' || this.estimateBufferSize() > 800000) { // 800KB limit
      this.flushLogs();
    }
  }

  private estimateBufferSize(): number {
    // Rough estimate of buffer size in bytes
    return this.logBuffer.reduce((size, entry) => {
      return size + JSON.stringify(entry).length;
    }, 0);
  }

  public error(message: string, error?: any, meta?: any) {
    this.log({
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      service: process.env.LOG_SERVICE || 'socialgems-api',
      error,
      meta,
    });
  }

  public warn(message: string, meta?: any) {
    this.log({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      service: process.env.LOG_SERVICE || 'socialgems-api',
      meta,
    });
  }

  public info(message: string, meta?: any) {
    this.log({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      service: process.env.LOG_SERVICE || 'socialgems-api',
      meta,
    });
  }

  public debug(message: string, meta?: any) {
    this.log({
      level: 'debug',
      message,
      timestamp: new Date().toISOString(),
      service: process.env.LOG_SERVICE || 'socialgems-api',
      meta,
    });
  }

  public logRequest(req: any, res: any, error?: any) {
    const entry: LogEntry = {
      level: error ? 'error' : 'info',
      message: error ? 'Request failed' : 'Request processed',
      timestamp: new Date().toISOString(),
      service: process.env.LOG_SERVICE || 'socialgems-api',
      userId: req.user?.userId || req.body?.userId,
      requestId: req.id || req.headers['x-request-id'],
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      error: error ? this.sanitizeError(error) : undefined,
      meta: {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress,
        body: this.sanitizeRequestBody(req.body),
        params: req.params,
        query: req.query,
      },
    };

    this.log(entry);
  }

  private sanitizeRequestBody(body: any): any {
    if (!body) return body;
    
    const sanitizeRecursive = (obj: any, depth = 0): any => {
      // Prevent infinite recursion and overly deep objects
      if (depth > 5) return '[MAX_DEPTH_REACHED]';
      
      if (typeof obj !== 'object' || obj === null) {
        // Truncate very long strings
        if (typeof obj === 'string' && obj.length > 500) {
          return obj.substring(0, 500) + '...[TRUNCATED]';
        }
        return obj;
      }
      
      if (Array.isArray(obj)) {
        // Limit array size
        if (obj.length > 50) {
          return obj.slice(0, 50).map(item => sanitizeRecursive(item, depth + 1))
            .concat(['...[ARRAY_TRUNCATED]']);
        }
        return obj.map(item => sanitizeRecursive(item, depth + 1));
      }
      
      const sanitized: any = {};
      const sensitiveFields = ['password', 'pin', 'current_password', 'new_password', 'confirmPassword', 'otp', 'secret', 'token', 'auth', 'credential'];
      
      let keyCount = 0;
      for (const [key, value] of Object.entries(obj)) {
        // Limit object keys
        if (keyCount > 30) {
          sanitized['...'] = '[OBJECT_TRUNCATED]';
          break;
        }
        
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizeRecursive(value, depth + 1);
        }
        keyCount++;
      }
      
      return sanitized;
    };

    return sanitizeRecursive(body);
  }

  public async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flushLogs();
  }
}

// Create singleton instance
const cloudWatchLogger = new CloudWatchLogger();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  await cloudWatchLogger.shutdown();
});

process.on('SIGINT', async () => {
  await cloudWatchLogger.shutdown();
});

export { cloudWatchLogger, CloudWatchLogger };
export default cloudWatchLogger;
