-- Quick fix for notifications
-- Run this in your database (phpMyAdmin or MySQL)

-- Fix 1: Update all existing notifications to have status 'unread'
UPDATE notifications SET status = 'unread' WHERE status IS NULL OR status = '';

-- Fix 2: If channel is NULL, set to 'ALL'  
UPDATE notifications SET channel = 'ALL' WHERE channel IS NULL OR channel = '';

-- Verify the fix
SELECT status, COUNT(*) as count FROM notifications GROUP BY status;
