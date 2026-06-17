import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY, type VARCHAR(20) DEFAULT 'direct',
    name VARCHAR(100), created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INT REFERENCES profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    read_by JSONB DEFAULT '[]'
  )`).catch(() => {});
})();

// Listar conversas do utilizador autenticado
router.get('/conversations', authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
        (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id=c.id AND NOT (m.read_by @> $1::jsonb)) AS unread_count,
        (SELECT json_agg(json_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url))
         FROM conversation_members cm2 JOIN profiles p ON p.id=cm2.user_id
         WHERE cm2.conversation_id=c.id AND cm2.user_id != $2) AS members
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$2
      ORDER BY last_message_at DESC NULLS LAST
    `, [JSON.stringify([userId]), userId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar conversa directa ou grupo
router.post('/conversations', authMiddleware, async (req, res) => {
  const { type, name, member_ids } = req.body;
  const userId = req.user?.id;
  try {
    const conv = await pool.query(
      `INSERT INTO conversations (type, name) VALUES ($1,$2) RETURNING *`,
      [type||'direct', name||null]
    );
    const id = conv.rows[0].id;
    const allMembers = [...new Set([userId, ...(member_ids||[])])];
    await Promise.all(allMembers.map(uid =>
      pool.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, uid])
    ));
    res.status(201).json(conv.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mensagens de uma conversa
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const { before, limit = 50 } = req.query;
  const userId = req.user?.id;
  try {
    const params = [req.params.id, parseInt(limit)];
    const beforeClause = before ? `AND m.id < $${params.push(before)}` : '';
    const { rows } = await pool.query(`
      SELECT m.*, p.name AS sender_name, p.avatar_url AS sender_avatar
      FROM messages m LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.conversation_id=$1 ${beforeClause}
      ORDER BY m.created_at DESC LIMIT $2
    `, params);
    // Mark as read
    if (userId && rows.length) {
      const ids = rows.map(r => r.id);
      await pool.query(`
        UPDATE messages SET read_by = read_by || $1::jsonb
        WHERE id = ANY($2) AND NOT (read_by @> $1::jsonb)
      `, [JSON.stringify([userId]), ids]).catch(() => {});
    }
    res.json(rows.reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enviar mensagem
router.post('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const { content } = req.body;
  const userId = req.user?.id;
  try {
    const { rows } = await pool.query(`
      INSERT INTO messages (conversation_id, sender_id, content, read_by)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [req.params.id, userId||null, content, JSON.stringify(userId ? [userId] : [])]);
    const sender = userId ? await pool.query(`SELECT name, avatar_url FROM profiles WHERE id=$1`, [userId]) : null;
    res.status(201).json({ ...rows[0], sender_name: sender?.rows[0]?.name, sender_avatar: sender?.rows[0]?.avatar_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Utilizadores disponíveis para conversa
router.get('/users', authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, avatar_url FROM profiles WHERE id != $1 ORDER BY name`,
      [userId||0]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
