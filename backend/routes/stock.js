import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// === STOCK MOVEMENTS ===

const mapMovement = (m) => ({
  id: m.id,
  date: m.date,
  items: m.items || [],
  notes: m.notes,
  sourceReference: m.source_reference,
  createdAt: m.created_at,
  updatedAt: m.updated_at
});

// GET /api/stock/movements
router.get('/movements', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM stock_movements ORDER BY date DESC'
    );
    res.json(rows.map(mapMovement));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar movimentos de stock' });
  }
});

// POST /api/stock/movements
router.post('/movements', authMiddleware, async (req, res) => {
  try {
    const m = req.body;
    const refStr = m.sourceReference ? JSON.stringify(m.sourceReference) : null;

    // Verificar duplicado (se tem sourceReference)
    if (refStr && m.sourceReference?.type !== 'adjustment') {
      const { rows: existing } = await pool.query(
        'SELECT id, date, items, notes, source_reference, created_at FROM stock_movements WHERE source_reference::text = $1 LIMIT 1',
        [refStr]
      );
      if (existing.length) return res.json(mapMovement(existing[0]));
    }

    const { rows } = await pool.query(
      `INSERT INTO stock_movements (date, items, notes, source_reference, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [m.date, JSON.stringify(m.items || []), m.notes || null, refStr]
    );
    const movement = rows[0];

    // Processar stock de cada item
    for (const item of (m.items || [])) {
      if (!item.productId || item.quantity === 0) continue;
      try {
        if (item.variantId) {
          await pool.query(
            `UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2`,
            [item.quantity, item.variantId]
          );
        } else {
          // Buscar variante padrão
          const { rows: vRows } = await pool.query(
            'SELECT id FROM product_variants WHERE product_id = $1 AND is_default = true LIMIT 1',
            [item.productId]
          );
          if (vRows.length) {
            await pool.query(
              'UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2',
              [item.quantity, vRows[0].id]
            );
          }
        }
      } catch (stockErr) {
        console.warn('[stock movement] Erro ao actualizar stock do item:', stockErr.message);
      }
    }

    res.status(201).json(mapMovement(movement));
  } catch (err) {
    console.error('[POST /stock/movements]', err);
    res.status(500).json({ error: 'Erro ao criar movimento de stock' });
  }
});

// PUT /api/stock/movements/:id
router.put('/movements/:id', authMiddleware, async (req, res) => {
  try {
    const m = req.body;
    const { rows: old } = await pool.query('SELECT * FROM stock_movements WHERE id = $1', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Movimento não encontrado' });

    await pool.query(
      `UPDATE stock_movements SET date = $1, items = $2, notes = $3, source_reference = $4, updated_at = NOW() WHERE id = $5`,
      [m.date, JSON.stringify(m.items || []), m.notes || null,
       m.sourceReference ? JSON.stringify(m.sourceReference) : null, req.params.id]
    );

    // Reverter stock antigo e aplicar novo (se items mudaram)
    if (JSON.stringify(old[0].items) !== JSON.stringify(m.items)) {
      // Reverter
      for (const item of (old[0].items || [])) {
        if (!item.productId || item.quantity === 0) continue;
        const revertQty = -item.quantity;
        if (item.variantId) {
          await pool.query(
            'UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2',
            [revertQty, item.variantId]
          ).catch(() => {});
        }
      }
      // Aplicar novo
      for (const item of (m.items || [])) {
        if (!item.productId || item.quantity === 0) continue;
        if (item.variantId) {
          await pool.query(
            'UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2',
            [item.quantity, item.variantId]
          ).catch(() => {});
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao actualizar movimento' });
  }
});

// DELETE /api/stock/movements/:id
router.delete('/movements/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM stock_movements WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.json({ success: true });

    const movement = rows[0];
    // Reverter stock
    for (const item of (movement.items || [])) {
      if (!item.productId || item.quantity === 0) continue;
      const revertQty = -item.quantity;
      if (item.variantId) {
        await pool.query(
          'UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2',
          [revertQty, item.variantId]
        ).catch(() => {});
      }
    }

    await pool.query('DELETE FROM stock_movements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar movimento' });
  }
});

// PUT /api/stock/variants/:variantId/adjust
router.put('/variants/:variantId/adjust', authMiddleware, async (req, res) => {
  try {
    const { quantity, operation } = req.body; // operation: 'add' | 'subtract'
    const qty = operation === 'subtract' ? -Math.abs(quantity) : Math.abs(quantity);
    await pool.query(
      'UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2',
      [qty, req.params.variantId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao ajustar stock' });
  }
});

// GET /api/stock/config
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM stock_config WHERE is_active = true LIMIT 1'
    );
    if (!rows.length) return res.json(null);
    res.json({ resetDate: rows[0].reset_date, resetReason: rows[0].reset_reason, createdAt: rows[0].created_at });
  } catch (err) {
    res.json(null);
  }
});

// POST /api/stock/reset
router.post('/reset', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { resetDate, resetReason, initialStocks } = req.body;
    await client.query('BEGIN');
    await client.query('UPDATE stock_config SET is_active = false WHERE is_active = true');
    await client.query(
      'INSERT INTO stock_config (reset_date, reset_reason, is_active) VALUES ($1, $2, true)',
      [resetDate, resetReason]
    );
    for (const item of (initialStocks || [])) {
      await client.query(
        'UPDATE product_variants SET stock = $1 WHERE id = $2',
        [Math.max(0, Number(item.stock) || 0), item.variantId]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/stock/snapshot/:date
router.get('/snapshot/:date', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT product_id, variant_id, quantity FROM stock_initial_snapshot WHERE snapshot_date = $1',
      [req.params.date]
    );
    res.json(rows.map(r => ({
      productId: r.product_id,
      variantId: r.variant_id,
      quantity: Number(r.quantity) || 0
    })));
  } catch (err) {
    res.json([]);
  }
});

// POST /api/stock/snapshot
router.post('/snapshot', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { snapshotDate, items } = req.body;
    await client.query('BEGIN');
    await client.query('DELETE FROM stock_initial_snapshot WHERE snapshot_date = $1', [snapshotDate]);
    for (const item of (items || [])) {
      await client.query(
        `INSERT INTO stock_initial_snapshot (snapshot_date, product_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [snapshotDate, item.productId, item.variantId || null, item.quantity]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/stock/transactions
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM stock_transactions ORDER BY date DESC LIMIT 1000'
    );
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

export default router;
