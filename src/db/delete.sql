CREATE TABLE delete_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  influencer_id VARCHAR(64) NOT NULL,
  userId VARCHAR(64) NOT NULL,
  reason TEXT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
