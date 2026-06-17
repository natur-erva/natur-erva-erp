import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS ticket_categories (
    id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL,
    description TEXT, color VARCHAR(7) DEFAULT '#635BFF'
  )`).catch(() => {});
  await pool.query(`INSERT INTO ticket_categories (name,color) VALUES
    ('Suporte Técnico','#0a84ff'),('Faturação','#ff9f0a'),
    ('Entrega','#30d158'),('Produto','#ff453a'),('Outro','#8e8e93')
    ON CONFLICT DO NOTHING`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, description TEXT,
    status VARCHAR(20) DEFAULT 'open', priority VARCHAR(20) DEFAULT 'medium',
    category_id INT REFERENCES ticket_categories(id) ON DELETE SET NULL,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    assigned_to INT REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS ticket_messages (
    id SERIAL PRIMARY KEY, ticket_id INT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id INT REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL, is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
})();

// ── CATEGORIES ────────────────────────────────────────────────────────────────
router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM ticket_categories ORDER BY name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TICKETS ───────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { status, priority, assigned_to, q } = req.query;
  const filters = []; const params = [];
  if (status)      { params.push(status);      filters.push(`t.status=$${params.length}`); }
  if (priority)    { params.push(priority);    filters.push(`t.priority=$${params.length}`); }
  if (assigned_to) { params.push(assigned_to); filters.push(`t.assigned_to=$${params.length}`); }
  if (q)           { params.push(`%${q}%`);    filters.push(`t.title ILIKE $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(`
      SELECT t.*, tc.name AS category_name, tc.color AS category_color,
             c.name AS customer_name, p.name AS assigned_name,
             COUNT(tm.id)::int AS message_count
      FROM support_tickets t
      LEFT JOIN ticket_categories tc ON tc.id = t.category_id
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN profiles p ON p.id = t.assigned_to
      LEFT JOIN ticket_messages tm ON tm.ticket_id = t.id
      ${where}
      GROUP BY t.id, tc.name, tc.color, c.name, p.name
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        t.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='open')::int AS open,
        COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status='resolved')::int AS resolved,
        COUNT(*) FILTER (WHERE priority='urgent')::int AS urgent,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at,NOW()) - created_at))/3600)::numeric,1) AS avg_hours
      FROM support_tickets
    `);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, tc.name AS category_name, tc.color AS category_color,
             c.name AS customer_name, p.name AS assigned_name
      FROM support_tickets t
      LEFT JOIN ticket_categories tc ON tc.id = t.category_id
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN profiles p ON p.id = t.assigned_to
      WHERE t.id=$1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const msgs = await pool.query(`
      SELECT m.*, p.name AS user_name, p.avatar_url
      FROM ticket_messages m LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.ticket_id=$1 ORDER BY m.created_at
    `, [req.params.id]);
    res.json({ ...rows[0], messages: msgs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { title, description, priority, category_id, customer_id, assigned_to } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO support_tickets (title, description, priority, category_id, customer_id, assigned_to)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [title, description, priority||'medium', category_id||null, customer_id||null, assigned_to||null]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { title, description, status, priority, category_id, assigned_to } = req.body;
  const resolved_at = status === 'resolved' || status === 'closed' ? new Date() : null;
  try {
    const { rows } = await pool.query(`
      UPDATE support_tickets SET title=$1, description=$2, status=$3, priority=$4,
        category_id=$5, assigned_to=$6,
        resolved_at=CASE WHEN $3 IN ('resolved','closed') THEN NOW() ELSE resolved_at END,
        updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [title, description, status||'open', priority||'medium',
        category_id||null, assigned_to||null, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM support_tickets WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TICKET MESSAGES ───────────────────────────────────────────────────────────
router.post('/:id/messages', authMiddleware, async (req, res) => {
  const { content, is_internal } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO ticket_messages (ticket_id, user_id, content, is_internal)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [req.params.id, req.user?.id||null, content, is_internal||false]);
    await pool.query(`UPDATE support_tickets SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
