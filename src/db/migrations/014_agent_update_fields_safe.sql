-- ============================================
-- Agent Update Fields Migration (SAFE VERSION)
-- Automatically checks if columns exist before adding
-- ============================================

DELIMITER $$

-- Procedure to add column if it doesn't exist
DROP PROCEDURE IF EXISTS AddColumnIfNotExists$$
CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(128),
    IN columnName VARCHAR(128),
    IN columnDefinition VARCHAR(512)
)
BEGIN
    DECLARE columnExists INT DEFAULT 0;
    
    SELECT COUNT(*) INTO columnExists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = tableName
    AND COLUMN_NAME = columnName;
    
    IF columnExists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', columnName, ' ', columnDefinition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Added column: ', columnName) AS Result;
    ELSE
        SELECT CONCAT('Column already exists: ', columnName) AS Result;
    END IF;
END$$

-- Procedure to add index if it doesn't exist
DROP PROCEDURE IF EXISTS AddIndexIfNotExists$$
CREATE PROCEDURE AddIndexIfNotExists(
    IN tableName VARCHAR(128),
    IN indexName VARCHAR(128),
    IN indexColumns VARCHAR(256)
)
BEGIN
    DECLARE indexExists INT DEFAULT 0;
    
    SELECT COUNT(*) INTO indexExists
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = tableName
    AND INDEX_NAME = indexName;
    
    IF indexExists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD INDEX ', indexName, ' (', indexColumns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Added index: ', indexName) AS Result;
    ELSE
        SELECT CONCAT('Index already exists: ', indexName) AS Result;
    END IF;
END$$

DELIMITER ;

-- ============================================
-- Add Columns (safe - checks if exists first)
-- ============================================

CALL AddColumnIfNotExists('agents', 'phone', 'VARCHAR(20) NULL AFTER email');
CALL AddColumnIfNotExists('agents', 'country', 'VARCHAR(100) NULL AFTER phone');
CALL AddColumnIfNotExists('agents', 'iso_code', 'VARCHAR(5) NULL AFTER country');
CALL AddColumnIfNotExists('agents', 'type', "VARCHAR(50) DEFAULT 'standard' AFTER status");
CALL AddColumnIfNotExists('agents', 'verification_status', "ENUM('pending', 'verified', 'rejected', 'suspended') DEFAULT 'pending' AFTER status");
CALL AddColumnIfNotExists('agents', 'updated_on', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_on');

-- ============================================
-- Add Indexes (safe - checks if exists first)
-- ============================================

CALL AddIndexIfNotExists('agents', 'idx_agents_phone', 'phone');
CALL AddIndexIfNotExists('agents', 'idx_agents_country', 'country');
CALL AddIndexIfNotExists('agents', 'idx_agents_iso_code', 'iso_code');
CALL AddIndexIfNotExists('agents', 'idx_agents_type', 'type');
CALL AddIndexIfNotExists('agents', 'idx_agents_verification_status', 'verification_status');

-- ============================================
-- Cleanup procedures
-- ============================================

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;

-- ============================================
-- Verification
-- ============================================

-- Show updated table structure
DESCRIBE agents;

-- ============================================
-- DONE! Migration Complete
-- ============================================

