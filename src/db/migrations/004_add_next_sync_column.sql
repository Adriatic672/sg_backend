-- Add next_sync column to sm_site_users table
ALTER TABLE sm_site_users 
ADD COLUMN next_sync DATETIME NULL 
COMMENT 'Next scheduled sync date for analytics';

-- Add index for better performance on sync queries
CREATE INDEX idx_next_sync ON sm_site_users(next_sync);
CREATE INDEX idx_verified_next_sync ON sm_site_users(is_verified, next_sync); 