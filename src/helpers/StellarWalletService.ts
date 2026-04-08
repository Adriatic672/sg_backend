import { Keypair, Server, Networks } from 'stellar-sdk';
import { Stellar } from './Stellar';

export class StellarWalletService {
  private stellar: Stellar;
  private server: Server;

  constructor() {
    this.stellar = new Stellar();
    this.server = new Server('https://horizon-testnet.stellar.org/');
  }

  /**
   * Generate a new Stellar keypair for a user
   */
  generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret()
    };
  }

  /**
   * Create a Stellar account on the network
   * @param publicKey The public key of the account to create
   */
  async createAccount(publicKey: string): Promise<boolean> {
    try {
      // Use the escrow account to fund the new account
      const escrowSecret = process.env.ESCROW_SECRET_KEY;
      if (!escrowSecret) {
        throw new Error('Stellar escrow secret not configured');
      }

      // Use the sponsorAccount method with escrow as both sender and receiver
      const result = await this.stellar.sponsorAccount(publicKey, escrowSecret, true);
      return result.status === 200;
    } catch (error) {
      console.error('Failed to create Stellar account:', error);
      return false;
    }
  }

  /**
   * Check if a Stellar account exists and is funded
   * @param publicKey The public key to check
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get account balance for a Stellar public key
   * @param publicKey The public key to check
   */
  async getBalance(publicKey: string): Promise<string> {
    try {
      return await this.stellar.getBalance(publicKey, 'SBX', this.stellar.betTokenIssuer);
    } catch (error) {
      return '0';
    }
  }

  /**
   * Transfer SBX tokens between Stellar accounts
   * @param fromSecret The secret key of the sender
   * @param toPublicKey The public key of the recipient
   * @param amount The amount to transfer
   * @param memo Optional memo for the transaction
   */
  async transferSBX(fromSecret: string, toPublicKey: string, amount: string, memo?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const senderKeypair = Keypair.fromSecret(fromSecret);

      const result = await this.stellar.makePayment({
        senderKeyPair: senderKeypair,
        recipientPublicKey: toPublicKey,
        assetCode: 'SBX',
        assetIssuer: this.stellar.betTokenIssuer,
        amount: amount,
        memo: memo || 'Transfer'
      });

      if (result && result !== 'failed') {
        return {
          success: true,
          transactionId: result,
        };
      } else {
        return {
          success: false,
          error: 'Transfer failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Withdraw SBX tokens to an external Stellar account
   * @param fromSecret The secret key of the user
   * @param toPublicKey The external public key to send to
   * @param amount The amount to withdraw
   */
  async withdrawSBX(fromSecret: string, toPublicKey: string, amount: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    return this.transferSBX(fromSecret, toPublicKey, amount, 'Withdrawal');
  }
}