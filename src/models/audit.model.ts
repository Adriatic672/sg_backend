import Model from '../helpers/model';
import { logger } from '../utils/logger';

export default class AuditModel extends Model {

  async logAdminAction(data: {
    adminUserId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }) {
    try {
      await this.insertData('admin_audit_log', {
        admin_user_id: data.adminUserId,
        action:        data.action,
        target_type:   data.targetType  || null,
        target_id:     data.targetId    || null,
        details:       data.details     ? JSON.stringify(data.details) : null,
        ip_address:    data.ipAddress   || null,
        created_at:    new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    } catch (error) {
      logger.error('AuditModel.logAdminAction error', error);
    }
  }

  async getAdminAuditLog(params: {
    page?:        number;
    limit?:       number;
    adminUserId?: string;
    action?:      string;
    startDate?:   string;
    endDate?:     string;
  } = {}) {
    try {
      const { page = 1, limit = 50, adminUserId, action, startDate, endDate } = params;
      const offset = (page - 1) * limit;

      const where: string[] = [];
      const vals:  any[]    = [];

      if (adminUserId) { where.push('a.admin_user_id = ?'); vals.push(adminUserId); }
      if (action)      { where.push('a.action = ?');        vals.push(action); }
      if (startDate)   { where.push('a.created_at >= ?');   vals.push(startDate); }
      if (endDate)     { where.push('a.created_at <= ?');   vals.push(endDate); }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows, countRows]: any = await Promise.all([
        this.callQuerySafe(
          `SELECT a.*, u.username, u.email
           FROM admin_audit_log a
           LEFT JOIN admin_users u ON a.admin_user_id = u.user_id
           ${whereClause}
           ORDER BY a.created_at DESC
           LIMIT ? OFFSET ?`,
          [...vals, limit, offset]
        ),
        this.callQuerySafe(
          `SELECT COUNT(*) AS total FROM admin_audit_log a ${whereClause}`,
          vals
        ),
      ]);

      return this.makeResponse(200, 'Audit log', {
        logs:  rows,
        total: countRows?.[0]?.total || 0,
        page,
        limit,
        pages: Math.ceil((countRows?.[0]?.total || 0) / limit),
      });
    } catch (error) {
      logger.error('AuditModel.getAdminAuditLog error', error);
      return this.makeResponse(500, 'Error fetching audit log');
    }
  }
}
