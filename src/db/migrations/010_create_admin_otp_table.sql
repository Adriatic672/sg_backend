-- Create admin_otp table for storing OTP codes for admin password reset
CREATE TABLE admin_otp (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_otp (otp),
  INDEX idx_expires (expires_at)
);
