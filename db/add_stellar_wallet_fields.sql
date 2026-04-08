-- Migration to add Stellar wallet fields to users table
-- This migration adds the necessary fields for Stellar blockchain integration

ALTER TABLE `users` ADD COLUMN `stellar_public_key` VARCHAR(56) DEFAULT NULL AFTER `is_social_verified`;
ALTER TABLE `users` ADD COLUMN `stellar_secret_key` VARCHAR(56) DEFAULT NULL AFTER `stellar_public_key`;
ALTER TABLE `users` ADD COLUMN `stellar_wallet_created` TIMESTAMP NULL DEFAULT NULL AFTER `stellar_secret_key`;

-- Add index for performance on Stellar public key lookups
ALTER TABLE `users` ADD INDEX `idx_stellar_public_key` (`stellar_public_key`);

-- Add comments for documentation
ALTER TABLE `users` MODIFY COLUMN `stellar_public_key` VARCHAR(56) DEFAULT NULL COMMENT 'Stellar public key for blockchain payments';
ALTER TABLE `users` MODIFY COLUMN `stellar_secret_key` VARCHAR(56) DEFAULT NULL COMMENT 'Stellar secret key (encrypted) for wallet operations';
ALTER TABLE `users` MODIFY COLUMN `stellar_wallet_created` TIMESTAMP NULL DEFAULT NULL COMMENT 'Timestamp when Stellar wallet was created';