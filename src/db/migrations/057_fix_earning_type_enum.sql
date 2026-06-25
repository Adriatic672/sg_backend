-- Fix earning_type ENUM on act_campaigns to include all values the app uses.
-- The column may already exist (as a narrower ENUM), or may be missing entirely.
-- This migration adds or widens it to cover: paid, affiliate, barter, product, service.

SET @earning_type_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'act_campaigns'
    AND COLUMN_NAME = 'earning_type'
);

-- If column is missing, add it with the full enum set.
SET @add_earning_type := IF(
  @earning_type_exists = 0,
  'ALTER TABLE `act_campaigns` ADD COLUMN `earning_type` ENUM(''paid'',''affiliate'',''barter'',''product'',''service'') NOT NULL DEFAULT ''paid'' AFTER `number_of_influencers`',
  'SELECT 1'
);

PREPARE add_earning_type_stmt FROM @add_earning_type;
EXECUTE add_earning_type_stmt;
DEALLOCATE PREPARE add_earning_type_stmt;

-- If column already exists, widen the ENUM to include all values.
-- MODIFY COLUMN is safe here — it only changes the type definition, not the data.
SET @widen_earning_type := IF(
  @earning_type_exists = 1,
  'ALTER TABLE `act_campaigns` MODIFY COLUMN `earning_type` ENUM(''paid'',''affiliate'',''barter'',''product'',''service'') NOT NULL DEFAULT ''paid''',
  'SELECT 1'
);

PREPARE widen_earning_type_stmt FROM @widen_earning_type;
EXECUTE widen_earning_type_stmt;
DEALLOCATE PREPARE widen_earning_type_stmt;
