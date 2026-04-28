-- Add affiliate_link to campaigns table
ALTER TABLE act_campaigns
  ADD COLUMN IF NOT EXISTS affiliate_link VARCHAR(500) NULL DEFAULT NULL;

-- Click tracking table
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id VARCHAR(100) NOT NULL,
  user_id     VARCHAR(100) NOT NULL,
  clicked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ac_campaign (campaign_id),
  KEY idx_ac_user    (user_id)
);
