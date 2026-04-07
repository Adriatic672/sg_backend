-- Roles System Tables
-- This file contains the database schema for the roles and permissions system

-- Table 1: access_rights - Defines all available permissions/access rights
CREATE TABLE access_rights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general', -- Group permissions by category
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table 2: roles - Defines all available roles in the system
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table 3: role_permissions - Maps roles to their permissions (many-to-many)
CREATE TABLE role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  access_right_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (access_right_id) REFERENCES access_rights(id) ON DELETE CASCADE,
  UNIQUE KEY unique_role_permission (role_id, access_right_id)
);

-- Table 4: user_roles - Maps users to their roles
CREATE TABLE user_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  role_id INT NOT NULL,
  assigned_by VARCHAR(100), -- Who assigned this role
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL, -- Optional role expiration
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_role (user_id, role_id)
);

-- Insert access rights
INSERT INTO access_rights (name, description, category) VALUES
-- Basic permissions
('READ', 'Ability to read/view data', 'basic'),
('WRITE', 'Ability to create and edit data', 'basic'),
('DELETE', 'Ability to delete data', 'basic'),

-- User management
('DELETE_USER', 'Ability to delete user accounts', 'user_management'),
('MANAGE_USERS', 'Ability to manage user accounts and profiles', 'user_management'),

-- Role and permission management
('MANAGE_ROLES', 'Ability to create, edit, and delete roles', 'role_management'),
('ASSIGN_ROLES', 'Ability to assign roles to users', 'role_management'),

-- System management
('MANAGE_SYSTEM', 'Ability to manage system settings and configurations', 'system'),
('MANAGE_SETTINGS', 'Ability to modify application settings', 'system'),

-- Analytics and reporting
('VIEW_ANALYTICS', 'Ability to view analytics and reports', 'analytics'),
('EXPORT_DATA', 'Ability to export data and reports', 'analytics'),

-- Financial management
('MANAGE_PAYMENTS', 'Ability to manage payments and transactions', 'financial'),
('VIEW_FINANCIAL_DATA', 'Ability to view financial information', 'financial'),

-- Campaign management
('MANAGE_CAMPAIGNS', 'Ability to create and manage campaigns', 'campaigns'),
('APPROVE_CAMPAIGNS', 'Ability to approve or reject campaigns', 'campaigns'),

-- Content management
('MANAGE_CONTENT', 'Ability to manage content and posts', 'content'),
('MODERATE_CONTENT', 'Ability to moderate user-generated content', 'content'),

-- Notifications
('SEND_NOTIFICATIONS', 'Ability to send system notifications', 'notifications'),
('MANAGE_NOTIFICATIONS', 'Ability to manage notification settings', 'notifications');

-- Insert default roles with numeric IDs
INSERT INTO roles (id, name, description) VALUES
(1, 'super_admin', 'Super Administrator - Full system access'),
(2, 'admin', 'Administrator - High level access'),
(3, 'moderator', 'Moderator - Content and user management'),
(4, 'business', 'Business User - Campaign and analytics access'),
(5, 'influencer', 'Influencer - Basic user access'),
(6, 'test', 'Test User - Limited access for testing'),
(7, 'viewer', 'Viewer - Read-only access');

-- Assign permissions to roles
-- Super Admin (ID: 1) - All permissions
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 1, id FROM access_rights;

-- Admin (ID: 2) - Most permissions except system management
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 2, id FROM access_rights 
WHERE name NOT IN ('MANAGE_SYSTEM', 'MANAGE_ROLES');

-- Moderator (ID: 3) - Content and user management
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 3, id FROM access_rights 
WHERE name IN ('READ', 'WRITE', 'MANAGE_CONTENT', 'MANAGE_USERS', 'VIEW_ANALYTICS', 'MODERATE_CONTENT', 'SEND_NOTIFICATIONS');

-- Business (ID: 4) - Campaign and analytics access
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 4, id FROM access_rights 
WHERE name IN ('READ', 'WRITE', 'MANAGE_CAMPAIGNS', 'VIEW_ANALYTICS', 'MANAGE_CONTENT', 'EXPORT_DATA', 'VIEW_FINANCIAL_DATA');

-- Influencer (ID: 5) - Basic user access
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 5, id FROM access_rights 
WHERE name IN ('READ', 'WRITE', 'MANAGE_CONTENT');

-- Test (ID: 6) - Limited access for testing
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 6, id FROM access_rights 
WHERE name IN ('READ');

-- Viewer (ID: 7) - Read-only access
INSERT INTO role_permissions (role_id, access_right_id) 
SELECT 7, id FROM access_rights 
WHERE name IN ('READ');

-- Create indexes for better performance
CREATE INDEX idx_access_rights_active ON access_rights(is_active);
CREATE INDEX idx_access_rights_category ON access_rights(category);
CREATE INDEX idx_roles_active ON roles(is_active);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_access_right_id ON role_permissions(access_right_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_active ON user_roles(is_active); 