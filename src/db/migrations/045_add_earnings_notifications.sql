-- Notification templates for the escrow earnings lifecycle.

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'SUBMISSION_APPROVED',
  'Submission Approved',
  'Great news! Your submission for "{reason}" has been approved. KES/USD {amount} is now pending clearance and will be available shortly.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'EARNINGS_AVAILABLE',
  'Earnings Now Available',
  'Your earnings of {amount} from a recent campaign are now available for withdrawal.',
  'ALL',
  'WALLET'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'CAMPAIGN_FUNDED',
  'Campaign Funded',
  'Your campaign has been successfully funded with {amount}. It is now ready to be activated.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);
