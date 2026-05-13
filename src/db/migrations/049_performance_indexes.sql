-- ── Performance indexes for hot query paths ───────────────────────────────────

-- Campaign payment configs: cron clearance query
ALTER TABLE campaign_payment_config
  ADD INDEX IF NOT EXISTS idx_cpc_status_clearance (payment_status, clearance_date);

-- Campaign invites: delay monitor + auto-approve queries
ALTER TABLE act_campaign_invites
  ADD INDEX IF NOT EXISTS idx_aci_status        (action_status),
  ADD INDEX IF NOT EXISTS idx_aci_campaign_user (campaign_id, user_id);

-- KES withdrawal requests: webhook lookup + user history
ALTER TABLE kes_withdrawal_requests
  ADD INDEX IF NOT EXISTS idx_kwr_user_id (user_id),
  ADD INDEX IF NOT EXISTS idx_kwr_status  (status);

-- Wallet transactions: statement queries
ALTER TABLE wallet_transactions
  ADD INDEX IF NOT EXISTS idx_wt_user_currency (user_id, currency),
  ADD INDEX IF NOT EXISTS idx_wt_created       (created_at);

-- Campaign escrow: admin dashboard join
ALTER TABLE campaign_escrow
  ADD INDEX IF NOT EXISTS idx_ce_status (status);

-- Admin audit log: already indexed in 048, this is a no-op safety net
-- (skipped — created with indexes in 048)

-- Idempotency: expire old keys daily via event or manual purge
-- Purge is done by the cron job added in cron.ts
