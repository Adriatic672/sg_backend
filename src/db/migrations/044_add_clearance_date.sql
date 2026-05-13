-- clearance_date: when a PENDING earning becomes AVAILABLE.
-- Set at approval time: NOW() + pending_clearance_days from admin_settings.
ALTER TABLE campaign_payment_config
  ADD COLUMN IF NOT EXISTS clearance_date DATETIME DEFAULT NULL AFTER payment_status,
  ADD COLUMN IF NOT EXISTS creator_user_id VARCHAR(100) DEFAULT NULL AFTER campaign_id;

-- Index for the clearance cron job (scans for rows due to clear).
ALTER TABLE campaign_payment_config
  ADD INDEX IF NOT EXISTS idx_clearance (payment_status, clearance_date);
