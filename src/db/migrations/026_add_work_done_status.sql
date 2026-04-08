-- Add 'work_done' status to jb_job_interests table for influencer mark work done workflow
ALTER TABLE `jb_job_interests` CHANGE `status` `status` ENUM('pending','shortlisted','accepted','work_done','rejected','completed') NOT NULL DEFAULT 'pending';
