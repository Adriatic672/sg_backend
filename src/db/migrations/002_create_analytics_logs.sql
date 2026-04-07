-- Migration: 002_create_analytics_logs
-- Description: Create analytics logs table for storing basic analytics data
-- Date: 2025-07-31

CREATE TABLE IF NOT EXISTS `act_analytics_logs` (
  `analytics_id` varchar(50) NOT NULL,
  `username` varchar(100) NOT NULL,
  `platform` varchar(20) NOT NULL,
  `post_id` varchar(100) DEFAULT NULL,
  `total_posts` int(11) NOT NULL DEFAULT 0,
  `total_likes` bigint(20) NOT NULL DEFAULT 0,
  `total_comments` bigint(20) NOT NULL DEFAULT 0,
  `total_shares` bigint(20) NOT NULL DEFAULT 0,
  `total_views` bigint(20) NOT NULL DEFAULT 0,
  `avg_views_per_post` decimal(10,2) NOT NULL DEFAULT 0.00,
  `engagement_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `follower_count` bigint(20) NOT NULL DEFAULT 0,
  `growth_rate` decimal(5,2) DEFAULT NULL,
  `best_post_id` varchar(100) DEFAULT NULL,
  `worst_post_id` varchar(100) DEFAULT NULL,
  `tracking_period` varchar(20) NOT NULL DEFAULT '2_months',
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`analytics_id`),
  KEY `idx_username` (`username`),
  KEY `idx_platform` (`platform`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_tracking_period` (`tracking_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 