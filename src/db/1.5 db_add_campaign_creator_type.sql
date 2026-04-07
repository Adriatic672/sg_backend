-- ============================================
-- Add Creator Type Tracking to Campaigns
-- This allows campaigns to be created by brands, agents, or staff
-- ============================================

-- Step 1: Add business_id column (the business the campaign belongs to)
-- This is separate from who created it (agent/staff can create for a business)
ALTER TABLE act_campaigns
ADD COLUMN business_id VARCHAR(100) NULL;

-- Step 2: Add created_by_user_id column (stores the actual user who created it)
-- This could be a brand userId, agentId, or staffId
ALTER TABLE act_campaigns
ADD COLUMN created_by_user_id VARCHAR(100) NULL;

-- Step 3: Add creator_type column to track who created the campaign
ALTER TABLE act_campaigns
ADD COLUMN creator_type ENUM('brand', 'agent', 'staff') DEFAULT 'brand';

-- Step 4: Backfill existing campaigns (all were created by brands)
-- For brands: business_id = created_by (the brand owns their own campaign)
-- Set created_by_user_id = created_by for existing records
UPDATE act_campaigns 
SET business_id = created_by,
    created_by_user_id = created_by,
    creator_type = 'brand'
WHERE created_by_user_id IS NULL;

-- Step 5: Add indexes for better query performance
ALTER TABLE act_campaigns
ADD INDEX idx_business_id (business_id),
ADD INDEX idx_created_by_user_id (created_by_user_id),
ADD INDEX idx_creator_type (creator_type),
ADD INDEX idx_creator_composite (creator_type, created_by_user_id);

-- ============================================
-- DONE! Migration Complete
-- ============================================

-- To verify, run these queries:
-- SELECT COUNT(*) as total, 
--        SUM(CASE WHEN creator_type = 'brand' THEN 1 ELSE 0 END) as brands,
--        SUM(CASE WHEN creator_type = 'agent' THEN 1 ELSE 0 END) as agents,
--        SUM(CASE WHEN creator_type = 'staff' THEN 1 ELSE 0 END) as staff
-- FROM act_campaigns;
