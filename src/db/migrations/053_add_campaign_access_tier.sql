-- Add creator subscription access tier to campaigns.
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('creator_plus_max_kes', '20000', 'number', 'Default maximum KES creator payout classified as Creator Plus. Affiliate opportunities are always Creator Plus.'),
('creator_pro_min_kes',  '25000', 'number', 'Minimum KES creator payout classified as Creator Pro.')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

SET @campaign_access_tier_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'act_campaigns'
    AND COLUMN_NAME = 'access_tier'
);

SET @add_campaign_access_tier_column := IF(
  @campaign_access_tier_column_exists = 0,
  'ALTER TABLE `act_campaigns` ADD COLUMN `access_tier` ENUM(''free'', ''plus'', ''pro'') NOT NULL DEFAULT ''free'' AFTER `earning_type`',
  'SELECT 1'
);

PREPARE add_campaign_access_tier_column_stmt FROM @add_campaign_access_tier_column;
EXECUTE add_campaign_access_tier_column_stmt;
DEALLOCATE PREPARE add_campaign_access_tier_column_stmt;

SET @campaign_early_access_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'act_campaigns'
    AND COLUMN_NAME = 'early_access_hours'
);

SET @add_campaign_early_access_column := IF(
  @campaign_early_access_column_exists = 0,
  'ALTER TABLE `act_campaigns` ADD COLUMN `early_access_hours` INT NOT NULL DEFAULT 0 AFTER `access_tier`',
  'SELECT 1'
);

PREPARE add_campaign_early_access_column_stmt FROM @add_campaign_early_access_column;
EXECUTE add_campaign_early_access_column_stmt;
DEALLOCATE PREPARE add_campaign_early_access_column_stmt;

UPDATE `act_campaigns`
SET `access_tier` = CASE
  WHEN LOWER(COALESCE(`earning_type`, 'paid')) = 'affiliate' THEN 'plus'
  WHEN LOWER(COALESCE(`earning_type`, 'paid')) IN ('barter', 'product', 'service') THEN 'free'
  WHEN COALESCE(`budget`, 0) / GREATEST(COALESCE(`number_of_influencers`, 1), 1) >= (
    SELECT CAST(setting_value AS DECIMAL(13,2))
    FROM admin_settings
    WHERE setting_key = 'creator_pro_min_kes'
    LIMIT 1
  ) THEN 'pro'
  WHEN COALESCE(`budget`, 0) / GREATEST(COALESCE(`number_of_influencers`, 1), 1) > 0 THEN 'plus'
  ELSE 'free'
END;

SET @campaign_access_tier_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'act_campaigns'
    AND INDEX_NAME = 'idx_campaign_access_tier'
);

SET @add_campaign_access_tier_index := IF(
  @campaign_access_tier_index_exists = 0,
  'ALTER TABLE `act_campaigns` ADD INDEX `idx_campaign_access_tier` (`access_tier`)',
  'SELECT 1'
);

PREPARE add_campaign_access_tier_index_stmt FROM @add_campaign_access_tier_index;
EXECUTE add_campaign_access_tier_index_stmt;
DEALLOCATE PREPARE add_campaign_access_tier_index_stmt;
