ALTER TABLE act_campaign_invites 
  MODIFY user_id VARCHAR(64) 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

ALTER TABLE act_campaigns 
  MODIFY created_by VARCHAR(64) 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

ALTER TABLE business_profile 
  MODIFY business_id VARCHAR(64) 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;
