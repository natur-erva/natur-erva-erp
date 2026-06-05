import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Cria a tabela automaticamente se não existir
pool.query(`
  CREATE TABLE IF NOT EXISTS pos_sessions (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    cashier_id     UUID,
    cashier_name   VARCHAR(150)  NOT NULL DEFAULT 'Caixa',
    opened_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_at      TIMESTAMPTZ,
    initial_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_open        BOOLEAN       NOT NULL DEFAULT TRUE,
    summary        JSONB
  )
`).catch(err => console.error('[POS] Erro ao criar tabela pos_sessions:', err.message));

// GET /api/pos/session/current
router.get('/session/current', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pos_sessions WHERE is_open = TRUE ORDER BY opened_at DESC LIMIT 1'
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pos/session/open
router.post('/session/open', authMiddleware, async (req, res) => {
  try {
    const { initialAmount = 0 } = req.body;
    const cashierName = req.user?.name || 'Caixa';
    const cashierId  = req.user?.id   || null;

    // Fecha qualquer sessão aberta anterior
    await pool.query(
      'UPDATE pos_sessions SET is_open = FALSE, closed_at = NOW() WHERE is_open = TRUE'
    );

    const { rows } = await pool.query(
      `INSERT INTO pos_sessions (cashier_id, cashier_name, initial_amount)
       VALUES ($1, $2, $3) RETURNING *`,
      [cashierId, cashierName, Number(initialAmount) || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pos/session/close
router.post('/session/close', authMiddleware, async (req, res) => {
  try {
    const { rows: sessions } = await pool.query(
      'SELECT * FROM pos_sessions WHERE is_open = TRUE ORDER BY opened_at DESC LIMIT 1'
    );
    if (!sessions.length) return res.status(404).json({ error: 'Nenhuma sessão aberta' });

    const session = sessions[0];

    // Totais das vendas POS desta sessão por método de pagamento
    const { rows: byMethod } = await pool.query(
      `SELECT
         COALESCE(payment_method, 'cash') AS method,
         COUNT(*)::int                    AS count,
         SUM(total_amount)                AS total
       FROM orders
       WHERE source = 'pos' AND created_at >= $1
       GROUP BY COALESCE(payment_method, 'cash')`,
      [session.opened_at]
    );

    const totalSales  = byMethod.reduce((s, r) => s + parseFloat(r.total  || 0), 0);
    const totalOrders = byMethod.reduce((s, r) => s + parseInt (r.count   || 0), 0);
    const cashSales   = byMethod.filter(r => r.method === 'cash')
                                .reduce((s, r) => s + parseFloat(r.total || 0), 0);

    const summary = {
      totalSales:   Math.round(totalSales   * 100) / 100,
      totalOrders,
      byMethod: byMethod.map(r => ({
        method: r.method,
        count:  parseInt(r.count),
        total:  Math.round(parseFloat(r.total) * 100) / 100,
      })),
      expectedCash: Math.round((parseFloat(String(session.initial_amount)) + cashSales) * 100) / 100,
    };

    const { rows } = await pool.query(
      `UPDATE pos_sessions
         SET is_open = FALSE, closed_at = NOW(), summary = $1
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(summary), session.id]
    );

    res.json({ session: rows[0], summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
