-- Fix existing notifications that don't have a status set
-- Run this to fix notifications that won't show in the app

-- First, check what status values exist currently
SELECT status, COUNT(*) as count FROM notifications GROUP BY status;

-- Update any NULL or empty status to 'unread'
UPDATE notifications SET status = 'unread' WHERE status IS NULL OR status = '' OR status = 'unread';

-- If you want to see all notifications regardless of status, you can also update them all:
-- UPDATE notifications SET status = 'unread' WHERE status NOT IN ('unread', 'read');
