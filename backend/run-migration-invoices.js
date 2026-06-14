import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: false
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../sql/migrations/CREATE_INVOICES.sql'), 'utf8');

const client = await pool.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' LIMIT 1`);
  console.log('✅ Migração completa!');
  console.log('  invoices table:', rows.length > 0 ? '✅' : '❌');
} catch (err) {
  console.error('❌ Erro:', err.message);
} finally {
  client.release();
  await pool.end();
}
