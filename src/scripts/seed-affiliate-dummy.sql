-- Affiliate Dummy Data SQL Script
-- This script creates an affiliate brand account and associated affiliate campaigns
-- Email: business@example1.com
-- Password: password@123 (SHA256 hash: 488747c3691a635d7a10d69de3821c30f527b4c75b27fe8c3c7cb31a1655b365)

BEGIN;

-- Step 1: Generate IDs
-- User ID format: b + random string (16 chars)
-- Staff ID format: stf + random string (20 chars)
-- Campaign IDs: camp + random string (14 chars)

-- === Creating Affiliate Brand User ===
-- IMPORTANT: Replace the random IDs below with freshly generated ones if needed
-- User IDs (must be unique):
--   brand_user_id: bpfvb6ijl79rmoiuq (example, you can regenerate)
--   staff_id: stfq0m0jg0xoeamoiuq67o (example, you can regenerate)

-- For convenience, we'll use a deterministic approach by using UUID or random_string in actual execution
-- In MySQL, you can use: SELECT CONCAT('b', SUBSTRING(MD5(RAND()), 1, 16));
-- However, for script reproducibility, we'll use fixed example IDs. If these conflict, change them.

-- NOTE: If running this manually, generate new IDs using:
-- SELECT CONCAT('b', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 16));  -- for user_id
-- SELECT CONCAT('stf', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 20)); -- for staff_id

-- For this script, we'll use placeholder values. You must replace them with unique ones.
-- Let's define variables:
SET @brand_user_id = CONCAT('b', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 16));
SET @staff_id = CONCAT('stf', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 20));
SET @brand_business_id = @brand_user_id;  -- brand business_id equals user_id
SET @password_hash = SHA2('password@123', 256);
SET @brand_email = 'business@example1.com';
SET @brand_name = 'Business Affiliate 1';
SET @brand_description = 'Affiliate partner for testing and demonstration purposes';
SET @username = CONCAT('businessaffiliate1_brand');

-- Insert into users
INSERT INTO users (user_id, business_id, user_type, email, password, status, email_verified)
VALUES (@brand_user_id, @brand_business_id, 'brand', @brand_email, @password_hash, 'active', 'yes');

-- Insert into business_profile
INSERT INTO business_profile (
    business_id, name, description, owner_id, phone, email,
    is_registered, country, verification_status, created_by_type
) VALUES (
    @brand_business_id, @brand_name, @brand_description,
    @staff_id, '+254700000000', @brand_email,
    'yes', 'KE', 'verified', 'brand'
);

-- Insert into business_staff
INSERT INTO business_staff (
    staff_id, business_id, first_name, last_name, email,
    role, added_by, password, status, verification_status
) VALUES (
    @staff_id, @brand_business_id, 'Business', 'Admin', @brand_email,
    'owner', @staff_id, @password_hash, 'active', 'verified'
);

-- Insert into users_profile
INSERT INTO users_profile (
    user_id, username, first_name, last_name, iso_code, phone, email_verified
) VALUES (
    @brand_user_id, @username, 'Business', 'Admin', 'KE', '+254700000000', 'yes'
);

-- Generate campaign IDs
SET @campaign1_id = CONCAT('camp', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 14));
SET @campaign2_id = CONCAT('camp', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 14));
SET @campaign3_id = CONCAT('camp', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 14));

-- === Creating Affiliate Campaigns ===
-- Each campaign has earning_type='affiliate' and an affiliate_link

-- Campaign 1: Tech Product Launch Affiliate
INSERT INTO act_campaigns (
    campaign_id, created_by, title, description, objective,
    budget, number_of_influencers, start_date, end_date,
    status, created_on, earning_type, affiliate_link
) VALUES (
    @campaign1_id, @brand_business_id,
    'Affiliate - Tech Product Launch',
    'Promote the latest tech gadgets and earn commission on every sale. This is an exclusive affiliate campaign offering 15% commission on all referred sales. Use your unique affiliate link to track conversions and earn passive income.',
    'Drive sales through affiliate referrals',
    10000, 50, '2026-05-01', '2026-07-31',
    'draft', NOW(), 'affiliate',
    'https://business.example.com/affiliate/tech-launch?ref=socialgems'
);

-- Campaign 2: Fashion Collection Affiliate
INSERT INTO act_campaigns (
    campaign_id, created_by, title, description, objective,
    budget, number_of_influencers, start_date, end_date,
    status, created_on, earning_type, affiliate_link
) VALUES (
    @campaign2_id, @brand_business_id,
    'Affiliate - Fashion Collection',
    'Partner with us to showcase our new summer fashion line. Earn 20% commission on all sales generated through your affiliate code. This campaign is perfect for fashion influencers and content creators looking to monetize their audience.',
    'Generate affiliate sales and brand awareness',
    8000, 30, '2026-05-15', '2026-08-15',
    'draft', NOW(), 'affiliate',
    'https://business.example.com/affiliate/fashion-collection?ref=socialgems'
);

-- Campaign 3: Wellness Products Affiliate
INSERT INTO act_campaigns (
    campaign_id, created_by, title, description, objective,
    budget, number_of_influencers, start_date, end_date,
    status, created_on, earning_type, affiliate_link
) VALUES (
    @campaign3_id, @brand_business_id,
    'Affiliate - Wellness Products',
    'Promote our organic wellness supplements and health products. Earn recurring commissions on subscription-based products. High converting offers with competitive commission rates. Perfect for health and wellness influencers.',
    'Build long-term affiliate partnerships',
    12000, 40, '2026-06-01', '2026-09-30',
    'draft', NOW(), 'affiliate',
    'https://business.example.com/affiliate/wellness?ref=socialgems'
);

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- After running this script, verify with:
SELECT user_id, email, user_type, status FROM users WHERE email = 'business@example.com';
SELECT b.business_id, b.name, b.verification_status FROM business_profile b
JOIN users u ON b.business_id = u.user_id WHERE u.email = 'business@example.com';
SELECT campaign_id, title, earning_type, affiliate_link FROM act_campaigns WHERE created_by = (
    SELECT user_id FROM users WHERE email = 'business@example.com'
) AND earning_type = 'affiliate';
