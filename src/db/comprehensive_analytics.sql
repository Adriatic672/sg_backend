-- Create comprehensive analytics table
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

-- Insert sample data for testing
INSERT INTO `act_comprehensive_analytics` (`analytics_id`, `username`, `platform`, `comprehensive_data`, `created_at`) 
VALUES 
('comp_test_001', 'charlidamelio', 'tiktok', '{"overview":{"followers":156538667,"qualityAudience":{"percentage":85,"count":133058864},"followersGrowth30d":{"percentage":12.5,"label":"Good"},"engagementRate":{"percentage":3.2,"label":"Good"},"postFrequency":{"value":1.5,"unit":"posts/day","label":"Active"}},"audienceQualityScore":{"score":92,"label":"Excellent","insights":["High engagement rate indicates strong audience connection","Large following suggests established presence","Consistent posting frequency"],"ranks":{"global":1234,"country":{"name":"United States","rank":567},"category":{"name":"Entertainment","rank":89}}},"demographics":{"yearlyGrowth":{"percentage":12.5,"label":"Good","followersGained":19567333,"peerGrowthRate":15.5},"followerGrowthTimeline":[]},"estimatedMetrics":{"reach":{"post":{"min":46961600,"max":87214567},"story":{"min":33544000,"max":73796800}},"impressions":125230934,"audienceReachability":{"level":"High","percentBelow1500":15,"peerAverage":25.5},"audienceAuthenticity":{"level":"High","percentAuthentic":85,"peerAverage":78.2}},"audienceBreakdown":{"ageDistribution":[{"range":"13-17","male":15,"female":25},{"range":"18-24","male":20,"female":30},{"range":"25-34","male":10,"female":15},{"range":"35+","male":5,"female":10}],"genderRatio":{"male":35,"female":65,"adults":80},"topCountry":"United States","audienceGeo":[{"country":"United States","percentage":40},{"country":"India","percentage":20},{"country":"Brazil","percentage":15},{"country":"Others","percentage":25}],"audienceType":[{"type":"Engaged Followers","percentage":60},{"type":"Passive Followers","percentage":30},{"type":"Inactive Followers","percentage":10}]}}', NOW()); 