-- Add opportunity access tier to job board posts.
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('creator_plus_max_kes', '20000', 'number', 'Default maximum KES creator payout classified as Creator Plus. Affiliate opportunities are always Creator Plus.'),
('creator_pro_min_kes',  '25000', 'number', 'Minimum KES creator payout classified as Creator Pro.')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

SET @access_tier_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jb_job_posts'
    AND COLUMN_NAME = 'access_tier'
);

SET @add_access_tier_column := IF(
  @access_tier_column_exists = 0,
  'ALTER TABLE `jb_job_posts` ADD COLUMN `access_tier` ENUM(''free'', ''plus'', ''pro'') NOT NULL DEFAULT ''free'' AFTER `comp_type`',
  'SELECT 1'
);

PREPARE add_access_tier_column_stmt FROM @add_access_tier_column;
EXECUTE add_access_tier_column_stmt;
DEALLOCATE PREPARE add_access_tier_column_stmt;

UPDATE `jb_job_posts`
SET `access_tier` = CASE
  WHEN LOWER(COALESCE(`comp_type`, '')) IN ('product', 'service', 'barter') THEN 'free'
  WHEN LOWER(COALESCE(`comp_type`, '')) = 'affiliate' THEN 'plus'
  WHEN COALESCE(`comp_amount`, 0) >= (
    SELECT CAST(setting_value AS DECIMAL(13,2))
    FROM admin_settings
    WHERE setting_key = 'creator_pro_min_kes'
    LIMIT 1
  ) THEN 'pro'
  WHEN COALESCE(`comp_amount`, 0) > 0 THEN 'plus'
  ELSE 'free'
END;

SET @access_tier_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jb_job_posts'
    AND INDEX_NAME = 'idx_job_access_tier'
);

SET @add_access_tier_index := IF(
  @access_tier_index_exists = 0,
  'ALTER TABLE `jb_job_posts` ADD INDEX `idx_job_access_tier` (`access_tier`)',
  'SELECT 1'
);

PREPARE add_access_tier_index_stmt FROM @add_access_tier_index;
EXECUTE add_access_tier_index_stmt;
DEALLOCATE PREPARE add_access_tier_index_stmt;
