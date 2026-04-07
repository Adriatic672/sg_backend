-- Create agents table and agent_company_assignments mapping table

CREATE TABLE IF NOT EXISTS agents (
  agent_id VARCHAR(64) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_company_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  business_id VARCHAR(64) NOT NULL,
  status ENUM('active','inactive') DEFAULT 'active',
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agent_business (agent_id, business_id),
  CONSTRAINT fk_agent_company_agent FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
  CONSTRAINT fk_agent_company_business FOREIGN KEY (business_id) REFERENCES businesses(business_id)
);


