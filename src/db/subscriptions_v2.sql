-- ============================================================
-- SocialGems: Creator Subscription Tiers v2
-- Run this migration against your MySQL database.
-- ============================================================

-- 1. Add subscription_tier to the users table so we can do a
--    fast single-column lookup without joining user_subscriptions.
--    Values: 'free' | 'plus' | 'pro'
ALTER TABLE `users`
  ADD COLUMN `subscription_tier` ENUM('free', 'plus', 'pro') NOT NULL DEFAULT 'free'
  AFTER `stripe_customer_id`;

-- 2. Insert the two creator plans.
--    stripe_price_tag must be updated with real Stripe Price IDs before going live.
INSERT INTO `subscriptions`
  (`sub_tag`, `stripe_price_tag`, `name`, `description`, `price`, `currency`, `is_popular`, `features`, `created_at`, `updated_at`)
VALUES
(
  'CREATOR_PLUS',
  'price_REPLACE_WITH_STRIPE_PLUS_PRICE_ID',
  'Creator Plus',
  'Grow your presence and access more opportunities',
  350,
  'KES',
  0,
  '["Increased visibility in search and listings","Early access to campaigns","Profile badge","2 application boosts per month"]',
  NOW(),
  NOW()
),
(
  'CREATOR_PRO',
  'price_REPLACE_WITH_STRIPE_PRO_PRICE_ID',
  'Creator Pro',
  'Top-tier visibility, premium campaigns and reduced fees',
  850,
  'KES',
  1,
  '["Top-tier visibility across the platform","Access to premium and higher-value campaigns","Reduced withdrawal fees (1.5% instead of 3%)","Priority support","Unlimited application boosts","Full profile features and badge"]',
  NOW(),
  NOW()
);

-- 3. Soft-delete or deactivate old business-facing plans if any exist.
--    Adjust the sub_tag values below to match whatever legacy plans are in your DB.
--    Uncomment if needed:
-- UPDATE `subscriptions` SET `is_popular` = 0 WHERE `sub_tag` NOT IN ('CREATOR_PLUS', 'CREATOR_PRO');

-- 4. Add is_premium and early_access flags to act_campaigns so brands can
--    restrict campaigns to paid tiers.
ALTER TABLE `act_campaigns`
  ADD COLUMN `access_tier` ENUM('free', 'plus', 'pro') NOT NULL DEFAULT 'free'
  AFTER `status`,
  ADD COLUMN `early_access_hours` INT NOT NULL DEFAULT 0
  AFTER `access_tier`;

-- 5. Add a profile_badge column to users_profile for fast badge reads.
ALTER TABLE `users_profile`
  ADD COLUMN `subscription_badge` ENUM('none', 'plus', 'pro') NOT NULL DEFAULT 'none'
  AFTER `influencer_rating`;

-- ============================================================
-- End of migration
-- ============================================================
