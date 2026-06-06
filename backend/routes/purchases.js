import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Auto-create tables ──────────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255)  NOT NULL,
    contact      VARCHAR(255),
    contact_person VARCHAR(255),
    phone        VARCHAR(50),
    email        VARCHAR(255),
    address      TEXT,
    notes        TEXT,
    is_active    BOOLEAN       DEFAULT true,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )
`).catch(e => console.error('[purchases] suppliers:', e.message));

// Se a tabela já existe com supplier_id NOT NULL, torná-la nullable
pool.query(`ALTER TABLE purchases ALTER COLUMN supplier_id DROP NOT NULL`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS purchases (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id            UUID          REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name          VARCHAR(255),
    supplier_location_id   UUID,
    supplier_location_name VARCHAR(255),
    items                  JSONB         NOT NULL DEFAULT '[]',
    total_amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
    status                 VARCHAR(30)   DEFAULT 'pending',
    order_date             TIMESTAMPTZ,
    date                   TIMESTAMPTZ,
    expected_delivery_date TIMESTAMPTZ,
    received_date          TIMESTAMPTZ,
    notes                  TEXT,
    invoice_number         VARCHAR(100),
    payment_status         VARCHAR(20)   DEFAULT 'unpaid',
    amount_paid            DECIMAL(12,2) DEFAULT 0,
    payment_date           TIMESTAMPTZ,
    created_by             UUID,
    location_id            UUID,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )
`).catch(e => console.error('[purchases] purchases:', e.message));

// ── Mappers ────────────────────────────────────────────────────────────────────
const mapSupplier = (s) => ({
  id: s.id,
  name: s.name,
  contact: s.contact ?? undefined,
  contactPerson: s.contact_person ?? undefined,
  phone: s.phone ?? undefined,
  email: s.email ?? undefined,
  address: s.address ?? undefined,
  notes: s.notes ?? undefined,
  isActive: s.is_active ?? true,
  createdAt: s.created_at,
  updatedAt: s.updated_at
});

const toDateStr = (v) => v
  ? (typeof v === 'string' ? v.split('T')[0] : v instanceof Date ? v.toISOString().split('T')[0] : undefined)
  : undefined;

const mapPurchase = (p) => ({
  id: p.id,
  supplierId: p.supplier_id ?? undefined,
  supplierName: p.supplier_name ?? undefined,
  supplierLocationId: p.supplier_location_id ?? undefined,
  supplierLocationName: p.supplier_location_name ?? undefined,
  items: Array.isArray(p.items) ? p.items : (p.items ? JSON.parse(p.items) : []),
  totalAmount: Number(p.total_amount) || 0,
  status: p.status ?? 'pending',
  paymentStatus: p.payment_status ?? 'unpaid',
  amountPaid: Number(p.amount_paid) || 0,
  invoiceNumber: p.invoice_number ?? undefined,
  date: toDateStr(p.date) ?? toDateStr(p.order_date),
  orderDate: toDateStr(p.order_date) ?? toDateStr(p.date),
  expectedDeliveryDate: toDateStr(p.expected_delivery_date),
  receivedDate: toDateStr(p.received_date),
  paymentDate: toDateStr(p.payment_date),
  notes: p.notes ?? undefined,
  createdBy: p.created_by ?? undefined,
  locationId: p.location_id ?? undefined,
  createdAt: p.created_at,
  updatedAt: p.updated_at
});

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────

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
      `INSERT INTO suppliers (name, contact, contact_person, phone, email, address, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [s.name, s.contact || null, s.contactPerson || null, s.phone || null,
       s.email || null, s.address || null, s.notes || null, s.isActive !== false]
    );
    res.status(201).json({ supplier: mapSupplier(rows[0]) });
  } catch (err) {
    console.error('[POST /suppliers]', err);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

router.put('/suppliers/:id', authMiddleware, async (req, res) => {
  try {
    const s = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (s.name !== undefined)          { fields.push(`name=$${i++}`);           values.push(s.name); }
    if (s.contact !== undefined)       { fields.push(`contact=$${i++}`);        values.push(s.contact); }
    if (s.contactPerson !== undefined) { fields.push(`contact_person=$${i++}`); values.push(s.contactPerson); }
    if (s.phone !== undefined)         { fields.push(`phone=$${i++}`);          values.push(s.phone); }
    if (s.email !== undefined)         { fields.push(`email=$${i++}`);          values.push(s.email); }
    if (s.address !== undefined)       { fields.push(`address=$${i++}`);        values.push(s.address); }
    if (s.notes !== undefined)         { fields.push(`notes=$${i++}`);          values.push(s.notes); }
    if (s.isActive !== undefined)      { fields.push(`is_active=$${i++}`);      values.push(s.isActive); }
    fields.push(`updated_at=NOW()`);
    if (fields.length === 1) return res.json({ success: true });
    values.push(req.params.id);
    await pool.query(`UPDATE suppliers SET ${fields.join(',')} WHERE id=$${i}`, values);
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

// ── PURCHASES ─────────────────────────────────────────────────────────────────

router.get('/purchases', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM purchases ORDER BY COALESCE(date, order_date, created_at) DESC'
    );
    res.json(rows.map(mapPurchase));
  } catch (err) {
    console.error('[GET /purchases]', err);
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

router.get('/purchases/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Compra não encontrada' });
    res.json(mapPurchase(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar compra' });
  }
});

router.post('/purchases', authMiddleware, async (req, res) => {
  try {
    const p = req.body;
    const purchaseDate = p.date || p.orderDate || p.purchaseDate || new Date().toISOString();
    const { rows } = await pool.query(
      `INSERT INTO purchases
         (supplier_id, supplier_name, items, total_amount, status, payment_status,
          amount_paid, invoice_number, order_date, date, expected_delivery_date,
          received_date, notes, created_by, location_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        p.supplierId || null,
        p.supplierName || null,
        JSON.stringify(p.items || []),
        p.totalAmount || 0,
        p.status || 'pending',
        p.paymentStatus || 'unpaid',
        p.amountPaid || 0,
        p.invoiceNumber || null,
        purchaseDate,
        p.expectedDeliveryDate || null,
        p.receivedDate || null,
        p.notes || null,
        p.createdBy || null,
        p.locationId || null
      ]
    );
    res.status(201).json({ purchase: mapPurchase(rows[0]) });
  } catch (err) {
    console.error('[POST /purchases]', err);
    res.status(500).json({ error: 'Erro ao criar compra' });
  }
});

router.put('/purchases/:id', authMiddleware, async (req, res) => {
  try {
    const p = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (p.supplierId !== undefined)          { fields.push(`supplier_id=$${i++}`);            values.push(p.supplierId); }
    if (p.supplierName !== undefined)        { fields.push(`supplier_name=$${i++}`);          values.push(p.supplierName); }
    if (p.items !== undefined)               { fields.push(`items=$${i++}`);                  values.push(JSON.stringify(p.items)); }
    if (p.totalAmount !== undefined)         { fields.push(`total_amount=$${i++}`);           values.push(p.totalAmount); }
    if (p.status !== undefined)              { fields.push(`status=$${i++}`);                 values.push(p.status); }
    if (p.paymentStatus !== undefined)       { fields.push(`payment_status=$${i++}`);         values.push(p.paymentStatus); }
    if (p.amountPaid !== undefined)          { fields.push(`amount_paid=$${i++}`);            values.push(p.amountPaid); }
    if (p.invoiceNumber !== undefined)       { fields.push(`invoice_number=$${i++}`);         values.push(p.invoiceNumber); }
    if (p.date !== undefined)                { fields.push(`date=$${i++}`);                   values.push(p.date); fields.push(`order_date=$${i++}`); values.push(p.date); }
    if (p.expectedDeliveryDate !== undefined){ fields.push(`expected_delivery_date=$${i++}`); values.push(p.expectedDeliveryDate); }
    if (p.receivedDate !== undefined)        { fields.push(`received_date=$${i++}`);          values.push(p.receivedDate); }
    if (p.paymentDate !== undefined)         { fields.push(`payment_date=$${i++}`);           values.push(p.paymentDate); }
    if (p.notes !== undefined)               { fields.push(`notes=$${i++}`);                  values.push(p.notes); }
    fields.push('updated_at=NOW()');
    if (fields.length === 1) return res.json({ success: true });
    values.push(req.params.id);
    await pool.query(`UPDATE purchases SET ${fields.join(',')} WHERE id=$${i}`, values);
    const { rows } = await pool.query('SELECT * FROM purchases WHERE id=$1', [req.params.id]);
    res.json({ purchase: rows.length ? mapPurchase(rows[0]) : null, success: true });
  } catch (err) {
    console.error('[PUT /purchases/:id]', err);
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

// ── PURCHASE REQUESTS ─────────────────────────────────────────────────────────

pool.query(`
  CREATE TABLE IF NOT EXISTS purchase_requests (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by     UUID,
    requested_by_name VARCHAR(255),
    items            JSONB       NOT NULL DEFAULT '[]',
    status           VARCHAR(30) DEFAULT 'pending',
    priority         VARCHAR(20) DEFAULT 'medium',
    notes            TEXT,
    location_id      UUID,
    approved_by      UUID,
    approved_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(e => console.error('[purchases] purchase_requests:', e.message));

const mapRequest = (r) => ({
  id: r.id,
  requestedBy: r.requested_by,
  requestedByName: r.requested_by_name,
  items: Array.isArray(r.items) ? r.items : (r.items ? JSON.parse(r.items) : []),
  status: r.status,
  priority: r.priority,
  notes: r.notes,
  locationId: r.location_id,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  rejectionReason: r.rejection_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM purchase_requests ORDER BY created_at DESC');
    res.json(rows.map(mapRequest));
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar requisições' }); }
});

router.post('/requests', authMiddleware, async (req, res) => {
  try {
    const r = req.body;
    const { rows } = await pool.query(
      `INSERT INTO purchase_requests (requested_by, requested_by_name, items, status, priority, notes, location_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [r.requestedBy || null, r.requestedByName || null, JSON.stringify(r.items || []),
       r.status || 'pending', r.priority || 'medium', r.notes || null, r.locationId || null]
    );
    res.status(201).json({ request: mapRequest(rows[0]) });
  } catch (err) { res.status(500).json({ error: 'Erro ao criar requisição' }); }
});

router.put('/requests/:id', authMiddleware, async (req, res) => {
  try {
    const r = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (r.status !== undefined)          { fields.push(`status=$${i++}`);           values.push(r.status); }
    if (r.approvedBy !== undefined)      { fields.push(`approved_by=$${i++}`);      values.push(r.approvedBy); }
    if (r.approvedAt !== undefined)      { fields.push(`approved_at=$${i++}`);      values.push(r.approvedAt); }
    if (r.rejectionReason !== undefined) { fields.push(`rejection_reason=$${i++}`); values.push(r.rejectionReason); }
    if (r.items !== undefined)           { fields.push(`items=$${i++}`);             values.push(JSON.stringify(r.items)); }
    if (r.notes !== undefined)           { fields.push(`notes=$${i++}`);             values.push(r.notes); }
    fields.push('updated_at=NOW()');
    if (fields.length === 1) return res.json({ success: true });
    values.push(req.params.id);
    await pool.query(`UPDATE purchase_requests SET ${fields.join(',')} WHERE id=$${i}`, values);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar requisição' }); }
});

router.delete('/requests/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM purchase_requests WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erro ao apagar requisição' }); }
});

export default router;
