

ALTER TABLE act_campaigns 
MODIFY COLUMN business_id VARCHAR(100) 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



ALTER TABLE `elig_searches` ADD `eligible_users` TEXT NULL AFTER `response`;
ALTER TABLE `user_wallets` ADD `wallet_pin` VARCHAR(255) NULL AFTER `deactivated_until`;
