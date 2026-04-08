import express, { Request, Response } from 'express';
import Payments from '../models/payments.model';
import PaymentConfig from '../models/paymentConfig.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import bodyParser from 'body-parser';

const router = express.Router();
const pay = new Payments();
const paymentConfig = new PaymentConfig();

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

// ==================== Payment Config Endpoints ====================

// Create or update payment config for a campaign
router.post('/paymentConfig/create', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const result = await paymentConfig.createOrUpdatePaymentConfig(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error creating payment config', error });
  }
});

// Get payment config for a campaign
router.get('/paymentConfig/:campaign_id', async (req: Request, res: Response) => {
  try {
    const result = await paymentConfig.getPaymentConfig(req.params.campaign_id);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting payment config', error });
  }
});

// Update payment status (for withdrawals, etc.)
router.post('/paymentConfig/updateStatus', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { campaign_id, status, payment_reference } = req.body;
    const result = await paymentConfig.updatePaymentStatus(campaign_id, status, payment_reference);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error updating payment status', error });
  }
});

// Get wallet with states (pending, available, earned, withdrawn)
router.get('/walletWithStates/:userId', async (req: Request, res: Response) => {
  try {
    const { currency } = req.query;
    const result = await paymentConfig.getWalletWithStates(req.params.userId, currency as string);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error getting wallet', error });
  }
});

// Admin override transaction
router.post('/admin/overrideTransaction', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const { trans_id, override_status, notes } = req.body;
    const adminId = (req as any).user?.id || 'admin';
    const result = await paymentConfig.adminOverrideTransaction(trans_id, adminId, override_status, notes);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error overriding transaction', error });
  }
});

export default router;
