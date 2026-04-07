-- ============================================
-- Agent Update Fields Migration
-- Ensures all agent fields are present and provides update capabilities
-- ============================================

-- IMPORTANT: If a column already exists, comment out that ALTER statement
-- Or check existing columns first with: DESCRIBE agents;

-- Add phone column (comment out if exists)
ALTER TABLE agents
ADD COLUMN phone VARCHAR(20) NULL AFTER email;

-- Add country column (comment out if exists)
ALTER TABLE agents
ADD COLUMN country VARCHAR(100) NULL AFTER phone;

-- Add iso_code column (comment out if exists)
ALTER TABLE agents
ADD COLUMN iso_code VARCHAR(5) NULL AFTER country;

-- Add verification_status column (comment out if exists)
ALTER TABLE agents
ADD COLUMN verification_status ENUM('pending', 'verified', 'rejected', 'suspended') 
DEFAULT 'pending' AFTER status;

-- Add updated_on column (comment out if exists)
ALTER TABLE agents
ADD COLUMN updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP 
AFTER created_on;

-- Add type column (comment out if exists)
ALTER TABLE agents
ADD COLUMN type VARCHAR(50) DEFAULT 'standard' AFTER status;

-- Add indexes for better query performance
ALTER TABLE agents ADD INDEX idx_agents_phone (phone);
ALTER TABLE agents ADD INDEX idx_agents_country (country);
ALTER TABLE agents ADD INDEX idx_agents_iso_code (iso_code);
ALTER TABLE agents ADD INDEX idx_agents_type (type);

-- ============================================
-- Example Update Queries
-- ============================================

-- Update agent personal information
-- UPDATE agents 
-- SET 
--   first_name = 'John',
--   last_name = 'Doe',
--   phone = '+1234567890',
--   country = 'United States',
--   iso_code = 'US'
-- WHERE agent_id = 'agt123';

-- Update agent status
-- UPDATE agents 
-- SET status = 'active' 
-- WHERE agent_id = 'agt123';

-- Update agent verification status
-- UPDATE agents 
-- SET verification_status = 'verified' 
-- WHERE agent_id = 'agt123';

-- Update agent type
-- UPDATE agents 
-- SET type = 'premium' 
-- WHERE agent_id = 'agt123';

-- Update agent email (careful - this affects login)
-- UPDATE agents 
-- SET email = 'newemail@example.com' 
-- WHERE agent_id = 'agt123';

-- Deactivate an agent
-- UPDATE agents 
-- SET status = 'inactive', verification_status = 'suspended'
-- WHERE agent_id = 'agt123';

-- Reactivate an agent
-- UPDATE agents 
-- SET status = 'active', verification_status = 'verified'
-- WHERE agent_id = 'agt123';

-- ============================================
-- Verification Query
-- ============================================

-- Check agent table structure
DESCRIBE agents;

-- View all agents with their current information
-- SELECT 
--   agent_id,
--   CONCAT(first_name, ' ', last_name) as full_name,
--   email,
--   phone,
--   country,
--   iso_code,
--   status,
--   type,
--   verification_status,
--   created_on,
--   updated_on
-- FROM agents
-- ORDER BY created_on DESC;

-- ============================================
-- DONE! Migration Complete
-- ============================================

