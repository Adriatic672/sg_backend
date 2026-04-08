-- Job Niches: available job categories for filtering
CREATE TABLE IF NOT EXISTS job_niches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default job niches
INSERT INTO job_niches (name) VALUES 
  ('Fashion & Style'),
  ('Beauty & Skincare'),
  ('Food & Drink'),
  ('Travel'),
  ('Fitness & Wellness'),
  ('Tech & Gadgets'),
  ('Finance & Business'),
  ('Gaming'),
  ('Lifestyle'),
  ('Parenting & Family'),
  ('Music & Entertainment'),
  ('Comedy & Skits'),
  ('Education'),
  ('Sports'),
  ('Home & Decor')
ON DUPLICATE KEY UPDATE name = VALUES(name);
