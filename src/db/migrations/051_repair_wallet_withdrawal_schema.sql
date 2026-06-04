-- Repair schema required by KES M-Pesa withdrawal/idempotency flows.
-- This is intentionally idempotent because some environments have partial
-- wallet migrations recorded but are missing the actual columns/tables.

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_wallets'
     AND COLUMN_NAME = 'balance_pending') = 0,
  'ALTER TABLE `user_wallets` ADD COLUMN `balance_pending` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `balance`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_wallets'
     AND COLUMN_NAME = 'balance_available') = 0,
  'ALTER TABLE `user_wallets` ADD COLUMN `balance_available` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `balance_pending`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_wallets'
     AND COLUMN_NAME = 'total_earned') = 0,
  'ALTER TABLE `user_wallets` ADD COLUMN `total_earned` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `balance_available`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_wallets'
     AND COLUMN_NAME = 'total_withdrawn') = 0,
  'ALTER TABLE `user_wallets` ADD COLUMN `total_withdrawn` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `total_earned`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `user_wallets`
SET `balance_available` = `balance`
WHERE COALESCE(`balance_available`, 0) = 0
  AND COALESCE(`balance`, 0) > 0;

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `key_hash`        VARCHAR(64)  NOT NULL PRIMARY KEY,
  `user_id`         VARCHAR(100) NOT NULL,
  `operation`       VARCHAR(100) NOT NULL,
  `response_status` SMALLINT     NOT NULL,
  `response_body`   TEXT         NOT NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT NOW(),
  `expires_at`      DATETIME     NOT NULL,
  INDEX `idx_ik_user`    (`user_id`),
  INDEX `idx_ik_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kes_withdrawal_requests` (
  `request_id`     VARCHAR(64)    NOT NULL PRIMARY KEY,
  `user_id`        VARCHAR(64)    NOT NULL,
  `trans_id`       VARCHAR(64)    NOT NULL,
  `amount`         DECIMAL(13,2)  NOT NULL,
  `msisdn`         VARCHAR(20)    NOT NULL,
  `relworx_ref`    VARCHAR(128)   DEFAULT NULL,
  `status`         ENUM('PROCESSING','PAID','FAILED','REVERSED') NOT NULL DEFAULT 'PROCESSING',
  `failure_reason` TEXT           DEFAULT NULL,
  `retry_count`    TINYINT        NOT NULL DEFAULT 0,
  `created_at`     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME       DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_kes_wr_user`   (`user_id`),
  INDEX `idx_kes_wr_status` (`status`),
  INDEX `idx_kes_wr_trans`  (`trans_id`),
  INDEX `idx_kes_wr_ref`    (`relworx_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
