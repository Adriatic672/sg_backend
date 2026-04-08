-- Add next_sync column to sm_site_users table (if exists)
-- Migration 004: Skip if base table doesn't exist
-- This migration requires the base schema to be installed separately

SELECT 'Migration 004 skipped - base table sm_site_users not found in this repo' AS status;