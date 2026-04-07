-- Update maker_checker_requests table to support automatic execution
ALTER TABLE maker_checker_requests 
MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'executed') DEFAULT 'pending';

-- Add executed_at timestamp
ALTER TABLE maker_checker_requests 
ADD COLUMN executed_at TIMESTAMP NULL AFTER date_last_approved;
