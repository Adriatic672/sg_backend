-- Delay monitoring columns on campaign invites.
-- delay_flagged = 1 once the cron has detected and notified about the overdue submission.
-- Prevents duplicate notifications on subsequent runs.
ALTER TABLE act_campaign_invites
  ADD COLUMN delay_flagged    TINYINT(1)  NOT NULL DEFAULT 0   AFTER completed_at,
  ADD COLUMN delay_flagged_at DATETIME    DEFAULT NULL         AFTER delay_flagged;

-- Notification template shown to a creator whose submission is overdue.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'CAMPAIGN_DELAY_CREATOR',
  'Submission Overdue',
  'Hi {name}, your submission for a campaign is overdue. Please submit your content as soon as possible to avoid affecting your reliability score.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

-- Internal alert sent to admin users when overdue invites are detected.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'CAMPAIGN_DELAY_ADMIN',
  'Campaign Delay Detected',
  'Creator {name} has an overdue submission on campaign {reason}. Please follow up.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

-- Alert sent to the brand that owns the campaign when a creator is overdue.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'CAMPAIGN_DELAY_BRAND',
  'Creator Submission Overdue',
  'A creator on your campaign "{reason}" has not submitted their content by the deadline. You can follow up from your campaign dashboard.',
  'ALL',
  'CAMPAIGN'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);
