-- Add has_temporary_password field to admin_users table
ALTER TABLE admin_users ADD COLUMN has_temporary_password BOOLEAN DEFAULT FALSE AFTER password;
