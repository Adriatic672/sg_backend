-- Admin-configurable platform settings.
-- Defaults: platform_fee_pct = 5%, pending_clearance_days = 5 days.
CREATE TABLE IF NOT EXISTS admin_settings (
  id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(100)   NOT NULL,
  setting_value VARCHAR(500)   NOT NULL,
  setting_type  ENUM('string','number','boolean','json') NOT NULL DEFAULT 'string',
  description   TEXT           DEFAULT NULL,
  updated_by    VARCHAR(64)    DEFAULT NULL,
  updated_at    TIMESTAMP      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('platform_fee_pct',       '5', 'number', 'Platform commission % deducted from each creator payout on campaign completion'),
('pending_clearance_days', '5', 'number', 'Days after content approval before earnings move from Pending to Available')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
