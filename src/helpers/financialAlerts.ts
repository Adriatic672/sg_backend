import AdminSettings from '../models/admin.settings.model';
import { logger } from '../utils/logger';

const settings = new AdminSettings();

export async function checkFinancialAlert(data: {
  userId:    string;
  operation: 'KES_WITHDRAWAL' | 'USD_WITHDRAWAL' | 'TRANSFER';
  amount:    number;
  currency:  'KES' | 'USD' | 'GEMS';
  reference?: string;
  username?:  string;
}) {
  try {
    const thresholdKey = data.currency === 'KES'
      ? 'financial_alert_threshold_kes'
      : 'financial_alert_threshold_usd';

    const threshold = await settings.getSettingNumber(
      thresholdKey,
      data.currency === 'KES' ? 50000 : 500
    );

    if (data.amount < threshold) return;

    logger.warn('FINANCIAL_ALERT_TRIGGERED', {
      operation:  data.operation,
      userId:     data.userId,
      username:   data.username,
      amount:     data.amount,
      currency:   data.currency,
      reference:  data.reference,
      threshold,
    });

    // Admin push notification (fire-and-forget)
    try {
      const Model = require('./model').default;
      const m = new Model();
      // Notify all admin users via app notification
      const admins: any = await m.callQuerySafe(
        `SELECT user_id FROM admin_users WHERE status = 'active' LIMIT 20`
      );
      for (const admin of admins || []) {
        m.sendAppNotification(
          admin.user_id,
          'FINANCIAL_ALERT',
          data.operation,
          data.amount.toString(),
          data.userId,
          data.reference || '',
          'WALLET'
        );
      }
    } catch (e) {
      logger.warn('financialAlerts: admin notify failed', { e });
    }
  } catch (error) {
    logger.error('checkFinancialAlert error', error);
  }
}
