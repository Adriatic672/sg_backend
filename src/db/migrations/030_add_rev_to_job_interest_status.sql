-- Add 'rev' status to jb_job_interests status enum
-- This allows brands to request revisions on submitted work

ALTER TABLE jb_job_interests 
MODIFY COLUMN status ENUM('pending', 'shortlisted', 'accepted', 'work_done', 'completed', 'rejected', 'rev') DEFAULT 'pending';
