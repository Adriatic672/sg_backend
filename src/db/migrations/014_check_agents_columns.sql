-- ============================================
-- Check Agents Table Columns Before Migration
-- Run this BEFORE running 014_agent_update_fields.sql
-- ============================================

-- Show all columns in agents table
DESCRIBE agents;

-- Alternative: Show detailed column information
SHOW COLUMNS FROM agents;

-- Check specific columns existence
SELECT 
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'agents'
AND COLUMN_NAME IN ('phone', 'country', 'iso_code', 'verification_status', 'updated_on', 'type')
ORDER BY COLUMN_NAME;

-- ============================================
-- Instructions:
-- ============================================
-- 1. Run this script first to see existing columns
-- 2. Note which columns already exist
-- 3. In 014_agent_update_fields.sql, comment out ALTER statements for existing columns
-- 4. Then run 014_agent_update_fields.sql
-- ============================================

