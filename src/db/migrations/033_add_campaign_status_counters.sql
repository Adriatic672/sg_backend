ALTER TABLE act_campaigns
ADD COLUMN count_invited INT DEFAULT 0,
ADD COLUMN count_accepted INT DEFAULT 0,
ADD COLUMN count_submitted INT DEFAULT 0,
ADD COLUMN count_approved INT DEFAULT 0,
ADD COLUMN count_revision_required INT DEFAULT 0,
ADD COLUMN count_completed INT DEFAULT 0;
