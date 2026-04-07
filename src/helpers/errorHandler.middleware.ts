import { Request, Response, NextFunction } from 'express';
import cloudWatchLogger from './cloudwatch.helper';

// Interface to extend Request with additional properties
interface ExtendedRequest extends Request {
  startTime?: number;
  user?: any;
}

// Middleware to log requests and responses
export const requestLogger = (req: ExtendedRequest, res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  
  // Log the incoming request
  cloudWatchLogger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.userId || req.body?.userId,
    requestId: req.headers['x-request-id'],
  });

  // Override res.json to capture responses
  const originalJson = res.json;
  res.json = function(body: any) {
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log the response
    if (res.statusCode >= 400) {
      cloudWatchLogger.error('Request failed', null, {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        responseTime,
        userId: req.user?.userId || req.body?.userId,
        requestId: req.headers['x-request-id'],
        response: body,
      });
    } else {
      cloudWatchLogger.info('Request completed', {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        responseTime,
        userId: req.user?.userId || req.body?.userId,
        requestId: req.headers['x-request-id'],
      });
    }

    return originalJson.call(this, body);
  };

  next();
};

// Global error handler middleware
export const globalErrorHandler = (err: any, req: ExtendedRequest, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || err.status || 500;
  const responseTime = req.startTime ? Date.now() - req.startTime : 0;

  // Log the error to CloudWatch
  cloudWatchLogger.error('Unhandled error in request', err, {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode,
    responseTime,
    userId: req.user?.userId || req.body?.userId,
    requestId: req.headers['x-request-id'],
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    body: sanitizeRequestBody(req.body),
    params: req.params,
    query: req.query,
  });

  // Send sanitized error response to client
  const errorResponse = {
    status: statusCode,
    message: statusCode >= 500 ? 'Internal server error' : (err.message || 'An error occurred'),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  res.status(statusCode).json(errorResponse);
};

// Helper function to sanitize request body
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'pin', 'current_password', 'new_password', 'confirmPassword', 'otp', 'secret', 'token'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

// Async error wrapper for controllers
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Log the error
      cloudWatchLogger.error('Async controller error', error, {
        method: req.method,
        url: req.originalUrl || req.url,
        userId: (req as any).user?.userId || req.body?.userId,
        requestId: req.headers['x-request-id'],
      });

      // Pass to global error handler
      next(error);
    });
  };
};

// Helper function to create standardized error responses
export const createErrorResponse = (statusCode: number, message: string, details?: any) => {
  return {
    status: statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && details && { details })
  };
};

export default {
  requestLogger,
  globalErrorHandler,
  asyncErrorHandler,
  createErrorResponse,
};
