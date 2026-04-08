-- Add guidelines_attachment to jb_job_posts for campaign guidelines/attachments
ALTER TABLE `jb_job_posts` ADD COLUMN `guidelines_attachment` VARCHAR(500) NULL AFTER `campaign_id`;

-- Add index for faster lookups
ALTER TABLE `jb_job_posts` ADD INDEX `idx_guidelines_attachment` (`guidelines_attachment`);
