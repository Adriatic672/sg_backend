-- Add test funds to brand wallet
-- Run this to add 100 USD to the brand's wallet

-- First, find a brand user
SELECT user_id, email, name 
FROM users 
WHERE user_type = 'brand' 
LIMIT 1;

-- Add 100 USD to brand wallet (creates wallet if doesn't exist)
-- Note: Column is 'asset' not 'currency'
INSERT INTO user_wallets (wallet_id, user_id, asset, balance, wallet_pin, status, created_on)
SELECT 
    CONCAT('WL_USD_', SUBSTRING(MD5(RAND()) FROM 1 FOR 12)),
    user_id,
    'USD',
    100,
    '1234',
    'active',
    NOW()
FROM users 
WHERE user_type = 'brand' 
LIMIT 1
ON DUPLICATE KEY UPDATE balance = balance + 100;
