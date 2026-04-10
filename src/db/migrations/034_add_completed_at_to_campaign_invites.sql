ALTER TABLE `act_campaign_invites`
ADD COLUMN `completed_at` DATETIME NULL DEFAULT NULL AFTER `action_date`;
