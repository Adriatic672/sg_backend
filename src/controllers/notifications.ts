import express, { Request, Response } from 'express';
import Notifications from '../models/notifications.admin.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import { VERSION_CODE } from '../app';

const router = express.Router();
const companyServices = new Notifications();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};
const applyJWTAccessConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyTokenAccess(req, res, next);
};



router.get('/all', applyJWTConditionally, getNotifications);
router.post('/markAsRead', applyJWTConditionally, markAsRead);
router.get('/unread', applyJWTConditionally, getUnreadNotifications);

async function markAsRead(req: Request, res: Response) {
  try {
    const { userId, notificationIds } = req.body;
    if (!userId || !notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({ message: 'userId and notificationIds (array) are required' });
    }
    const result = await companyServices.markAsRead(userId, notificationIds);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error marking notifications as read', error });
  }
}

async function getUnreadNotifications(req: Request, res: Response) {
  try {
    const userId = req.body.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const result = await companyServices.getUnreadNotifications(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching unread notifications', error });
  }
}


async function getNotifications(req: Request, res: Response) {
  try {
    const result = await companyServices.getNotifications(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}


async function sendMessage(req: Request, res: Response) {
  try {
    const result = await companyServices.sendMessage(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}


export default router;
