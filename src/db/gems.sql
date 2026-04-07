ALTER TABLE `act_campaigns` ADD `request_id` VARCHAR(50) NULL AFTER `campaign_id`;
ALTER TABLE `act_campaigns` ADD `number_of_influencers` INT NULL DEFAULT '0' AFTER `completed_on`, ADD `activated_on` VARCHAR NULL AFTER `number_of_influencers`, ADD `published_date` VARCHAR NULL AFTER `activated_on`;
ALTER TABLE `act_campaigns` CHANGE `status` `status` ENUM('active','expired','deleted','closed','completed','draft','open_to_applications') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'active';
ALTER TABLE `act_campaign_invites` ADD `application_status` ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending' AFTER `invite_status`;
ALTER TABLE `users_profile` ADD `gender` ENUM('MALE','FEMALE','NOT_SAY','OTHER') NULL DEFAULT NULL AFTER `referral_code`;
ALTER TABLE `sm_site_users` ADD `engagement_rating` INT NOT NULL DEFAULT '1' AFTER `is_verified`, ADD `total_views` INT NOT NULL DEFAULT '1' AFTER `engagement_rating`;


ALTER TABLE `influencers`
ADD COLUMN date_of_birth DATE NULL,
ADD COLUMN gender VARCHAR(20) NULL,
ADD COLUMN content_best_at TEXT NULL,
ADD COLUMN comfortable_campaign_activities TEXT NULL,
ADD COLUMN platforms_most_content TEXT NULL,
ADD COLUMN content_types_enjoyed_most TEXT NULL;
ALTER TABLE `act_campaign_invites` ADD `rank` INT NOT NULL DEFAULT '0' AFTER `invited_on`;


ALTER TABLE `act_campaign_invites` ADD `reason` TEXT NULL AFTER `influencer_rank`;
-- ALTER TABLE `users` ADD `draft` TEXT NULL AFTER `influencer_rank`;

CREATE TABLE influencer_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,  -- FK to influencer table
  content_best_at TEXT,
  comfortable_campaign_activities TEXT,
  platforms_most_content JSON,
  content_types_enjoyed_most JSON,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE `users_profile` ADD `influencer_rating` INT NOT NULL DEFAULT '0' AFTER `gender`;

ALTER TABLE `act_campaign_invites` CHANGE `invite_status` `invite_status` ENUM('accepted','rejected','pending','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

CREATE TABLE act_campaign_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  rating INT NOT NULL,
  review TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE act_task_periods (
  id SERIAL PRIMARY KEY,
  period_id VARCHAR(50) DEFAULT 'INITIAL',
  task_id VARCHAR(50) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'expired',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE `act_task_users` ADD `period_id` VARCHAR(30) NULL AFTER `reward_status`;

ALTER TABLE `act_tasks` ADD `period_id` VARCHAR(50) NULL AFTER `created_by`, ADD `next_period_date` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER `period_id`;
ALTER TABLE `notifications` ADD `channel` ENUM('ALL','SMS','EMAIL') NOT NULL DEFAULT 'ALL' AFTER `status`;
