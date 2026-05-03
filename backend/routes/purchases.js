import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const mapSupplier = (s) => ({
  id: s.id,
  name: s.name,
  contact: s.contact,
  phone: s.phone,
  email: s.email,
  address: s.address,
  notes: s.notes,
  createdAt: s.created_at
});

const mapPurchase = (p) => ({
  id: p.id,
  supplierId: p.supplier_id,
  supplierName: p.supplier_name,
  items: p.items || [],
  totalAmount: Number(p.total_amount) || 0,
  status: p.status,
  paymentStatus: p.payment_status,
  notes: p.notes,
  date: p.date || p.order_date,
  createdAt: p.created_at
});

// === SUPPLIERS ===
router.get('/suppliers', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY name ASC');
    res.json(rows.map(mapSupplier));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

router.get('/suppliers/count', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM suppliers');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao contar fornecedores' });
  }
});

router.post('/suppliers', authMiddleware, async (req, res) => {
  try {
    const s = req.body;
    const { rows } = await pool.query(
      `INSERT INTO suppliers (name, contact, phone, email, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [s.name, s.contact || null, s.phone || null, s.email || null, s.address || null, s.notes || null]
    );
    res.status(201).json({ supplier: mapSupplier(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

router.put('/suppliers/:id', authMiddleware, async (req, res) => {
  try {
    const s = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (s.name !== undefined) { fields.push(`name = $${i++}`); values.push(s.name); }
    if (s.contact !== undefined) { fields.push(`contact = $${i++}`); values.push(s.contact); }
    if (s.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(s.phone); }
    if (s.email !== undefined) { fields.push(`email = $${i++}`); values.push(s.email); }
    if (s.address !== undefined) { fields.push(`address = $${i++}`); values.push(s.address); }
    if (s.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(s.notes); }

    if (!fields.length) return res.json({ success: true });
    values.push(req.params.id);

    await pool.query(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = $${i}`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar fornecedor' });
  }
});

router.delete('/suppliers/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar fornecedor' });
  }
});

// === PURCHASES ===
router.get('/purchases', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM purchases ORDER BY date DESC');
    res.json(rows.map(mapPurchase));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar compras' });
  }
});

router.get('/purchases/count', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM purchases');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao contar compras' });
  }
});

router.post('/purchases', authMiddleware, async (req, res) => {
  try {
    const p = req.body;
    const { rows } = await pool.query(
      `INSERT INTO purchases (supplier_id, supplier_name, items, total_amount, status, payment_status, notes, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [p.supplierId || null, p.supplierName || null, JSON.stringify(p.items || []),
       p.totalAmount || 0, p.status || 'pending', p.paymentStatus || 'unpaid',
       p.notes || null, p.date || p.purchaseDate || new Date().toISOString()]
    );
    res.status(201).json({ purchase: mapPurchase(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar compra' });
  }
});

router.put('/purchases/:id', authMiddleware, async (req, res) => {
  try {
    const p = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (p.supplierId !== undefined) { fields.push(`supplier_id = $${i++}`); values.push(p.supplierId); }
    if (p.supplierName !== undefined) { fields.push(`supplier_name = $${i++}`); values.push(p.supplierName); }
    if (p.items !== undefined) { fields.push(`items = $${i++}`); values.push(JSON.stringify(p.items)); }
    if (p.totalAmount !== undefined) { fields.push(`total_amount = $${i++}`); values.push(p.totalAmount); }
    if (p.status !== undefined) { fields.push(`status = $${i++}`); values.push(p.status); }
    if (p.paymentStatus !== undefined) { fields.push(`payment_status = $${i++}`); values.push(p.paymentStatus); }
    if (p.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(p.notes); }
    if (p.date !== undefined) { fields.push(`date = $${i++}`); values.push(p.date); }

    if (!fields.length) return res.json({ success: true });
    values.push(req.params.id);

    await pool.query(`UPDATE purchases SET ${fields.join(', ')} WHERE id = $${i}`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar compra' });
  }
});

router.delete('/purchases/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM purchases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar compra' });
  }
});

export default router;
