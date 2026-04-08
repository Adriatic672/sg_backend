import { Router, Request, Response } from 'express';
import { UserStellarService } from '../helpers/UserStellarService';
import { JWTMiddleware } from '../helpers/jwt.middleware';
import { logger } from '../utils/logger';

const router = Router();
const userStellarService = new UserStellarService();

// Middleware wrapper for JWT verification
const jwtMiddleware = (req: Request, res: Response, next: any) => {
  JWTMiddleware.verifyToken(req, res, next);
};

// Get user's Stellar wallet details
router.get('/wallet', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.user_id;
    
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User not authenticated'
      });
    }

    const wallet = await userStellarService.getUserStellarWallet(userId);
    
    if (!wallet) {
      return res.status(404).json({
        status: false,
        message: 'Stellar wallet not found. Please create a wallet first.'
      });
    }

    // Get wallet balance
    const balance = await userStellarService.getUserStellarBalance(userId);
    
    return res.status(200).json({
      status: true,
      message: 'Wallet retrieved successfully',
      data: {
        public_key: wallet.stellar_public_key,
        balance: balance,
        created_at: wallet.stellar_wallet_created
      }
    });
  } catch (error) {
    logger.error('[StellarController] Error getting wallet:', error);
    return res.status(500).json({
      status: false,
      message: 'Error retrieving wallet',
      error: (error as any).message
    });
  }
});

// Create Stellar wallet for user
router.post('/wallet/create', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.user_id;
    
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User not authenticated'
      });
    }

    // Check if wallet already exists
    const existingWallet = await userStellarService.getUserStellarWallet(userId);
    if (existingWallet) {
      return res.status(400).json({
        status: false,
        message: 'Stellar wallet already exists for this user'
      });
    }

    // Create new wallet
    const result = await userStellarService.createUserStellarWallet(userId);
    
    if (result.success) {
      return res.status(201).json({
        status: true,
        message: 'Stellar wallet created successfully',
        data: {
          public_key: result.publicKey
        }
      });
    } else {
      return res.status(500).json({
        status: false,
        message: 'Failed to create Stellar wallet',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('[StellarController] Error creating wallet:', error);
    return res.status(500).json({
      status: false,
      message: 'Error creating wallet',
      error: (error as any).message
    });
  }
});

// Withdraw SBX tokens to external wallet
router.post('/withdraw', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.user_id;
    const { destination_address, amount } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User not authenticated'
      });
    }

    if (!destination_address || !amount) {
      return res.status(400).json({
        status: false,
        message: 'destination_address and amount are required'
      });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        status: false,
        message: 'Amount must be a positive number'
      });
    }

    // Get user's wallet
    const wallet = await userStellarService.getUserStellarWallet(userId);
    if (!wallet) {
      return res.status(404).json({
        status: false,
        message: 'Stellar wallet not found'
      });
    }

    // Get balance
    const balance = await userStellarService.getUserStellarBalance(userId);
    if (parseFloat(balance) < numAmount) {
      return res.status(400).json({
        status: false,
        message: `Insufficient balance. Available: ${balance} SBX, Requested: ${numAmount} SBX`
      });
    }

    // Perform withdrawal
    const result = await userStellarService.transferFromUserWallet(
      userId,
      destination_address,
      amount,
      `Withdrawal to ${destination_address}`
    );

    if (result.success) {
      // Log the transaction
      logger.info(`[StellarWithdrawal] User ${userId} withdrew ${amount} SBX to ${destination_address}. TX: ${result.transactionId}`);
      
      return res.status(200).json({
        status: true,
        message: 'Withdrawal successful',
        data: {
          transaction_id: result.transactionId,
          amount: amount,
          destination: destination_address,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      return res.status(500).json({
        status: false,
        message: 'Withdrawal failed',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('[StellarController] Error processing withdrawal:', error);
    return res.status(500).json({
      status: false,
      message: 'Error processing withdrawal',
      error: (error as any).message
    });
  }
});

// Get wallet balance
router.get('/balance', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.user_id;
    
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User not authenticated'
      });
    }

    const balance = await userStellarService.getUserStellarBalance(userId);
    
    return res.status(200).json({
      status: true,
      message: 'Balance retrieved successfully',
      data: {
        balance: balance,
        currency: 'SBX'
      }
    });
  } catch (error) {
    logger.error('[StellarController] Error getting balance:', error);
    return res.status(500).json({
      status: false,
      message: 'Error retrieving balance',
      error: (error as any).message
    });
  }
});

// Get transaction history
router.get('/transactions', jwtMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.user_id;
    const limit = parseInt(req.query.limit as string) || 10;
    
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'User not authenticated'
      });
    }

    // Get transactions from database
    const db = require('../helpers/db.helper');
    const transactions = await db.executeSafeQueryAsync(
      `SELECT * FROM wl_transactions 
       WHERE user_id = ? 
       ORDER BY created_on DESC 
       LIMIT ?`,
      [userId, limit]
    );

    return res.status(200).json({
      status: true,
      message: 'Transactions retrieved successfully',
      data: transactions
    });
  } catch (error) {
    logger.error('[StellarController] Error getting transactions:', error);
    return res.status(500).json({
      status: false,
      message: 'Error retrieving transactions',
      error: (error as any).message
    });
  }
});

export default router;
