-- Create maker_checker_requests table
CREATE TABLE maker_checker_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(50) UNIQUE NOT NULL,
  operation_type ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  primary_key_value VARCHAR(100) NULL, -- NULL for CREATE, has value for UPDATE/DELETE
  maker_user_id VARCHAR(100) NOT NULL,
  request_data JSON NOT NULL,
  approvers_required INT DEFAULT 1,
  approvers_approved INT DEFAULT 0,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  date_sent TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_last_approved TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_status (status),
  INDEX idx_maker (maker_user_id),
  INDEX idx_operation (operation_type, table_name)
);

-- Create maker_checker_approvals table
CREATE TABLE maker_checker_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(50) NOT NULL,
  maker_user_id VARCHAR(100) NOT NULL,
  approver_user_id VARCHAR(100)  NULL,
  action ENUM('approved', 'rejected') NOT NULL,
  notes TEXT,
  approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (request_id) REFERENCES maker_checker_requests(request_id) ON DELETE CASCADE,
  UNIQUE KEY unique_approval (request_id, approver_user_id),
  INDEX idx_request (request_id),
  INDEX idx_approver (approver_user_id)
);
