-- Add campaign_id to jb_job_posts to link jobs to campaigns for escrow
ALTER TABLE `jb_job_posts` ADD COLUMN `campaign_id` varchar(64) NULL AFTER `brand_id`;

-- Add index for faster lookups
ALTER TABLE `jb_job_posts` ADD INDEX `idx_campaign` (`campaign_id`);
