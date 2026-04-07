import express, { Request, Response } from 'express';
import expressWs from 'express-ws';
import ChatModel from '../models/chat.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';

const app = express();
expressWs(app); // Enable WebSocket support
const router = express.Router();
const chatServices = new ChatModel();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

// Chat Routes
router.post('/sendMessage', applyJWTConditionally, sendMessage);
router.get('/getConversations', applyJWTConditionally, getConversations);
router.get('/getChats/:conversationId', applyJWTConditionally, getChats);
router.get('/getMessageTypes', applyJWTConditionally, getMessageTypes);

router.get('/deleteMessage/:messageId', applyJWTConditionally, deleteMessage);
router.patch('/editMessage', applyJWTConditionally, editMessage);

async function deleteMessage(req: Request, res: Response) {
  try {
    const { messageId } = req.params;
    const userId = req.body.userId || req.query.userId || (req as any).user?.user_id; // Adjust as per your auth/user extraction
    const result = await chatServices.deleteMessage(messageId, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting message', error });
  }
}

async function editMessage(req: Request, res: Response) {
  try {
    const { messageId, newContent, userId } = req.body;
    
    if (!messageId || !newContent || !userId) {
      return res.status(400).json({ 
        message: 'Missing required fields: messageId, newContent, userId' 
      });
    }
    
    const result = await chatServices.editMessage(messageId, newContent, userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error editing message', error });
  }
}



async function getMessageTypes(req: Request, res: Response) {
  try {
    const result = await chatServices.getMessageTypes();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching message types', error });
  }
}


 
// Handlers
async function sendMessage(req: Request, res: Response) {
  try {
    const result = await chatServices.sendMessage(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error sending message', error });
  }
}

async function getConversations(req: Request, res: Response) {
  try {
    const result = await chatServices.getConversations(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching conversations', error });
  }
}



async function getChats(req: Request, res: Response) {
  try {
    const { conversationId } = req.params;
    const result = await chatServices.getChats(conversationId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chats', error });
  }
}

export default router;
