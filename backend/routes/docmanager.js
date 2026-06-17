import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS doc_folders (
    id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL,
    parent_id INT REFERENCES doc_folders(id) ON DELETE CASCADE,
    created_by INT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY, folder_id INT REFERENCES doc_folders(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL, file_url TEXT NOT NULL,
    file_size BIGINT DEFAULT 0, mime_type VARCHAR(100),
    created_by INT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS document_shares (
    id SERIAL PRIMARY KEY, document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    permission VARCHAR(20) DEFAULT 'view', shared_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (document_id, user_id)
  )`).catch(() => {});
})();

// ── FOLDERS ───────────────────────────────────────────────────────────────────
router.get('/folders', authMiddleware, async (req, res) => {
  const { parent_id } = req.query;
  const where = parent_id ? `WHERE parent_id=$1` : `WHERE parent_id IS NULL`;
  const params = parent_id ? [parent_id] : [];
  try {
    const { rows } = await pool.query(`
      SELECT f.*, p.name AS created_by_name,
             COUNT(d.id)::int AS doc_count,
             COUNT(sf.id)::int AS subfolder_count
      FROM doc_folders f
      LEFT JOIN profiles p ON p.id = f.created_by
      LEFT JOIN documents d ON d.folder_id = f.id
      LEFT JOIN doc_folders sf ON sf.parent_id = f.id
      ${where} GROUP BY f.id, p.name ORDER BY f.name
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/folders', authMiddleware, async (req, res) => {
  const { name, parent_id } = req.body;
  const userId = req.user?.id;
  try {
    const { rows } = await pool.query(
      `INSERT INTO doc_folders (name, parent_id, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [name, parent_id||null, userId||null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/folders/:id', authMiddleware, async (req, res) => {
  const { name, parent_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE doc_folders SET name=$1, parent_id=$2 WHERE id=$3 RETURNING *`,
      [name, parent_id||null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/folders/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM doc_folders WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DOCUMENTS ─────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { folder_id, q } = req.query;
  const filters = []; const params = [];
  if (folder_id) { params.push(folder_id); filters.push(`d.folder_id=$${params.length}`); }
  else           { filters.push(`d.folder_id IS NULL`); }
  if (q)         { params.push(`%${q}%`);   filters.push(`d.name ILIKE $${params.length}`); }
  const where = `WHERE ${filters.join(' AND ')}`;
  try {
    const { rows } = await pool.query(`
      SELECT d.*, p.name AS created_by_name,
             f.name AS folder_name
      FROM documents d
      LEFT JOIN profiles p ON p.id = d.created_by
      LEFT JOIN doc_folders f ON f.id = d.folder_id
      ${where} ORDER BY d.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { name, file_url, file_size, mime_type, folder_id } = req.body;
  const userId = req.user?.id;
  try {
    const { rows } = await pool.query(`
      INSERT INTO documents (name, file_url, file_size, mime_type, folder_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [name, file_url, file_size||0, mime_type||null, folder_id||null, userId||null]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { name, folder_id } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE documents SET name=$1, folder_id=$2 WHERE id=$3 RETURNING *`,
      [name, folder_id||null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM documents WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SEARCH (cross-folder) ─────────────────────────────────────────────────────
router.get('/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const { rows } = await pool.query(`
      SELECT d.*, f.name AS folder_name, p.name AS created_by_name
      FROM documents d
      LEFT JOIN doc_folders f ON f.id = d.folder_id
      LEFT JOIN profiles p ON p.id = d.created_by
      WHERE d.name ILIKE $1 ORDER BY d.created_at DESC LIMIT 30
    `, [`%${q}%`]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
