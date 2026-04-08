-- Migration: Add Creator role to roles table
-- Date: 2026-03-19
-- Description: Add Creator role for campaign managers

-- Check if creator role exists, if not add it
INSERT INTO roles (id, name, description) 
SELECT 8, 'creator', 'Creator - Campaign creator/manager'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'creator');

-- Add creator permissions (same as business + manage team)
INSERT INTO role_permissions (role_id, access_right_id)
SELECT 8, id FROM access_rights 
WHERE name IN (
  'READ', 'WRITE',
  'campaigns:read', 'campaigns:write', 'campaigns:delete',
  'jobs:read', 'jobs:write', 'jobs:delete',
  'payments:read', 'payments:write',
  'wallet:read', 'wallet:withdraw',
  'reports:read', 'reports:write'
) AND 8 NOT IN (SELECT role_id FROM role_permissions WHERE role_id = 8);
