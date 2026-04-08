-- Job Board: brand job posts
CREATE TABLE IF NOT EXISTS jb_job_posts (
  job_id        VARCHAR(64)    PRIMARY KEY,
  brand_id      VARCHAR(64)    NOT NULL,
  title         VARCHAR(255)   NOT NULL,
  description   TEXT           NOT NULL,
  comp_amount   DECIMAL(15,2)  NOT NULL DEFAULT 0,
  comp_currency ENUM('KES','USD') NOT NULL DEFAULT 'KES',
  comp_type     ENUM('cash','product') NOT NULL DEFAULT 'cash',
  min_followers INT            NOT NULL DEFAULT 0,
  niche         VARCHAR(255)   NULL,
  deadline      DATE           NOT NULL,
  status        ENUM('active','closed','deleted') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jb_brand  (brand_id),
  INDEX idx_jb_status (status),
  INDEX idx_jb_deadline (deadline)
);

-- Job Board: creator interest expressions
CREATE TABLE IF NOT EXISTS jb_job_interests (
  interest_id VARCHAR(64)  PRIMARY KEY,
  job_id      VARCHAR(64)  NOT NULL,
  creator_id  VARCHAR(64)  NOT NULL,
  status      ENUM('pending','shortlisted','rejected') NOT NULL DEFAULT 'pending',
  note        TEXT         NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY  uniq_jb_job_creator (job_id, creator_id),
  INDEX idx_jb_interest_job     (job_id),
  INDEX idx_jb_interest_creator (creator_id)
);
