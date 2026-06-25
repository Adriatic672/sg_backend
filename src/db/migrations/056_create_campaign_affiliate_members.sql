CREATE TABLE IF NOT EXISTS campaign_affiliate_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  ref_code VARCHAR(50) NOT NULL,
  click_count INT NOT NULL DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_campaign_user (campaign_id, user_id),
  UNIQUE KEY uniq_ref_code (ref_code),
  INDEX idx_cam_user_id (user_id),
  INDEX idx_cam_campaign_id (campaign_id)
);
