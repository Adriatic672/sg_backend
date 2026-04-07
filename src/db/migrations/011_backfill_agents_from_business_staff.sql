-- Backfill agents and assignments from existing business_staff with role 'agent'

-- Insert distinct agents
INSERT INTO agents (agent_id, first_name, last_name, email, password, status, created_on)
SELECT DISTINCT 
  CONCAT('agt', SUBSTRING(MD5(CONCAT(staff_id, email)), 1, 20)) AS agent_id,
  first_name,
  last_name,
  email,
  password,
  CASE WHEN status = 'active' THEN 'active' ELSE 'inactive' END as status,
  COALESCE(created_on, NOW())
FROM business_staff
WHERE role = 'agent'
  AND email NOT IN (SELECT email FROM agents);

-- Insert assignments for those agents that have a business_id
INSERT IGNORE INTO agent_company_assignments (agent_id, business_id, status, created_on)
SELECT 
  (SELECT agent_id FROM agents a WHERE a.email = bs.email LIMIT 1) as agent_id,
  bs.business_id,
  CASE WHEN bs.status = 'active' THEN 'active' ELSE 'inactive' END as status,
  COALESCE(bs.created_on, NOW())
FROM business_staff bs
WHERE bs.role = 'agent' AND bs.business_id IS NOT NULL;


