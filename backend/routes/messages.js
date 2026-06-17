import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

async function migrate() {
  const run = async (sql, label) => {
    try { await pool.query(sql); }
    catch (e) { console.error(`[messages] migrate ${label}:`, e.message); }
  };
  await run(`CREATE TABLE IF NOT EXISTS message_channels (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_direct   BOOLEAN DEFAULT false,
    created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`, 'message_channels');
  await run(`CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INT NOT NULL REFERENCES message_channels(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
  )`, 'channel_members');
  await run(`CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    channel_id INT NOT NULL REFERENCES message_channels(id) ON DELETE CASCADE,
    sender_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    content    TEXT NOT NULL,
    edited_at  TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`, 'messages');
  await run(`CREATE TABLE IF NOT EXISTS message_reads (
    message_id  INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    read_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
  )`, 'message_reads');

  // Seed general channel if none exists
  try {
    const { rows } = await pool.query(`SELECT id FROM message_channels WHERE name='Geral' LIMIT 1`);
    if (!rows.length) {
      await pool.query(`INSERT INTO message_channels (name, description) VALUES ('Geral', 'Canal geral da equipa')`);
    }
  } catch (_) {}
}
migrate();

// ── CHANNELS ──────────────────────────────────────────────────────────────────
router.get('/channels', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
             p.name AS creator_name,
             (SELECT COUNT(*)::int FROM channel_members m WHERE m.channel_id = c.id) AS member_count,
             (SELECT COUNT(*)::int FROM messages ms WHERE ms.channel_id = c.id) AS message_count
      FROM message_channels c
      LEFT JOIN profiles p ON p.id = c.created_by
      ORDER BY c.is_direct, c.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels', authMiddleware, async (req, res) => {
  const { name, description, is_direct, member_ids } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO message_channels (name, description, is_direct, created_by)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [name, description||null, is_direct||false, req.user?.id || null]);
    const channel = rows[0];
    if (Array.isArray(member_ids) && member_ids.length) {
      const vals = member_ids.map((uid, i) => `($1,$${i+2})`).join(',');
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
        [channel.id, ...member_ids]
      );
    }
    // auto-add creator
    if (req.user?.id) {
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [channel.id, req.user.id]
      );
    }
    res.status(201).json(channel);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MESSAGES ──────────────────────────────────────────────────────────────────
router.get('/channels/:channelId', authMiddleware, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50'), 200);
  const before = req.query.before;
  const params = [req.params.channelId, limit];
  const beforeClause = before ? `AND m.id < $3` : '';
  if (before) params.push(before);
  try {
    const { rows } = await pool.query(`
      SELECT m.*, p.name AS sender_name, p.avatar_url AS sender_avatar
      FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.channel_id=$1 ${beforeClause}
      ORDER BY m.created_at DESC LIMIT $2
    `, params);
    res.json(rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels/:channelId', authMiddleware, async (req, res) => {
  const { content } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO messages (channel_id, sender_id, content)
      VALUES ($1,$2,$3) RETURNING *
    `, [req.params.channelId, req.user?.id || null, content]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/messages/:id', authMiddleware, async (req, res) => {
  const { content } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE messages SET content=$1, edited_at=NOW() WHERE id=$2 AND sender_id=$3 RETURNING *`,
      [content, req.params.id, req.user?.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Não autorizado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/messages/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM messages WHERE id=$1 AND sender_id=$2`, [req.params.id, req.user?.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UNREAD COUNT ──────────────────────────────────────────────────────────────
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.channel_id,
             COUNT(m.id)::int AS unread
      FROM messages m
      WHERE m.sender_id != $1
        AND NOT EXISTS (
          SELECT 1 FROM message_reads r WHERE r.message_id=m.id AND r.user_id=$1
        )
      GROUP BY m.channel_id
    `, [req.user?.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/channels/:channelId/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO message_reads (message_id, user_id)
      SELECT m.id, $2 FROM messages m
      WHERE m.channel_id=$1
        AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_id=m.id AND r.user_id=$2)
    `, [req.params.channelId, req.user?.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
