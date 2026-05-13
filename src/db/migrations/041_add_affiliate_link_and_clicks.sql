-- Add affiliate_link to campaigns table
-- Compatible with MySQL 5.7+ (no IF NOT EXISTS in ADD COLUMN)
SET @dbname = DATABASE();
SET @tablename = 'act_campaigns';
SET @columnname = 'affiliate_link';

SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(500) NULL DEFAULT NULL')
));

PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Click tracking table
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id VARCHAR(100) NOT NULL,
  user_id     VARCHAR(100) NOT NULL,
  clicked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ac_campaign (campaign_id),
  KEY idx_ac_user    (user_id)
);
