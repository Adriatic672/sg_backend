-- Migration: 001_create_comprehensive_analytics
-- Description: Create comprehensive analytics table for storing detailed influencer analytics
-- Date: 2025-07-31

CREATE TABLE IF NOT EXISTS `act_comprehensive_analytics` (
  `analytics_id` varchar(50) NOT NULL,
  `username` varchar(100) NOT NULL,
  `platform` varchar(20) NOT NULL,
  `comprehensive_data` JSON NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`analytics_id`),
  KEY `idx_username` (`username`),
  KEY `idx_platform` (`platform`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 