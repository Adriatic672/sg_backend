-- KES M-Pesa B2C withdrawal requests.
-- One row per withdrawal attempt. Balance is deducted atomically at request time;
-- restored immediately if Relworx returns a failure so balance is never lost.
CREATE TABLE IF NOT EXISTS kes_withdrawal_requests (
  request_id     VARCHAR(64)    NOT NULL PRIMARY KEY,
  user_id        VARCHAR(64)    NOT NULL,
  trans_id       VARCHAR(64)    NOT NULL,            -- links to wl_transactions debit row
  amount         DECIMAL(13,2)  NOT NULL,
  msisdn         VARCHAR(20)    NOT NULL,            -- M-Pesa number (+2547...)
  relworx_ref    VARCHAR(128)   DEFAULT NULL,        -- reference returned by Relworx on success
  status         ENUM('PROCESSING','PAID','FAILED','REVERSED') NOT NULL DEFAULT 'PROCESSING',
  failure_reason TEXT           DEFAULT NULL,
  retry_count    TINYINT        NOT NULL DEFAULT 0,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME       DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kes_wr_user   (user_id),
  INDEX idx_kes_wr_status (status),
  INDEX idx_kes_wr_trans  (trans_id),
  INDEX idx_kes_wr_ref    (relworx_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Notification: payout succeeded.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'KES_WITHDRAWAL_SUCCESS',
  'M-Pesa Payout Sent',
  'Your withdrawal of KES {amount} has been sent to {reason}. M-Pesa reference: {reference}.',
  'ALL',
  'WALLET'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);

-- Notification: payout failed.
INSERT INTO notification_templates (operation, title, body, channel, category) VALUES
(
  'KES_WITHDRAWAL_FAILED',
  'Withdrawal Failed',
  'Your KES {amount} withdrawal could not be processed: {reason}. Your balance has been restored. Please try again.',
  'ALL',
  'WALLET'
)
ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body);
