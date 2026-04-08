-- Add 3 new test jobs using brand account business@example1.com

-- First, find the user_id for business@example1.com
SELECT user_id, email, name FROM users WHERE email = 'business@example1.com';

-- Job 1: Instagram Promotion
INSERT INTO jb_job_posts (job_id, brand_id, title, description, comp_amount, comp_currency, comp_type, min_followers, niche, deadline, status, created_at)
VALUES (
    CONCAT('JB_TEST_', DATE_FORMAT(NOW(), '%Y%m%d'), '_001'),
    (SELECT user_id FROM users WHERE email = 'business@example1.com' LIMIT 1),
    'Instagram Promotion for Tech Product',
    'We need an influencer to promote our new tech gadget on Instagram. Must have at least 5000 followers and post within 3 days.',
    5000,
    'KES',
    'cash',
    5000,
    'technology',
    DATE_ADD(NOW(), INTERVAL 7 DAY),
    'open',
    NOW()
);

-- Job 2: TikTok Campaign
INSERT INTO jb_job_posts (job_id, brand_id, title, description, comp_amount, comp_currency, comp_type, min_followers, niche, deadline, status, created_at)
VALUES (
    CONCAT('JB_TEST_', DATE_FORMAT(NOW(), '%Y%m%d'), '_002'),
    (SELECT user_id FROM users WHERE email = 'business@example1.com' LIMIT 1),
    'TikTok Viral Campaign',
    'Create an engaging TikTok video about our new fashion collection. Must be creative and trending style.',
    8000,
    'KES',
    'cash',
    10000,
    'fashion',
    DATE_ADD(NOW(), INTERVAL 14 DAY),
    'open',
    NOW()
);

-- Job 3: YouTube Review
INSERT INTO jb_job_posts (job_id, brand_id, title, description, comp_amount, comp_currency, comp_type, min_followers, niche, deadline, status, created_at)
VALUES (
    CONCAT('JB_TEST_', DATE_FORMAT(NOW(), '%Y%m%d'), '_003'),
    (SELECT user_id FROM users WHERE email = 'business@example1.com' LIMIT 1),
    'YouTube Product Review',
    'We need a detailed YouTube review of our beauty product. Must be at least 5 minutes long with honest feedback.',
    15000,
    'KES',
    'cash',
    20000,
    'beauty',
    DATE_ADD(NOW(), INTERVAL 21 DAY),
    'open',
    NOW()
);

-- Verify jobs were created
SELECT job_id, title, comp_amount, comp_currency, status, deadline 
FROM jb_job_posts 
WHERE brand_id = (SELECT user_id FROM users WHERE email = 'business@example1.com' LIMIT 1)
ORDER BY created_at DESC;
