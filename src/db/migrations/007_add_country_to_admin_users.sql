-- Add country field to admin_users table
ALTER TABLE admin_users ADD COLUMN country VARCHAR(100) NULL AFTER last_name;
