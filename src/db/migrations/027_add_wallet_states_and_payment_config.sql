-- Migration: Create campaign_payment_config table
-- Date: 2026-03-19

CREATE TABLE IF NOT EXISTS campaign_payment_config (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id VARCHAR(50) NOT NULL,
  job_id VARCHAR(50) DEFAULT NULL,
  compensation_type ENUM('CASH', 'PRODUCT', 'CASH_AND_PRODUCT') NOT NULL DEFAULT 'CASH',
  currency ENUM('KES', 'USD') NOT NULL DEFAULT 'KES',
  payment_method ENUM('M_PESA', 'BANK', 'WALLET', 'STRIPE') NOT NULL DEFAULT 'WALLET',
  payment_status ENUM('PENDING', 'PROCESSING', 'AVAILABLE', 'WITHDRAWN', 'FAILED') NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(13,2) NOT NULL DEFAULT 0.00,
  fee DECIMAL(13,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(13,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(13,2) NOT NULL DEFAULT 0.00,
  withdrawn_amount DECIMAL(13,2) NOT NULL DEFAULT 0.00,
  payment_reference VARCHAR(100) DEFAULT NULL,
  admin_override_notes TEXT DEFAULT NULL,
  overridden_by VARCHAR(50) DEFAULT NULL,
  overridden_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_campaign_id (campaign_id),
  INDEX idx_job_id (job_id),
  INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
