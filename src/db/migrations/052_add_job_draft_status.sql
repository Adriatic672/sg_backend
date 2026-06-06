-- Allow brand job posts to be saved privately before publishing.
ALTER TABLE `jb_job_posts`
  MODIFY COLUMN `status` ENUM('draft','active','closed','deleted') NOT NULL DEFAULT 'active';
