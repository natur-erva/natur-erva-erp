import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function migrate() {
  const run = async (sql, label) => {
    try { await pool.query(sql); }
    catch (e) { console.error(`[helpdesk] migrate ${label}:`, e.message); }
  };
  await run(`CREATE TABLE IF NOT EXISTS helpdesk_tickets (
    id          SERIAL PRIMARY KEY,
    subject     VARCHAR(200) NOT NULL,
    description TEXT,
    status      VARCHAR(20) DEFAULT 'open',
    priority    VARCHAR(20) DEFAULT 'medium',
    category    VARCHAR(50) DEFAULT 'general',
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`, 'helpdesk_tickets');
  await run(`CREATE TABLE IF NOT EXISTS ticket_messages (
    id        SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES helpdesk_tickets(id) ON DELETE CASCADE,
    user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content   TEXT NOT NULL,
    is_staff  BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`, 'ticket_messages');
  await run(`CREATE TABLE IF NOT EXISTS ticket_attachments (
    id        SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES helpdesk_tickets(id) ON DELETE CASCADE,
    filename  VARCHAR(200),
    url       TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`, 'ticket_attachments');
}
migrate();

// ── TICKETS ───────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { status, priority, assigned_to, q } = req.query;
  const filters = []; const params = [];
  if (status)      { params.push(status);      filters.push(`t.status=$${params.length}`); }
  if (priority)    { params.push(priority);    filters.push(`t.priority=$${params.length}`); }
  if (assigned_to) { params.push(assigned_to); filters.push(`t.assigned_to=$${params.length}`); }
  if (q)           { params.push(`%${q}%`);    filters.push(`t.subject ILIKE $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
             c.name AS customer_name, c.email AS customer_email,
             p.name AS assigned_name,
             (SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
      FROM helpdesk_tickets t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN profiles p ON p.id = t.assigned_to
      ${where}
      ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               t.updated_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [open, pending, resolved, urgent] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM helpdesk_tickets WHERE status='open'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM helpdesk_tickets WHERE status='pending'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM helpdesk_tickets WHERE status='resolved'`),
      pool.query(`SELECT COUNT(*)::int AS n FROM helpdesk_tickets WHERE priority='urgent' AND status NOT IN ('resolved','closed')`),
    ]);
    res.json({ open: open.rows[0].n, pending: pending.rows[0].n, resolved: resolved.rows[0].n, urgent: urgent.rows[0].n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, c.name AS customer_name, c.email AS customer_email, p.name AS assigned_name
      FROM helpdesk_tickets t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN profiles p ON p.id = t.assigned_to
      WHERE t.id=$1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const messages = await pool.query(`
      SELECT m.*, p.name AS user_name, p.avatar_url
      FROM ticket_messages m LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.ticket_id=$1 ORDER BY m.created_at
    `, [req.params.id]);
    res.json({ ...rows[0], messages: messages.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { subject, description, priority, category, customer_id, assigned_to } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO helpdesk_tickets (subject, description, priority, category, customer_id, assigned_to)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [subject, description||null, priority||'medium', category||'general',
        customer_id||null, assigned_to||null]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { subject, description, status, priority, category, assigned_to } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE helpdesk_tickets SET subject=$1, description=$2, status=$3, priority=$4,
        category=$5, assigned_to=$6, updated_at=NOW(),
        resolved_at=CASE WHEN $3='resolved' THEN NOW() ELSE resolved_at END
      WHERE id=$7 RETURNING *
    `, [subject, description||null, status||'open', priority||'medium',
        category||'general', assigned_to||null, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM helpdesk_tickets WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TICKET MESSAGES ───────────────────────────────────────────────────────────
router.post('/:id/messages', authMiddleware, async (req, res) => {
  const { content, is_staff } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO ticket_messages (ticket_id, user_id, content, is_staff)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [req.params.id, req.user?.id || null, content, is_staff ?? true]);
    await pool.query(`UPDATE helpdesk_tickets SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
