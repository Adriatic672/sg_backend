-- Performance indexes for hot query paths.
-- Compatible with MySQL versions that do not support ADD INDEX IF NOT EXISTS.

-- Campaign payment configs: cron clearance query.
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_payment_config') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_payment_config'
     AND COLUMN_NAME IN ('payment_status', 'clearance_date')) = 2
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_payment_config'
     AND INDEX_NAME = 'idx_cpc_status_clearance') = 0,
  'ALTER TABLE campaign_payment_config ADD INDEX idx_cpc_status_clearance (payment_status, clearance_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Campaign invites: delay monitor and auto-approve queries.
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'act_campaign_invites') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'act_campaign_invites'
     AND COLUMN_NAME = 'action_status') = 1
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'act_campaign_invites'
     AND INDEX_NAME = 'idx_aci_status') = 0,
  'ALTER TABLE act_campaign_invites ADD INDEX idx_aci_status (action_status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'act_campaign_invites') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'act_campaign_invites'
     AND COLUMN_NAME IN ('campaign_id', 'user_id')) = 2
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'act_campaign_invites'
     AND INDEX_NAME = 'idx_aci_campaign_user') = 0,
  'ALTER TABLE act_campaign_invites ADD INDEX idx_aci_campaign_user (campaign_id, user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- KES withdrawal requests: webhook lookup and user history.
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'kes_withdrawal_requests') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'kes_withdrawal_requests'
     AND COLUMN_NAME = 'user_id') = 1
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'kes_withdrawal_requests'
     AND INDEX_NAME = 'idx_kwr_user_id') = 0,
  'ALTER TABLE kes_withdrawal_requests ADD INDEX idx_kwr_user_id (user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'kes_withdrawal_requests') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'kes_withdrawal_requests'
     AND COLUMN_NAME = 'status') = 1
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'kes_withdrawal_requests'
     AND INDEX_NAME = 'idx_kwr_status') = 0,
  'ALTER TABLE kes_withdrawal_requests ADD INDEX idx_kwr_status (status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Wallet transactions: statement queries.
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wl_transactions') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wl_transactions'
     AND COLUMN_NAME IN ('user_id', 'currency')) = 2
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wl_transactions'
     AND INDEX_NAME = 'idx_wt_user_currency') = 0,
  'ALTER TABLE wl_transactions ADD INDEX idx_wt_user_currency (user_id, currency)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wl_transactions') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wl_transactions'
     AND COLUMN_NAME = 'created_at') = 1
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'wl_transactions'
     AND INDEX_NAME = 'idx_wt_created') = 0,
  'ALTER TABLE wl_transactions ADD INDEX idx_wt_created (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Campaign escrow: admin dashboard join.
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_escrow') > 0
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_escrow'
     AND COLUMN_NAME = 'status') = 1
  AND
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_escrow'
     AND INDEX_NAME = 'idx_ce_status') = 0,
  'ALTER TABLE campaign_escrow ADD INDEX idx_ce_status (status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Admin audit log is already indexed in 048.
-- Idempotency key purging is handled by the cron job added in cron.ts.
