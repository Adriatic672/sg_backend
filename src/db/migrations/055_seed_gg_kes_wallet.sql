-- Seed KES wallet balance for gg@email.com (test / demo account)
--
-- decimal(13,2) max = 99,999,999,999.99 (~100 billion).
-- Using 99,999.00 KES as the sample balance (fits any plan price test).
-- Run once against the socialgems database.

SET @target_email = CONVERT('gg@email.com' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci;
SET @sample_balance = 99999.00;

-- ── Resolve user_id ─────────────────────────────────────────────────────────
SET @uid = (
  SELECT user_id FROM users
  WHERE LOWER(email) = LOWER(@target_email)
  LIMIT 1
);

-- Abort safely if user not found
SELECT IF(@uid IS NULL,
  CONCAT('ERROR: no user found for ', @target_email),
  CONCAT('Found user_id = ', @uid)
) AS preflight_check;

-- ── Upsert KES wallet ────────────────────────────────────────────────────────
-- INSERT if no KES wallet exists, UPDATE balance columns if it does.
INSERT INTO user_wallets (
  wallet_id,
  user_id,
  asset,
  balance,
  balance_available,
  balance_pending,
  total_earned,
  total_withdrawn,
  status,
  created_on
)
SELECT
  UUID()          AS wallet_id,
  @uid            AS user_id,
  'KES'           AS asset,
  @sample_balance AS balance,
  @sample_balance AS balance_available,
  0.00            AS balance_pending,
  @sample_balance AS total_earned,
  0.00            AS total_withdrawn,
  'active'        AS status,
  NOW()           AS created_on
WHERE @uid IS NOT NULL
ON DUPLICATE KEY UPDATE
  balance           = @sample_balance,
  balance_available = @sample_balance,
  total_earned      = GREATEST(total_earned, @sample_balance),
  status            = 'active';

-- ── Confirm ──────────────────────────────────────────────────────────────────
SELECT
  w.wallet_id,
  w.asset,
  w.balance,
  w.balance_available,
  w.balance_pending,
  w.status
FROM user_wallets w
WHERE w.user_id = @uid AND w.asset = 'KES';
