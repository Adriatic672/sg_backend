import { StellarWalletService } from './StellarWalletService';
import BaseModel from './base.model';

// Mock mode for sandbox - auto-creates wallets in development
const MOCK_MODE = process.env.STELLAR_MOCK_MODE === 'true' || process.env.NODE_ENV === 'development';

export class UserStellarService extends BaseModel {
  private stellarWalletService: StellarWalletService;

  constructor() {
    super();
    this.stellarWalletService = new StellarWalletService();
  }

  /**
   * Create a Stellar wallet for a user
   * @param userId The user ID
   */
  async createUserStellarWallet(userId: string): Promise<{ success: boolean; publicKey?: string; error?: string }> {
    try {
      // Check if user already has a Stellar wallet
      const existingWallet = await this.getUserStellarWallet(userId);
      if (existingWallet) {
        return {
          success: true,
          publicKey: existingWallet.stellar_public_key,
        };
      }

      // Generate new keypair
      const { publicKey, secretKey } = this.stellarWalletService.generateKeypair();

      // Create the account on Stellar network
      const accountCreated = await this.stellarWalletService.createAccount(publicKey);
      if (!accountCreated) {
        return {
          success: false,
          error: 'Failed to create Stellar account'
        };
      }

      // Store in database (encrypt the secret key)
      const encryptedSecret = this.encryptSecretKey(secretKey);
      await this.saveUserStellarWallet(userId, publicKey, encryptedSecret);

      return {
        success: true,
        publicKey,
      };
    } catch (error) {
      console.error('Failed to create user Stellar wallet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user's Stellar wallet information
   * @param userId The user ID
   */
  async getUserStellarWallet(userId: string): Promise<{ stellar_public_key: string; stellar_secret_key: string; stellar_wallet_created: Date } | null> {
    // MOCK MODE: In sandbox, generate a mock wallet if none exists
    if (MOCK_MODE) {
      console.log(`[MOCK] Generating mock wallet for user: ${userId}`);
      const mockKeypair = this.stellarWalletService.generateKeypair();
      return {
        stellar_public_key: mockKeypair.publicKey,
        stellar_secret_key: mockKeypair.secretKey,
        stellar_wallet_created: new Date(),
      };
    }
    
    try {
      const query = `SELECT stellar_public_key, stellar_secret_key, stellar_wallet_created FROM users WHERE user_id = ? AND stellar_public_key IS NOT NULL`;
      const result = await this.callParameterizedQuery(query, [userId]) as any[];

      if (result.length > 0) {
        const wallet = result[0];
        return {
          stellar_public_key: wallet.stellar_public_key,
          stellar_secret_key: this.decryptSecretKey(wallet.stellar_secret_key),
          stellar_wallet_created: wallet.stellar_wallet_created,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get user Stellar wallet:', error);
      return null;
    }
  }

  /**
   * Get user's Stellar balance
   * @param userId The user ID
   */
  async getUserStellarBalance(userId: string): Promise<string> {
    try {
      const wallet = await this.getUserStellarWallet(userId);
      if (!wallet) {
        return '0';
      }

      return await this.stellarWalletService.getBalance(wallet.stellar_public_key);
    } catch (error) {
      console.error('Failed to get user Stellar balance:', error);
      return '0';
    }
  }

  /**
   * Transfer SBX tokens from user's Stellar wallet
   * @param userId The user ID
   * @param toPublicKey The recipient's public key
   * @param amount The amount to transfer
   * @param memo Optional memo
   */
  async transferFromUserWallet(userId: string, toPublicKey: string, amount: string, memo?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const wallet = await this.getUserStellarWallet(userId);
      if (!wallet) {
        return {
          success: false,
          error: 'User does not have a Stellar wallet'
        };
      }

      return await this.stellarWalletService.transferSBX(wallet.stellar_secret_key, toPublicKey, amount, memo);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed'
      };
    }
  }

  /**
   * Withdraw SBX tokens to external wallet
   * @param userId The user ID
   * @param toPublicKey The external public key
   * @param amount The amount to withdraw
   */
  async withdrawFromUserWallet(userId: string, toPublicKey: string, amount: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    return this.transferFromUserWallet(userId, toPublicKey, amount, 'Withdrawal');
  }

  /**
   * Save user's Stellar wallet to database
   * @param userId The user ID
   * @param publicKey The Stellar public key
   * @param encryptedSecret The encrypted secret key
   */
  private async saveUserStellarWallet(userId: string, publicKey: string, encryptedSecret: string): Promise<void> {
    const query = `
      UPDATE users
      SET stellar_public_key = ?, stellar_secret_key = ?, stellar_wallet_created = NOW()
      WHERE user_id = ?
    `;
    await this.callParameterizedQuery(query, [publicKey, encryptedSecret, userId]);
  }

  /**
   * Encrypt the Stellar secret key (basic encryption - in production use proper encryption)
   * @param secretKey The secret key to encrypt
   */
  private encryptSecretKey(secretKey: string): string {
    // TODO: Implement proper encryption in production
    // For now, using a simple base64 encoding as placeholder
    return Buffer.from(secretKey).toString('base64');
  }

  /**
   * Decrypt the Stellar secret key
   * @param encryptedSecret The encrypted secret key
   */
  private decryptSecretKey(encryptedSecret: string): string {
    // TODO: Implement proper decryption in production
    // For now, using a simple base64 decoding as placeholder
    return Buffer.from(encryptedSecret, 'base64').toString();
  }
}