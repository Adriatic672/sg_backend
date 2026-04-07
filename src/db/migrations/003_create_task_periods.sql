-- Migration: 003_create_task_periods
-- Description: Create task periods table for tracking repetitive task periods
-- Date: 2025-07-31

CREATE TABLE IF NOT EXISTS `act_task_periods` (
  `period_id` varchar(50) NOT NULL,
  `task_id` varchar(50) NOT NULL,
  `campaign_id` varchar(50) NOT NULL,
  `period_start_date` datetime NOT NULL,
  `period_end_date` datetime NOT NULL,
  `status` enum('active','completed','expired') NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`period_id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 