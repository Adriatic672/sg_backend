-- USD bank-transfer withdrawal requests.
-- When a creator requests a USD withdrawal via bank transfer, a row is created
-- here and held PENDING until an admin manually processes it.
CREATE TABLE IF NOT EXISTS usd_withdrawal_requests (
  request_id    VARCHAR(64)   PRIMARY KEY,
  user_id       VARCHAR(64)   NOT NULL,
  trans_id      VARCHAR(64)   NOT NULL,          -- links back to the wl_transactions debit row
  amount        DECIMAL(13,2) NOT NULL,
  currency      VARCHAR(10)   NOT NULL DEFAULT 'USD',
  account_number VARCHAR(64)  NOT NULL,
  account_name  VARCHAR(255)  NOT NULL DEFAULT '',
  bank_name     VARCHAR(255)  NOT NULL DEFAULT '',
  swift_code    VARCHAR(64)   NOT NULL DEFAULT '',
  status        ENUM('PENDING','APPROVED','REJECTED','PAID') NOT NULL DEFAULT 'PENDING',
  reference     VARCHAR(128)  DEFAULT NULL,      -- bank reference set by admin on approval
  admin_notes   TEXT          DEFAULT NULL,
  processed_by  VARCHAR(64)   DEFAULT NULL,
  processed_at  DATETIME      DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usd_wr_user   (user_id),
  INDEX idx_usd_wr_status (status),
  INDEX idx_usd_wr_trans  (trans_id)
);

-- Notification: creator receives this when they submit a USD withdrawal request.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'USD_WITHDRAWAL_SUBMITTED',
  'USD Withdrawal Request Received',
  'Your USD withdrawal request of {amount} has been received and is pending admin approval. You will be notified once it is processed.',
  'ALL',
  'WALLET'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

-- Notification: creator receives this when the admin approves & marks as PAID.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'USD_WITHDRAWAL_APPROVED',
  'USD Withdrawal Approved',
  'Your USD withdrawal of {amount} has been approved and processed. Reference: {reason}.',
  'ALL',
  'WALLET'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

-- Notification: creator receives this when the admin rejects the request.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'USD_WITHDRAWAL_REJECTED',
  'USD Withdrawal Rejected',
  'Your USD withdrawal request of {amount} has been rejected. Reason: {reason}. Your balance has been restored.',
  'ALL',
  'WALLET'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);
