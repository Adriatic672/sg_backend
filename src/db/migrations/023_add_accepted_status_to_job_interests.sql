-- Add 'accepted' and 'completed' status to jb_job_interests table for accept/decline workflow
ALTER TABLE `jb_job_interests` CHANGE `status` `status` ENUM('pending','shortlisted','accepted','rejected','completed') NOT NULL DEFAULT 'pending';
