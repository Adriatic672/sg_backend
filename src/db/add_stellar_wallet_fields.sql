-- Add Stellar wallet fields to users table
-- This migration adds support for Stellar blockchain wallets

-- Add columns only if they don't exist using prepared statements
SET @db_name = DATABASE();

-- Add stellar_public_key if it doesn't exist
SET @columnexists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'stellar_public_key');
SET @sql = IF(@columnexists = 0, 'ALTER TABLE users ADD stellar_public_key VARCHAR(56)', 'SELECT 1 as skip');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add stellar_secret_key if it doesn't exist
SET @columnexists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'stellar_secret_key');
SET @sql = IF(@columnexists = 0, 'ALTER TABLE users ADD stellar_secret_key LONGTEXT', 'SELECT 1 as skip');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add stellar_wallet_created if it doesn't exist
SET @columnexists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'stellar_wallet_created');
SET @sql = IF(@columnexists = 0, 'ALTER TABLE users ADD stellar_wallet_created DATETIME DEFAULT NULL', 'SELECT 1 as skip');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create Stellar transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS stellar_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100),
    from_address VARCHAR(56),
    to_address VARCHAR(56),
    amount DECIMAL(18, 7),
    token_code VARCHAR(12) DEFAULT 'SBX',
    transaction_hash VARCHAR(64),
    status VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_transaction_hash (transaction_hash),
    INDEX idx_status (status)
);

-- Add payment_method column to campaign_payments_users if it doesn't exist
SET @columnexists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'campaign_payments_users' AND COLUMN_NAME = 'payment_method');
SET @sql = IF(@columnexists = 0, 'ALTER TABLE campaign_payments_users ADD payment_method VARCHAR(20) DEFAULT "OFF_CHAIN"', 'SELECT 1 as skip');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Columns are ready - migration complete
SELECT 'Stellar wallet migration completed successfully' as status;
