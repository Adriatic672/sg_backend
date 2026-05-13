import express, { Request, Response } from 'express';
import AdminSettings from '../models/admin.settings.model';
import Escrow from '../models/escrow.model';
import AuditModel from '../models/audit.model';
import { JWTMiddlewareAdmin } from '../helpers/jwt.middleware.admin';

const router = express.Router();
const adminSettings = new AdminSettings();
const escrow = new Escrow();
const audit = new AuditModel();

const requireAdmin = (req: Request, res: Response, next: any) => {
  JWTMiddlewareAdmin.verifyToken(req, res, next);
};

// GET /admin/settings          — list all settings
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const result = await adminSettings.getAllSettings();
  res.status(result.status).json(result);
});

// PUT /admin/settings          — update a single setting
// Body: { setting_key, setting_value }
router.put('/', requireAdmin, async (req: Request, res: Response) => {
  const admin_user_id = (req as any).user?.userId || (req as any).user?.user_id;
  const result = await adminSettings.updateSetting({ ...req.body, admin_user_id });
  if (result.status === 200) {
    audit.logAdminAction({
      adminUserId: admin_user_id,
      action:      'UPDATE_SETTING',
      targetType:  'admin_setting',
      targetId:    req.body.setting_key,
      details:     { new_value: req.body.setting_value },
      ipAddress:   req.ip,
    });
  }
  res.status(result.status).json(result);
});

// GET /admin/settings/escrow-summary  — financial dashboard escrow totals
router.get('/escrow-summary', requireAdmin, async (req: Request, res: Response) => {
  const result = await escrow.getEscrowSummary();
  res.status(result.status).json(result);
});

// GET /admin/settings/escrow/:campaign_id  — escrow detail for one campaign
router.get('/escrow/:campaign_id', requireAdmin, async (req: Request, res: Response) => {
  const result = await escrow.getEscrowByCampaign(req.params.campaign_id);
  res.status(result.status).json(result);
});

// GET /admin/settings/escrow/reconciliation  — cross-check escrow vs payment records
router.get('/escrow/reconciliation', requireAdmin, async (req: Request, res: Response) => {
  const result = await escrow.getReconciliation();
  res.status(result.status).json(result);
});

// GET /admin/settings/auditLog  — paginated admin action log
router.get('/auditLog', requireAdmin, async (req: Request, res: Response) => {
  const { page, limit, adminUserId, action, startDate, endDate } = req.query;
  const result = await audit.getAdminAuditLog({
    page:        page       ? parseInt(page as string)  : 1,
    limit:       limit      ? parseInt(limit as string) : 50,
    adminUserId: adminUserId as string | undefined,
    action:      action     as string | undefined,
    startDate:   startDate  as string | undefined,
    endDate:     endDate    as string | undefined,
  });
  res.status(result.status).json(result);
});

export default router;
