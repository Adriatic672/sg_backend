-- Create operation_logs table for tracking maker-checker operations
CREATE TABLE operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  details JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_operation (operation),
  INDEX idx_timestamp (timestamp)
);
