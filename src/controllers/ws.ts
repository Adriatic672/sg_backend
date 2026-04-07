import jwt from 'jsonwebtoken';
import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
const JWT_SECRET: any = process.env.JWT_SECRET;

interface UserConnection {
  userId: string;
  ws: WebSocket;
  lastSeen: Date;
}

const users = new Map<string, UserConnection>(); // Store connected users

export default function initializeWebSocket(server: HTTPServer) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log(`🔹 New WebSocket connection request received`);

    try {
      const queryParams = req.url?.split('?')[1]; // Get the query string part
      const searchParams = new URLSearchParams(queryParams);
      let token = searchParams.get('token'); // Extract 'token' param

      console.log(`🛂 Extracted token:`, token);

      if (!token) {
        console.log('Connection rejected: No token provided');
        ws.close();
        return;
      }

      const decoded: any = jwt.verify(token, JWT_SECRET);
      const userId = decoded.user_id;
      console.log(`🔑 User ID extracted from token:`, decoded, userId);

      if (!userId) {
        throw new Error("Invalid token: User ID missing");
      }
      console.log(`🔑 User ID extracted from token:`, userId);

      (ws as any).userId = userId;
      users.set(userId, { userId, ws, lastSeen: new Date() });

      console.log(`✅ User ${userId} connected`);

      // Notify others that this user is online.
      // Note: conversationId is optional here.
      broadcastOnlineStatus(userId, true);

      // Handle incoming messages
      ws.on('message', (message: string) => handleIncomingMessage(message, ws, userId));

      // Handle disconnection
      ws.on('close', () => {
        console.log(` User ${userId} disconnected`);
        // Optionally record last seen before deleting connection.
        users.set(userId, { userId, ws, lastSeen: new Date() });
        users.delete(userId);
        broadcastOnlineStatus(userId, false);
      });

      // Send welcome message
      ws.send(JSON.stringify({ type: 'WELCOME', message: `Welcome, User ${userId}!` }));

    } catch (err: any) {
      console.error('JWT verification failed:', err.message);
      ws.close(); // Close connection if JWT is invalid
    }
  });
}

/** 🔹 Broadcast Online Status with optional conversationId */
const broadcastOnlineStatus = (userId: string, isOnline: boolean, conversationId?: string) => {
  console.log(`📢 Broadcasting Online Status: User ${userId} is ${isOnline ? 'Online' : 'Offline'}`);

  const message = JSON.stringify({
    type: 'ONLINE_STATUS',
    userId,
    isOnline,
    conversationId: conversationId || null
  });

  users.forEach((connection) => {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(message);
    }
  });
};

/** 🔹 Handle Incoming Messages */
const handleIncomingMessage = (message: string, ws: WebSocket, userId: string) => {
  try {
    const data = JSON.parse(message);
    console.log(`📩 Message Received from User ${userId}:`, data);

    switch (data.type) {
      case 'SEND_MESSAGE':
        // Expect data.toUserId, data.message, and data.conversationId
        if (data.toUserId && data.message && data.conversationId) {
          sendMessage(userId, data.toUserId, data.message, data.conversationId);
        }
        break;

      case 'TYPING':
        // Expect data.toUserId and data.conversationId
        if (data.toUserId && data.conversationId) {
          broadcastTypingStatus(userId, data.toUserId, true, data.conversationId);
        }
        break;

      case 'STOP_TYPING':
        // Expect data.toUserId and data.conversationId
        if (data.toUserId && data.conversationId) {
          broadcastTypingStatus(userId, data.toUserId, false, data.conversationId);
        }
        break;

      case 'READ_RECEIPT':
        if (data.toUserId && data.conversationId) {
          sendReadReceipt(userId, data.toUserId, data.conversationId);
        }
        break;

      default:
        console.log('⚠️ Unknown message type:', data.type);
    }
  } catch (err: any) {
    console.error('Error parsing message:', err);
  }
};

/** 🔹 Send Message with Conversation ID */
const sendMessage = (fromUserId: string, toUserId: string, messageContent: string, conversationId: string) => {
  const recipient = users.get(toUserId);

  if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
    console.log(`📤 Sending message from User ${fromUserId} to User ${toUserId} for conversation ${conversationId}: "${messageContent}"`);
    recipient.ws.send(JSON.stringify({
      type: 'NEW_MESSAGE',
      fromUserId,
      conversationId,
      message: messageContent
    }));
  } else {
    console.log(`🚫 User ${toUserId} is not online. Message not delivered.`);
  }
};

/** 🔹 Broadcast Typing Status with Conversation ID */
const broadcastTypingStatus = (fromUserId: string, toUserId: string, isTyping: boolean, conversationId: string) => {
  const recipient = users.get(toUserId);

  if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
    console.log(`✍️ User ${fromUserId} is ${isTyping ? 'typing...' : 'stopped typing'} to User ${toUserId} in conversation ${conversationId}`);
    recipient.ws.send(JSON.stringify({
      type: 'TYPING_STATUS',
      fromUserId,
      conversationId,
      isTyping
    }));
  } else {
    console.log(`🚫 User ${toUserId} is not online. Typing status not sent.`);
  }
};

/** 🔹 Send Read Receipt with Conversation ID */
const sendReadReceipt = (fromUserId: string, toUserId: string, conversationId: string) => {
  const recipient = users.get(toUserId);

  if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
    console.log(`📤 Sending read receipt from User ${fromUserId} to User ${toUserId} for conversation ${conversationId}`);
    recipient.ws.send(JSON.stringify({
      type: 'READ_RECEIPT',
      fromUserId,
      conversationId,
      timestamp: new Date().toISOString()
    }));
  } else {
    console.log(`🚫 User ${toUserId} is not online. Read receipt not delivered.`);
  }
};
