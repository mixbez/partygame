import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool;

export async function initDb() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log('🗄️ Running database migrations...');

  try {
    // Run migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`  Running: ${file}`);
      await pool.query(sql);
    }

    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    throw error;
  }
}

export function getDb() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
  }
}
