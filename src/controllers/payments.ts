import express, { Request, Response } from 'express';
import Payments from '../models/payments.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import bodyParser from 'body-parser';

const router = express.Router();
const pay = new Payments();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};
const applyJWTAccessConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyTokenAccess(req, res, next);
};


router.post('/intiatePayment',applyJWTConditionally, InitPayment);
router.post('/createSubscription',applyJWTConditionally, createSubscription);

router.post('/webhook', webhook,   bodyParser.raw({ type: 'application/json' }), // Middleware to parse raw body
);
router.get('/getSubscription/:id', getSubscription);
router.get('/getSubscriptions', getSubscriptions);




async function createSubscription(req: Request, res: Response) {
  try {
    const result = await pay.createSubscription(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}

async function getSubscription(req: Request, res: Response) {
  try {
    const result = await pay.getSubscription(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}


async function getSubscriptions(req: Request, res: Response) {
  try {
    const result = await pay.getSubscriptions();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}


async function webhook(req: Request, res: Response) {
  try {
    const result = await pay.HandleWebhook(req);
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}

async function InitPayment(req: Request, res: Response) {
  try {
    const result = await pay.InitPayment(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error verifying phone', error });
  }
}

export default router;
