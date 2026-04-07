-- Unify agents and business_staff into one table with type and created_by columns

-- Add new columns to business_staff
ALTER TABLE business_staff 
ADD COLUMN type ENUM('agent', 'staff') NOT NULL DEFAULT 'staff' AFTER role,
ADD COLUMN created_by ENUM('admin', 'client') NOT NULL DEFAULT 'client' AFTER type;

-- Make business_id nullable for agents
ALTER TABLE business_staff 
MODIFY COLUMN business_id VARCHAR(64) NULL;

-- Update existing business_staff rows
UPDATE business_staff 
SET type = 'staff', created_by = 'client' 
WHERE type IS NULL OR type = 'staff';

-- Migrate agents table data to business_staff
INSERT INTO business_staff (
  staff_id, 
  business_id, 
  first_name, 
  last_name, 
  email, 
  role, 
  type, 
  created_by, 
  password, 
  status, 
  created_on
)
SELECT 
  agent_id as staff_id,
  NULL as business_id,
  first_name,
  last_name,
  email,
  'agent' as role,
  'agent' as type,
  'admin' as created_by,
  password,
  status,
  created_on
FROM agents
WHERE email NOT IN (SELECT email FROM business_staff);

-- Update agent_company_assignments to use staff_id from business_staff
-- (This assumes agent_id format matches staff_id format after migration)
