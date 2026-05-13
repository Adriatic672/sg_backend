-- ── 1. Revision counter on campaign invites ───────────────────────────────────
ALTER TABLE act_campaign_invites
  ADD COLUMN IF NOT EXISTS revision_count TINYINT NOT NULL DEFAULT 0 AFTER action_status;

-- ── 2. New admin settings ─────────────────────────────────────────────────────
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('max_revision_count',    '3', 'number', 'Maximum number of revisions a brand can request per creator per campaign'),
('inaction_timeout_days', '7', 'number', 'Days after creator submits before submission is auto-approved if brand takes no action')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ── 3. Add cancelled to campaign status enum ──────────────────────────────────
ALTER TABLE act_campaigns
  MODIFY COLUMN status ENUM(
    'active','expired','deleted','closed','completed',
    'draft','open_to_applications','cancelled'
  ) NOT NULL DEFAULT 'draft';

-- ── 4. Notification templates ─────────────────────────────────────────────────
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'REVISION_LIMIT_REACHED',
  'Revision Limit Reached',
  'You have reached the maximum number of revisions ({amount}) allowed for this submission. Please approve or reject it.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'SUBMISSION_AUTO_APPROVED',
  'Submission Auto-Approved',
  'Your submission for "{reason}" has been automatically approved after the review period elapsed. Your earnings are now pending clearance.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'CAMPAIGN_CANCELLED',
  'Campaign Cancelled',
  'The campaign "{reason}" has been cancelled. Any escrowed funds have been returned to the brand.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'CAMPAIGN_REFUNDED',
  'Campaign Refund Processed',
  'Your campaign "{reason}" has been cancelled and {amount} has been returned to your wallet.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);
