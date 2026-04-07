-- ============================================
-- Add Verification Status to Agents Table
-- This allows tracking agent verification status
-- ============================================

-- Add verification_status column to agents table
ALTER TABLE agents
ADD COLUMN verification_status ENUM('pending', 'verified', 'rejected', 'suspended') DEFAULT 'pending' AFTER status;

-- Add index for verification_status for faster filtering
ALTER TABLE agents
ADD INDEX idx_verification_status (verification_status);

-- Add updated_on column if it doesn't exist (for tracking profile updates)
ALTER TABLE agents
ADD COLUMN updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_on;

-- Backfill existing agents to 'verified' status if they are active
UPDATE agents 
SET verification_status = 'verified'
WHERE status = 'active' AND verification_status = 'pending';

-- ============================================
-- DONE! Migration Complete
-- ============================================

-- To verify, run this query:
-- SELECT 
--   status,
--   verification_status,
--   COUNT(*) as total
-- FROM agents
-- GROUP BY status, verification_status;

