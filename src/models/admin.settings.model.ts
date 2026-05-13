import Model from '../helpers/model';
import { getItem, setItem } from '../helpers/connectRedis';
import { logger } from '../utils/logger';

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'admin_setting:';

export default class AdminSettings extends Model {
  constructor() {
    super();
  }

  async getSetting(key: string): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const cached = await getItem(cacheKey);
    if (cached !== null) return cached;

    const rows: any = await this.callQuerySafe(
      `SELECT setting_value FROM admin_settings WHERE setting_key = ? LIMIT 1`,
      [key]
    );
    if (!rows || rows.length === 0) return null;

    const value = rows[0].setting_value;
    await setItem(cacheKey, value, CACHE_TTL);
    return value;
  }

  async getSettingNumber(key: string, fallback: number): Promise<number> {
    const val = await this.getSetting(key);
    if (val === null) return fallback;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  }

  async getAllSettings() {
    try {
      const rows: any = await this.callQuerySafe(
        `SELECT setting_key, setting_value, setting_type, description, updated_by, updated_at
         FROM admin_settings ORDER BY setting_key`
      );
      return this.makeResponse(200, 'Settings retrieved', rows);
    } catch (error) {
      logger.error('AdminSettings.getAllSettings error:', error);
      return this.makeResponse(500, 'Error retrieving settings');
    }
  }

  async updateSetting(data: any) {
    const { setting_key, setting_value, admin_user_id } = data;
    if (!setting_key || setting_value === undefined) {
      return this.makeResponse(400, 'setting_key and setting_value are required');
    }

    const existing: any = await this.callQuerySafe(
      `SELECT id FROM admin_settings WHERE setting_key = ? LIMIT 1`,
      [setting_key]
    );
    if (!existing || existing.length === 0) {
      return this.makeResponse(404, `Setting '${setting_key}' not found`);
    }

    try {
      await this.updateData('admin_settings', `setting_key = '${setting_key}'`, {
        setting_value: String(setting_value),
        updated_by: admin_user_id || null,
      });

      // Bust cache so next read picks up the new value.
      await setItem(`${CACHE_PREFIX}${setting_key}`, String(setting_value), CACHE_TTL);

      logger.info('AdminSettings updated', { setting_key, setting_value, admin_user_id });
      return this.makeResponse(200, 'Setting updated');
    } catch (error) {
      logger.error('AdminSettings.updateSetting error:', error);
      return this.makeResponse(500, 'Error updating setting');
    }
  }
}
