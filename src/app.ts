import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import expressFileUpload from 'express-fileupload';
import http from 'http';
import rateLimit from 'express-rate-limit'; // Import rate limiting middleware

// Set up global error handlers BEFORE any other imports
process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception:', error);
  // Try to log to CloudWatch if possible
  try {
    const { logger } = require('./utils/logger');
    logger.error('CRITICAL: Uncaught Exception', { error: error.message, stack: error.stack });
  } catch (logError) {
    console.error('Failed to log uncaught exception:', logError);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  // Try to log to CloudWatch if possible
  try {
    const { logger } = require('./utils/logger');
    logger.error('CRITICAL: Unhandled Rejection', { reason, promise });
  } catch (logError) {
    console.error('Failed to log unhandled rejection:', logError);
  }
});

// Handle module resolution errors
process.on('warning', (warning) => {
  console.warn('Node.js Warning:', warning.name, warning.message);
  try {
    const { logger } = require('./utils/logger');
    logger.warn('Node.js Warning', { name: warning.name, message: warning.message, stack: warning.stack });
  } catch (logError) {
    console.error('Failed to log warning:', logError);
  }
});

// Import routes
import users from './controllers/accounts';
import admin from './controllers/admin';
import media from './controllers/media';
import activities from './controllers/activities';
import posts from './controllers/posts';
import campaigns from './controllers/campaigns';
import groups from './controllers/groups';
import chat from './controllers/chats';
import payments from './controllers/payments';
import wallet from './controllers/wallet';
import analytics from './controllers/analytics';
import notifications from './controllers/notifications';
import roles from './controllers/roles';
import makerChecker from './controllers/makerChecker';
import agents from './controllers/agents';
import CronService from './helpers/cron';
import { requestLogger, globalErrorHandler } from './helpers/errorHandler.middleware';

// Middleware to log incoming IPs

import reports from './controllers/reports';
import social from './controllers/social';
// Import WebSocket initializer
import initializeWebSocket from './controllers/ws';

if (process.env.NODE_ENV !== 'production') {
    import Test from './tests/index';
    new Test();
}
new CronService()

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;
export const VERSION_CODE="1.4.7"

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
initializeWebSocket(server);
app.set("trust proxy", 1);

app.use((req, res, next) => {
  console.log(`Incoming request from IP: ${req.ip}`);
  next();
});

// Set up rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all requests
app.use(limiter);

app.use(cors());
app.use(expressFileUpload());
app.use(bodyParser.json());
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));

// Add request logging middleware
app.use(requestLogger);

// Setup routes
app.use('/users', users);
app.use('/admin', admin);
app.use('/media', media);
app.use('/activities', activities);
app.use('/campaigns', campaigns);
app.use('/posts', posts);
app.use('/groups', groups);
app.use('/chat', chat);
app.use('/payments', payments);
app.use('/wallet', wallet);
app.use('/notifications', notifications);
app.use('/admin/reports', reports);
app.use('/analytics', analytics);
app.use('/roles', roles);
app.use('/maker-checker', makerChecker);
app.use('/oauth', social);
app.use('/agents', agents);

// Add global error handler (must be last)
app.use(globalErrorHandler);

// Start both HTTP and WebSocket server
server.listen(PORT, () => {
  console.log(`HTTP & WS server running on port ${PORT}`);
//  testTikTokAnalytics();
});