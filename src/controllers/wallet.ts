import express, { Request, Response } from 'express';
import Payments from '../models/wallet.model';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import bodyParser from 'body-parser';
import { financialLimiter } from '../helpers/rateLimiter';
import { validate } from '../helpers/validate';
import { idempotencyCheck } from '../helpers/idempotency';
import { checkFinancialAlert } from '../helpers/financialAlerts';
import { kesWithdrawSchema, withdrawRequestSchema, transferRequestSchema } from '../helpers/validators/financial.validators';

const router = express.Router();
const pay = new Payments();

const applyJWTConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};
const applyJWTAccessConditionally = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyTokenAccess(req, res, next);
};

const logCount = (req: Request, res: Response, next: any) => {
  // Middleware to log the number of requests
  pay.handleUserLogin(req.body);
  console.log(`Request Count: ${req.method} ${req.originalUrl}`);
  next();
};

router.post('/intiatePayment', applyJWTConditionally, InitPayment);
router.post('/webhook', webhook, bodyParser.raw({ type: 'application/json' }), // Middleware to parse raw body
);
router.post('/webhook_rel', webhookRel);
router.post('/webhook_gempay', webhookGempay);

router.get('/getBalance', applyJWTConditionally, logCount, getBalance);
router.post('/accountStatement', applyJWTConditionally, accountStatement);
router.post('/depositRequest', applyJWTConditionally, depositRequest);
router.post('/transferRequest', applyJWTConditionally, financialLimiter, logCount, validate(transferRequestSchema), transferRequest);
router.get('/getWallets', applyJWTConditionally, getWallets);
router.get('/getWalletByUserName/:id', applyJWTConditionally, getWalletByUserName);
router.get('/getPaymentTypes', applyJWTConditionally, getPaymentTypes);
router.get('/queryPaymentTypes', applyJWTConditionally, getPaymentTypesv2);

router.get('/getSubscriptions', applyJWTConditionally, getSubscriptions);
router.post('/addPaymentMethod', applyJWTConditionally, addPaymentMethod);
router.get('/getUserPaymentMethods', applyJWTConditionally, getUserPaymentMethods);
router.get('/deletePaymentMethod/:id', applyJWTConditionally, deletePaymentMethod);

router.post('/validatAccount', applyJWTConditionally, validateUserAccount);
router.post('/setTransactionPin', applyJWTConditionally, setTransactionPin);
router.post('/withdrawRequest', applyJWTConditionally, financialLimiter, idempotencyCheck('USD_WITHDRAWAL'), validate(withdrawRequestSchema), withdrawRequest);
router.post('/kesWithdraw',     applyJWTConditionally, financialLimiter, idempotencyCheck('KES_WITHDRAWAL'), validate(kesWithdrawSchema),     kesWithdraw);
router.get('/myKesWithdrawals', applyJWTConditionally, getMyKesWithdrawals);
router.post('/resetTransactionPin', applyJWTConditionally, resetTransactionPin);
router.post('/getExchangeRate', applyJWTConditionally, getExchangeRate);
router.get('/getTransactionById/:id', getTransactionById);
router.get('/exportTransactions', applyJWTConditionally, exportTransactionsCSV);
router.get('/myUsdWithdrawals', applyJWTConditionally, getMyUsdWithdrawals);
 router.post('/pinlogin', applyJWTConditionally, async (req: Request, res: Response) => {
  try {
    const result = await pay.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error during login', error });
  }
});

 
async function getTransactionById(req: Request, res: Response) {
  try {
    const result = await pay.getTransactionById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transaction by ID', error });
  }
}
async function withdrawRequest(req: Request, res: Response) {
  try {
    pay.logOperation("TRANSFER_REQUEST", req.body.userId, req.body.currency, req.body)
    const result = await pay.transferRequest(req.body);
    pay.logOperation("TRANSFER_RESPONSE", req.body.userId, req.body.currency, result)
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error processing withdrawal request', error });
  }
}
// POST /wallet/kesWithdraw
// Body: { amount: number, msisdn: string, pin: string }
// Withdraws from the creator's KES balance_available via M-Pesa B2C.
async function kesWithdraw(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.user_id || req.body.userId;
    if (!userId) return res.status(401).json({ status: 401, message: 'Unauthorized' });

    pay.logOperation('KES_WITHDRAW_REQUEST', userId, 'KES', req.body);
    const result = await pay.kesWithdraw({ ...req.body, userId });
    pay.logOperation('KES_WITHDRAW_RESPONSE', userId, 'KES', result);

    if (result.status === 200) {
      checkFinancialAlert({ userId, operation: 'KES_WITHDRAWAL', amount: req.body.amount, currency: 'KES' });
    }

    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error processing KES withdrawal', error });
  }
}

// GET /wallet/myKesWithdrawals
// Returns the authenticated creator's KES withdrawal history.
async function getMyKesWithdrawals(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.user_id;
    if (!userId) return res.status(401).json({ status: 401, message: 'Unauthorized' });
    const result = await pay.getMyKesWithdrawals(userId);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching KES withdrawals', error });
  }
}

async function getExchangeRate(req: Request, res: Response) {
  try {
    const result = await pay.getExchangeRate(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching exchange rate', error });
  }
}
async function validateUserAccount(req: Request, res: Response) {
  try {
    const result = await pay.validateUserAccount(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error validating user account', error });
  }
}

async function setTransactionPin(req: Request, res: Response) {
  try {
    const result = await pay.setTransactionPin(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error setting transaction PIN', error });
  }
}

async function resetTransactionPin(req: Request, res: Response) {
  try {
    const result = await pay.resetTransactionPIN(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error resetting transaction PIN', error });
  }
}

async function deletePaymentMethod(req: Request, res: Response) {
  try {
    const result = await pay.deletePaymentMethod(req.params.id, req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error deleting payment method', error });
  }
}

async function addPaymentMethod(req: Request, res: Response) {
  try {
    const result = await pay.addPaymentMethod(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error adding payment method', error });
  }
}

async function getUserPaymentMethods(req: Request, res: Response) {
  try {
    const result = await pay.getUserPaymentMethods(req.query, req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment methods', error });
  }
}



async function getPaymentTypesv2(req: Request, res: Response) {
  try {
    const iso_code = typeof req.query.iso_code === 'string' ? req.query.iso_code : 'ALL';
    const operation = typeof req.query.operation === 'string' ? req.query.operation : 'ALL';
    const result = await pay.getPaymentTypesv2(operation, iso_code);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment methods', error });
  }
}

async function getPaymentTypes(req: Request, res: Response) {
  try {
    const iso_code = typeof req.query.iso_code === 'string' ? req.query.iso_code : 'ALL';
    const operation = typeof req.query.operation === 'string' ? req.query.operation : 'ALL';
    const result = await pay.getPaymentTypes(operation, iso_code);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment methods', error });
  }
}
async function getWalletByUserName(req: Request, res: Response) {
  try {
    const result = await pay.getWalletByUserName(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wallet by username', error });
  }
}

async function webhookRel(req: Request, res: Response) {
  try {
    const result = await pay.webhookRel(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching balance', error });
  }
}

async function webhookGempay(req: Request, res: Response) {
  try {
    const expectedToken = process.env.GEMPAY_WEBHOOK_TOKEN;
    if (expectedToken) {
      const suppliedToken = req.headers['x-gempay-token']
        || req.headers['x-webhook-token']
        || req.headers.authorization?.replace('Bearer ', '');
      if (suppliedToken !== expectedToken) {
        return res.status(401).json({ status: 401, message: 'Invalid webhook token' });
      }
    }

    const result = await pay.webhookGempay(req.body);
    res.status(result.status).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error processing Gempay webhook', error });
  }
}

async function getBalance(req: Request, res: Response) {
  try {
    const result = await pay.getWalletById(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching balance', error });
  }
}

async function accountStatement(req: Request, res: Response) {
  try {
    const result = await pay.getTransactionStatement(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching account statement', error });
  }
}

async function depositRequest(req: Request, res: Response) {
  try {
    const result = await pay.depositRequest(req.body);
    const status = result.status === 401 ? 400 : result.status || 200;
    res.status(status).json({ ...result, status });
  } catch (error) {
    res.status(500).json({ message: 'Error processing deposit request', error });
  }
}

async function transferRequest(req: Request, res: Response) {
  try {
    const result = await pay.transferRequest(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error processing transfer request', error });
  }
}

async function getWallets(req: Request, res: Response) {
  try {
    const result = await pay.GetWallet(req.body.userId, "USD");
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wallets', error });
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

async function getMyUsdWithdrawals(req: Request, res: Response) {
  try {
    const result = await pay.getMyUsdWithdrawals(req.body.userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching USD withdrawal history', error });
  }
}

async function exportTransactionsCSV(req: Request, res: Response) {
  try {
    const csv = await pay.exportTransactionsCSV({
      userId: req.body.userId,
      currency: req.query.currency as string || 'USD'
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Error exporting transactions CSV', error });
  }
}

export default router;
