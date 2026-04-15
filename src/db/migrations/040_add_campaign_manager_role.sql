ALTER TABLE admin_users
  MODIFY COLUMN role ENUM('READ','WRITE','ADMIN','SUPER_ADMIN','campaign_manager') NOT NULL DEFAULT 'READ';

CREATE TABLE IF NOT EXISTS admin_campaign_assignments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  admin_id      VARCHAR(100) NOT NULL,
  campaign_id   VARCHAR(100) NOT NULL,
  assigned_by   VARCHAR(100) NOT NULL,
  assigned_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_campaign (admin_id, campaign_id),
  KEY idx_admin_id (admin_id),
  KEY idx_campaign_id (campaign_id)
);
