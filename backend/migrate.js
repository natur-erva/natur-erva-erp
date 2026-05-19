/**
 * migrate.js — Executa todas as migrations pendentes contra o PostgreSQL.
 * Uso: node migrate.js
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

const pool = new Pool({
  host:     process.env.PG_HOST,
  port:     parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl:      false,
  connectionTimeoutMillis: 10000,
});

// Lista ordenada de migrations para executar
const MIGRATIONS = [
  '../sql/migrations/ADD_CATEGORY_UNIT_COLUMNS.sql',
  '../sql/migrations/CREATE_TRACKING_TABLES.sql',
  '../sql/migrations/CREATE_STOCK_TABLES.sql',
  '../sql/migrations/SEED_DELIVERY_ZONES_MAPUTO.sql',
];

async function run() {
  const client = await pool.connect();
  console.log(`✅ Conectado a ${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`);

  // Criar tabela de controlo de migrations se não existir
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const relPath of MIGRATIONS) {
    const filePath = path.resolve(__dirname, relPath);
    const filename = path.basename(filePath);

    // Verificar se já foi aplicada
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE filename = $1', [filename]
    );
    if (rows.length > 0) {
      console.log(`⏭️  ${filename} — já aplicada, ignorada`);
      continue;
    }

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  ${filename} — ficheiro não encontrado, ignorado`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`\n🔧 A aplicar: ${filename}`);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations (filename) VALUES ($1)', [filename]
      );
      await client.query('COMMIT');
      console.log(`✅ ${filename} — aplicada com sucesso`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ ${filename} — ERRO: ${err.message}`);
      // Continuar com outras migrations mesmo se uma falhar
    }
  }

  client.release();
  await pool.end();
  console.log('\n🏁 Migrations concluídas.');
}

run().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
