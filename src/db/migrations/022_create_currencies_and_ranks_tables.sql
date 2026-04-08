-- Currencies: available currencies for payments
CREATE TABLE IF NOT EXISTS currencies (
  code VARCHAR(3) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default currencies
INSERT INTO currencies (code, name, symbol) VALUES 
  ('UGX', 'Ugandan Shilling', 'USh'),
  ('USD', 'US Dollar', 'USD'),
  ('KES', 'Kenyan Shilling', 'KSh'),
  ('GBP', 'British Pound', 'GBP'),
  ('EUR', 'Euro', 'EUR')
ON DUPLICATE KEY UPDATE name = VALUES(name), symbol = VALUES(symbol);

-- Influencer Ranks: ranking system for influencers
CREATE TABLE IF NOT EXISTS influencer_ranks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  min_points INT NOT NULL DEFAULT 0,
  max_points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default ranks
INSERT INTO influencer_ranks (name, min_points, max_points) VALUES 
  ('Bronze', 0, 1000),
  ('Silver', 1001, 5000),
  ('Gold', 5001, 10000)
ON DUPLICATE KEY UPDATE name = VALUES(name), min_points = VALUES(min_points), max_points = VALUES(max_points);
