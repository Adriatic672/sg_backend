-- Add test job with work_done status for testing payment flow
-- Run this in your MySQL database

-- Check existing jobs and campaigns
SELECT job_id, brand_id, title, campaign_id, comp_amount, status FROM jb_job_posts LIMIT 10;

-- Check existing job interests
SELECT interest_id, job_id, creator_id, status FROM jb_job_interests LIMIT 10;

-- Check active campaigns
SELECT campaign_id, title, created_by, status FROM act_campaigns WHERE status = 'active' LIMIT 5;

-- UPDATE existing interest to work_done status (so brand can approve)
-- Replace 'YOUR_INTEREST_ID' with actual interest_id
UPDATE jb_job_interests SET status = 'work_done' WHERE interest_id = 'YOUR_INTEREST_ID';

-- INSERT new test job (if you want to create a new one)
-- First get a brand_id and campaign_id from your database
INSERT INTO jb_job_posts (job_id, brand_id, title, description, comp_amount, comp_currency, comp_type, status, deadline, campaign_id)
VALUES ('test_job_001', 'YOUR_BRAND_ID', 'Test Job Payment', 'Test job for payment', 1000, 'KES', 'cash', 'active', DATE_ADD(NOW(), INTERVAL 30 DAY), 'YOUR_CAMPAIGN_ID');

-- Then insert the job interest
INSERT INTO jb_job_interests (interest_id, job_id, creator_id, status, note, created_at)
VALUES ('test_interest_001', 'test_job_001', 'INFLUENCER_USER_ID', 'work_done', 'Test work submission', NOW());
