-- Month 2 Wallet Balance Breakdown Migration
-- Add balance categories: pending, available, total_earned, total_withdrawn

ALTER TABLE `user_wallets` 
ADD COLUMN `balance_pending` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `balance`,
ADD COLUMN `balance_available` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `balance_pending`,
ADD COLUMN `total_earned` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `balance_available`,
ADD COLUMN `total_withdrawn` DECIMAL(13,2) NOT NULL DEFAULT 0.00 AFTER `total_earned`;

-- Initialize existing wallets: set balance_available = current balance
UPDATE `user_wallets` SET `balance_available` = `balance`;

-- Insert KES and USD assets
INSERT IGNORE INTO `wl_assets` (`id`, `asset`, `icon`) VALUES
(2, 'USD', ''),
(3, 'KES', '');
