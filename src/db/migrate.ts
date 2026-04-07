import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

interface MigrationRecord {
  migration_id: string;
  filename: string;
  executed_at: string;
}

class MigrationRunner {
  private connection: mysql.Connection;

  constructor() {
    this.connection = null as any;
  }

  async connect() {
    this.connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || '2025_socialgems'
    });
  }

  async createMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`migrations\` (
        \`migration_id\` varchar(100) NOT NULL,
        \`filename\` varchar(255) NOT NULL,
        \`executed_at\` datetime NOT NULL,
        PRIMARY KEY (\`migration_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    await this.connection.execute(createTableSQL);
    console.log('✅ Migrations table created/verified');
  }

  async getExecutedMigrations(): Promise<string[]> {
    const [rows] = await this.connection.execute('SELECT migration_id FROM migrations ORDER BY executed_at');
    return (rows as any[]).map(row => row.migration_id);
  }

  async executeMigration(filename: string, sql: string) {
    try {
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        if (statement.trim()) {
          await this.connection.execute(statement);
        }
      }

      // Record the migration
      const migrationId = filename.replace('.sql', '');
      await this.connection.execute(
        'INSERT INTO migrations (migration_id, filename, executed_at) VALUES (?, ?, NOW())',
        [migrationId, filename]
      );

      console.log(`✅ Executed migration: ${filename}`);
    } catch (error) {
      console.error(`❌ Error executing migration ${filename}:`, error);
      throw error;
    }
  }

  async runMigrations() {
    try {
      await this.connect();
      console.log('🔧 Starting database migrations...\n');

      await this.createMigrationsTable();

      const migrationsDir = path.join(__dirname, 'migrations');
      const files = await readdir(migrationsDir);
      
      // Filter and sort migration files
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      const executedMigrations = await this.getExecutedMigrations();
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file.replace('.sql', ''))
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ All migrations are up to date');
        return;
      }

      console.log(`📋 Found ${pendingMigrations.length} pending migrations:`);
      pendingMigrations.forEach(file => console.log(`   - ${file}`));
      console.log('');

      for (const filename of pendingMigrations) {
        const filePath = path.join(migrationsDir, filename);
        const sql = await readFile(filePath, 'utf8');
        await this.executeMigration(filename, sql);
      }

      console.log('\n🎉 All migrations completed successfully!');

    } catch (error) {
      console.error('💥 Migration failed:', error);
      throw error;
    } finally {
      if (this.connection) {
        await this.connection.end();
      }
    }
  }

  async rollbackMigration(migrationId: string) {
    try {
      await this.connect();
      console.log(`🔄 Rolling back migration: ${migrationId}`);

      // Remove from migrations table
      await this.connection.execute(
        'DELETE FROM migrations WHERE migration_id = ?',
        [migrationId]
      );

      console.log(`✅ Rolled back migration: ${migrationId}`);
    } catch (error) {
      console.error(`❌ Error rolling back migration ${migrationId}:`, error);
      throw error;
    } finally {
      if (this.connection) {
        await this.connection.end();
      }
    }
  }

  async showStatus() {
    try {
      await this.connect();
      console.log('📊 Migration Status:\n');

      const migrationsDir = path.join(__dirname, 'migrations');
      const files = await readdir(migrationsDir);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort();

      const executedMigrations = await this.getExecutedMigrations();

      console.log('Executed migrations:');
      executedMigrations.forEach(migrationId => {
        console.log(`   ✅ ${migrationId}`);
      });

      console.log('\nPending migrations:');
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file.replace('.sql', ''))
      );

      if (pendingMigrations.length === 0) {
        console.log('   (none)');
      } else {
        pendingMigrations.forEach(file => {
          console.log(`   ⏳ ${file}`);
        });
      }

    } catch (error) {
      console.error('❌ Error checking migration status:', error);
    } finally {
      if (this.connection) {
        await this.connection.end();
      }
    }
  }
}

// CLI interface
async function main() {
  const runner = new MigrationRunner();
  const command = process.argv[2];

  try {
    switch (command) {
      case 'migrate':
        await runner.runMigrations();
        break;
      case 'status':
        await runner.showStatus();
        break;
      case 'rollback':
        const migrationId = process.argv[3];
        if (!migrationId) {
          console.error('❌ Please provide a migration ID to rollback');
          process.exit(1);
        }
        await runner.rollbackMigration(migrationId);
        break;
      default:
        console.log('🔧 Database Migration Tool');
        console.log('');
        console.log('Usage:');
        console.log('  npm run migrate        - Run all pending migrations');
        console.log('  npm run migrate:status - Show migration status');
        console.log('  npm run migrate:rollback <id> - Rollback a specific migration');
        console.log('');
        console.log('Examples:');
        console.log('  npm run migrate');
        console.log('  npm run migrate:status');
        console.log('  npm run migrate:rollback 001_create_comprehensive_analytics');
    }
  } catch (error) {
    console.error('💥 Migration tool failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default MigrationRunner; 