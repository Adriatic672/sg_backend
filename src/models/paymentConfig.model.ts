import Model from "../helpers/model";
import { logger } from '../utils/logger';

export default class PaymentConfig extends Model {

  constructor() {
    super();
  }

  /**
   * Create or update payment configuration for a campaign/job
   */
  async createOrUpdatePaymentConfig(data: {
    campaign_id: string;
    job_id?: string;
    compensation_type: 'CASH' | 'PRODUCT' | 'CASH_AND_PRODUCT';
    currency: 'KES' | 'USD';
    payment_method: 'M_PESA' | 'BANK' | 'WALLET' | 'STRIPE';
    amount: number;
    fee?: number;
    net_amount?: number;
  }) {
    try {
      const { campaign_id, job_id, compensation_type, currency, payment_method, amount, fee = 0, net_amount } = data;
      const netAmount = net_amount || (amount - fee);

      // Check if config exists
      const existing = await this.selectDataQuery(
        'campaign_payment_config',
        `campaign_id = '${campaign_id}'`
      );

      if (existing.length > 0) {
        // Update existing
        await this.updateData(
          'campaign_payment_config',
          `campaign_id = '${campaign_id}'`,
          {
            job_id,
            compensation_type,
            currency,
            payment_method,
            amount,
            fee,
            net_amount: netAmount,
            updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
          }
        );
        return this.makeResponse(200, "Payment config updated", { campaign_id });
      } else {
        // Create new
        await this.insertData('campaign_payment_config', {
          campaign_id,
          job_id,
          compensation_type,
          currency,
          payment_method,
          amount,
          fee,
          net_amount: netAmount,
          payment_status: 'PENDING',
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        });
        return this.makeResponse(201, "Payment config created", { campaign_id });
      }
    } catch (error) {
      logger.error("[PaymentConfig] Error creating/updating config:", error);
      return this.makeResponse(500, "Error creating payment config: " + error);
    }
  }

  /**
   * Get payment config for a campaign
   */
  async getPaymentConfig(campaign_id: string) {
    try {
      const result = await this.selectDataQuery(
        'campaign_payment_config',
        `campaign_id = '${campaign_id}'`
      );
      if (result.length === 0) {
        return this.makeResponse(404, "Payment config not found");
      }
      return this.makeResponse(200, "Payment config found", result[0]);
    } catch (error) {
      logger.error("[PaymentConfig] Error getting config:", error);
      return this.makeResponse(500, "Error getting payment config: " + error);
    }
  }

  /**
   * Update payment status (for withdrawals, etc.)
   */
  async updatePaymentStatus(
    campaign_id: string,
    status: 'PENDING' | 'PROCESSING' | 'AVAILABLE' | 'WITHDRAWN' | 'FAILED',
    payment_reference?: string
  ) {
    try {
      const updateData: any = {
        payment_status: status,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      if (payment_reference) {
        updateData.payment_reference = payment_reference;
      }

      if (status === 'WITHDRAWN') {
        updateData.withdrawn_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // Update wallet withdrawn amount
        const config = await this.getPaymentConfig(campaign_id);
        if (config.status === 200 && config.data) {
          const wallet = await this.selectDataQuery(
            'user_wallets',
            `user_id = (SELECT user_id FROM campaigns WHERE campaign_id = '${campaign_id}') AND asset = '${config.data.currency}'`
          );
          if (wallet.length > 0) {
            const currentWithdrawn = parseFloat(wallet[0].total_withdrawn || 0);
            await this.updateData(
              'user_wallets',
              `wallet_id = '${wallet[0].wallet_id}'`,
              { total_withdrawn: currentWithdrawn + config.data.net_amount }
            );
          }
        }
      }

      await this.updateData(
        'campaign_payment_config',
        `campaign_id = '${campaign_id}'`,
        updateData
      );

      return this.makeResponse(200, "Payment status updated", { campaign_id, status });
    } catch (error) {
      logger.error("[PaymentConfig] Error updating status:", error);
      return this.makeResponse(500, "Error updating payment status: " + error);
    }
  }

  /**
   * Admin override transaction status
   */
  async adminOverrideTransaction(
    trans_id: string,
    admin_id: string,
    override_status: 'SUCCESS' | 'FAILED' | 'PENDING',
    notes: string
  ) {
    try {
      // Get current transaction
      const transaction = await this.selectDataQuery(
        'wl_transactions',
        `trans_id = '${trans_id}'`
      );

      if (transaction.length === 0) {
        return this.makeResponse(404, "Transaction not found");
      }

      const currentTx = transaction[0];

      // Update transaction with override
      await this.updateData(
        'wl_transactions',
        `trans_id = '${trans_id}'`,
        {
          status: override_status,
          system_status: override_status,
          admin_override_notes: notes,
          overridden_by: admin_id,
          overridden_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        }
      );

      // If overriding to FAILED, reverse the balance changes
      if (override_status === 'FAILED' && currentTx.status === 'SUCCESS') {
        const crWallet = await this.getWalletById(currentTx.cr_wallet_id);
        const drWallet = await this.getWalletById(currentTx.dr_wallet_id);

        if (crWallet) {
          await this.updateData(
            'user_wallets',
            `wallet_id = '${currentTx.cr_wallet_id}'`,
            { 
              balance: parseFloat(crWallet.balance) - currentTx.amount,
              available_balance: parseFloat(crWallet.available_balance || 0) - currentTx.amount,
              total_earned: parseFloat(crWallet.total_earned || 0) - currentTx.amount
            }
          );
        }

        if (drWallet) {
          await this.updateData(
            'user_wallets',
            `wallet_id = '${currentTx.dr_wallet_id}'`,
            { 
              balance: parseFloat(drWallet.balance) + currentTx.amount,
              available_balance: parseFloat(drWallet.available_balance || 0) + currentTx.amount,
              total_withdrawn: parseFloat(drWallet.total_withdrawn || 0) - currentTx.amount
            }
          );
        }
      }

      return this.makeResponse(200, "Transaction overridden", { 
        trans_id, 
        override_status, 
        overridden_by: admin_id 
      });
    } catch (error) {
      logger.error("[PaymentConfig] Error overriding transaction:", error);
      return this.makeResponse(500, "Error overriding transaction: " + error);
    }
  }

  /**
   * Get wallet with states for a user
   */
  async getWalletWithStates(userId: string, currency: string = 'USD') {
    try {
      const wallet = await this.selectDataQuery(
        'user_wallets',
        `user_id = '${userId}' AND asset = '${currency}'`
      );

      if (wallet.length === 0) {
        return this.makeResponse(404, "Wallet not found");
      }

      const w = wallet[0];
      return this.makeResponse(200, "Wallet found", {
        wallet_id: w.wallet_id,
        user_id: w.user_id,
        asset: w.asset,
        balance: w.balance,
        pending_balance: w.pending_balance || 0,
        available_balance: w.available_balance || 0,
        total_earned: w.total_earned || 0,
        total_withdrawn: w.total_withdrawn || 0,
        status: w.status
      });
    } catch (error) {
      logger.error("[PaymentConfig] Error getting wallet:", error);
      return this.makeResponse(500, "Error getting wallet: " + error);
    }
  }
}
