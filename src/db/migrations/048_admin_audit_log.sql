-- ── 1. Admin audit log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id VARCHAR(100) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  DEFAULT NULL,
  target_id   VARCHAR(100) DEFAULT NULL,
  details     JSON         DEFAULT NULL,
  ip_address  VARCHAR(45)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT NOW(),
  INDEX idx_aal_admin  (admin_user_id),
  INDEX idx_aal_action (action),
  INDEX idx_aal_ts     (created_at)
);

-- ── 2. Idempotency keys ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash        VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(100) NOT NULL,
  operation       VARCHAR(100) NOT NULL,
  response_status SMALLINT     NOT NULL,
  response_body   TEXT         NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT NOW(),
  expires_at      DATETIME     NOT NULL,
  INDEX idx_ik_user    (user_id),
  INDEX idx_ik_expires (expires_at)
);

-- ── 3. Financial alert admin settings ─────────────────────────────────────────
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('financial_alert_threshold_kes', '50000', 'number', 'KES withdrawal amount that triggers an admin alert'),
('financial_alert_threshold_usd', '500',   'number', 'USD withdrawal amount that triggers an admin alert'),
('financial_alert_email',         '',      'string', 'Comma-separated emails to receive financial alerts')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
