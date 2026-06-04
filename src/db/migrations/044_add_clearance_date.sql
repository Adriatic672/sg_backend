-- clearance_date: when a PENDING earning becomes AVAILABLE.
-- Compatible with MySQL versions that do not support ADD COLUMN IF NOT EXISTS.

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_payment_config'
     AND COLUMN_NAME = 'clearance_date') = 0,
  'ALTER TABLE campaign_payment_config ADD COLUMN clearance_date DATETIME DEFAULT NULL AFTER payment_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_payment_config'
     AND COLUMN_NAME = 'creator_user_id') = 0,
  'ALTER TABLE campaign_payment_config ADD COLUMN creator_user_id VARCHAR(100) DEFAULT NULL AFTER campaign_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'campaign_payment_config'
     AND INDEX_NAME = 'idx_clearance') = 0,
  'ALTER TABLE campaign_payment_config ADD INDEX idx_clearance (payment_status, clearance_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
