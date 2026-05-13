import Model from '../helpers/model';
import { logger } from '../utils/logger';
import AdminSettings from './admin.settings.model';

const settings = new AdminSettings();

export default class Escrow extends Model {
  constructor() {
    super();
  }

  async getSettingNumber(key: string, fallback: number): Promise<number> {
    return settings.getSettingNumber(key, fallback);
  }

  // ── Prefunding ──────────────────────────────────────────────────────────────

  async createEscrowRecord(data: {
    campaign_id: string;
    brand_user_id: string;
    currency: 'KES' | 'USD';
    total_amount: number;
    payment_reference?: string;
  }) {
    const { campaign_id, brand_user_id, currency, total_amount, payment_reference } = data;

    const existing: any = await this.callQuerySafe(
      `SELECT escrow_id, status FROM campaign_escrow WHERE campaign_id = ? LIMIT 1`,
      [campaign_id]
    );
    if (existing && existing.length > 0) {
      return { escrow_id: existing[0].escrow_id, alreadyExists: true };
    }

    const fee_pct = await settings.getSettingNumber('platform_fee_pct', 5);
    const platform_fee_amt = parseFloat((total_amount * fee_pct / 100).toFixed(2));
    const creator_pool = parseFloat((total_amount - platform_fee_amt).toFixed(2));

    const escrow_id = `esc_${this.getRandomString()}`;
    await this.insertData('campaign_escrow', {
      escrow_id,
      campaign_id,
      brand_user_id,
      currency,
      total_amount,
      platform_fee_pct: fee_pct,
      platform_fee_amt,
      creator_pool,
      status: 'funded',
      payment_reference: payment_reference || null,
      funded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    logger.info('Escrow record created', { escrow_id, campaign_id, total_amount, fee_pct });
    return { escrow_id, alreadyExists: false, platform_fee_amt, creator_pool, fee_pct };
  }

  async activateEscrow(campaign_id: string, admin_user_id?: string) {
    await this.updateData('campaign_escrow', `campaign_id = '${campaign_id}'`, {
      status: 'active',
      activated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      confirmed_by: admin_user_id || null,
    });
  }

  // ── Earnings release ─────────────────────────────────────────────────────────

  async releaseCreatorEarning(campaign_id: string, creator_user_id: string, approved_by?: string) {
    const clearance_days = await settings.getSettingNumber('pending_clearance_days', 5);

    const clearance_date = new Date();
    clearance_date.setDate(clearance_date.getDate() + clearance_days);
    const clearance_str = clearance_date.toISOString().slice(0, 19).replace('T', ' ');

    await this.callQuerySafe(
      `UPDATE campaign_payment_config
       SET payment_status = 'PENDING', clearance_date = ?, updated_at = NOW()
       WHERE campaign_id = ? AND creator_user_id = ? AND payment_status = 'PROCESSING'`,
      [clearance_str, campaign_id, creator_user_id]
    );

    logger.info('Creator earning set to PENDING clearance', {
      campaign_id, creator_user_id, clearance_date: clearance_str,
    });
  }

  // ── Clearance cron ───────────────────────────────────────────────────────────
  // Called by the scheduled cron job to move matured PENDING earnings to AVAILABLE.

  async processClearances() {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const due: any = await this.callQuerySafe(
      `SELECT id, campaign_id, creator_user_id, net_amount, currency
       FROM campaign_payment_config
       WHERE payment_status = 'PENDING' AND clearance_date <= ?`,
      [now]
    );

    if (!due || due.length === 0) return { cleared: 0 };

    let cleared = 0;
    for (const row of due) {
      try {
        await this.callQuerySafe(
          `UPDATE campaign_payment_config SET payment_status = 'AVAILABLE', updated_at = NOW()
           WHERE id = ?`,
          [row.id]
        );

        // Push balance from pending → available on the creator's wallet.
        const asset = row.currency || 'KES';
        await this.callQuerySafe(
          `UPDATE user_wallets
           SET balance_pending   = GREATEST(0, balance_pending - ?),
               balance_available = balance_available + ?,
               updated_at        = NOW()
           WHERE user_id = ? AND asset = ?`,
          [row.net_amount, row.net_amount, row.creator_user_id, asset]
        );

        this.sendAppNotification(
          row.creator_user_id, 'EARNINGS_AVAILABLE',
          '', row.net_amount.toString(), '', '', 'WALLET'
        );

        cleared++;
      } catch (err) {
        logger.error('processClearances row error', { id: row.id, err });
      }
    }

    logger.info('processClearances complete', { cleared });
    return { cleared };
  }

  // ── Escrow release on campaign complete ──────────────────────────────────────

  async releaseEscrow(campaign_id: string) {
    const escrow: any = await this.callQuerySafe(
      `SELECT * FROM campaign_escrow WHERE campaign_id = ? LIMIT 1`,
      [campaign_id]
    );
    if (!escrow || escrow.length === 0) return;

    await this.updateData('campaign_escrow', `campaign_id = '${campaign_id}'`, {
      status: 'released',
      released_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
  }

  // ── Admin dashboard queries ──────────────────────────────────────────────────

  async getEscrowSummary() {
    try {
      const summary: any = await this.callQuerySafe(
        `SELECT
           currency,
           COUNT(*)                                AS total_campaigns,
           SUM(total_amount)                       AS total_escrowed,
           SUM(platform_fee_amt)                   AS total_platform_fees,
           SUM(creator_pool)                       AS total_creator_pool,
           SUM(CASE WHEN status='funded'  THEN total_amount ELSE 0 END) AS pending_activation,
           SUM(CASE WHEN status='active'  THEN total_amount ELSE 0 END) AS active_escrow,
           SUM(CASE WHEN status='released' THEN total_amount ELSE 0 END) AS released
         FROM campaign_escrow
         GROUP BY currency`
      );
      return this.makeResponse(200, 'Escrow summary', summary);
    } catch (error) {
      logger.error('Escrow.getEscrowSummary error:', error);
      return this.makeResponse(500, 'Error fetching escrow summary');
    }
  }

  async getReconciliation() {
    try {
      const rows: any = await this.callQuerySafe(`
        SELECT
          ce.escrow_id,
          ce.campaign_id,
          c.title          AS campaign_title,
          ce.currency,
          ce.total_amount,
          ce.platform_fee_amt,
          ce.creator_pool,
          ce.status        AS escrow_status,
          COALESCE(SUM(CASE WHEN cpc.payment_status IN ('PROCESSING','PENDING','AVAILABLE','PAID')
                            THEN cpc.net_amount ELSE 0 END), 0) AS allocated,
          (ce.creator_pool -
           COALESCE(SUM(CASE WHEN cpc.payment_status IN ('PROCESSING','PENDING','AVAILABLE','PAID')
                             THEN cpc.net_amount ELSE 0 END), 0)) AS unallocated,
          COUNT(cpc.id)    AS payment_records
        FROM campaign_escrow ce
        JOIN act_campaigns c ON c.campaign_id = ce.campaign_id
        LEFT JOIN campaign_payment_config cpc ON cpc.campaign_id = ce.campaign_id
        GROUP BY ce.escrow_id
        ORDER BY ce.funded_at DESC
      `);

      const discrepancies = (rows || []).filter((r: any) => r.unallocated < -0.01);

      return this.makeResponse(200, 'Escrow reconciliation', {
        campaigns:        rows || [],
        total_campaigns:  rows?.length || 0,
        discrepancy_count: discrepancies.length,
        discrepancies,
      });
    } catch (error) {
      logger.error('Escrow.getReconciliation error:', error);
      return this.makeResponse(500, 'Error running escrow reconciliation');
    }
  }

  async getEscrowByCampaign(campaign_id: string) {
    try {
      const rows: any = await this.callQuerySafe(
        `SELECT ce.*, c.title, c.status AS campaign_status
         FROM campaign_escrow ce
         JOIN act_campaigns c ON c.campaign_id = ce.campaign_id
         WHERE ce.campaign_id = ? LIMIT 1`,
        [campaign_id]
      );
      if (!rows || rows.length === 0) {
        return this.makeResponse(404, 'No escrow record found for this campaign');
      }
      return this.makeResponse(200, 'Escrow record', rows[0]);
    } catch (error) {
      logger.error('Escrow.getEscrowByCampaign error:', error);
      return this.makeResponse(500, 'Error fetching escrow record');
    }
  }
}
