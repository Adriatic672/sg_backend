-- Campaign escrow: one row per campaign tracking the full fund lifecycle.
-- platform_fee_pct is snapshotted at funding time so later setting changes don't
-- retroactively alter in-flight campaigns.
CREATE TABLE IF NOT EXISTS campaign_escrow (
  escrow_id         VARCHAR(64)    NOT NULL PRIMARY KEY,
  campaign_id       VARCHAR(50)    NOT NULL,
  brand_user_id     VARCHAR(100)   NOT NULL,
  currency          ENUM('KES','USD') NOT NULL DEFAULT 'KES',
  total_amount      DECIMAL(13,2)  NOT NULL DEFAULT 0.00,
  platform_fee_pct  DECIMAL(5,2)   NOT NULL DEFAULT 5.00,
  platform_fee_amt  DECIMAL(13,2)  NOT NULL DEFAULT 0.00,
  creator_pool      DECIMAL(13,2)  NOT NULL DEFAULT 0.00,
  released_amount   DECIMAL(13,2)  NOT NULL DEFAULT 0.00,
  status            ENUM('pending_funding','funded','active','partially_released','released','refunded','cancelled')
                    NOT NULL DEFAULT 'pending_funding',
  payment_reference VARCHAR(128)   DEFAULT NULL,
  funded_at         DATETIME       DEFAULT NULL,
  activated_at      DATETIME       DEFAULT NULL,
  released_at       DATETIME       DEFAULT NULL,
  confirmed_by      VARCHAR(64)    DEFAULT NULL,
  admin_notes       TEXT           DEFAULT NULL,
  created_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign (campaign_id),
  INDEX idx_brand (brand_user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Backfill escrow records for campaigns already marked as funded.
INSERT IGNORE INTO campaign_escrow (
  escrow_id, campaign_id, brand_user_id, currency,
  total_amount, platform_fee_pct, platform_fee_amt, creator_pool,
  status, funded_at
)
SELECT
  CONCAT('esc_', campaign_id),
  campaign_id,
  COALESCE(created_by_user_id, ''),
  'KES',
  COALESCE(budget, 0),
  5.00,
  ROUND(COALESCE(budget, 0) * 0.05, 2),
  ROUND(COALESCE(budget, 0) * 0.95, 2),
  'funded',
  COALESCE(activated_on, created_on)
FROM act_campaigns
WHERE funding_status = 'funded';
