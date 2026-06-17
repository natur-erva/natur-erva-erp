import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT,
    price DECIMAL(12,2) NOT NULL DEFAULT 0, billing_cycle VARCHAR(20) DEFAULT 'monthly',
    features JSONB DEFAULT '[]', status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY, customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
    plan_id INT REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) DEFAULT 'active', start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE, next_billing_date DATE, notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS subscription_invoices (
    id SERIAL PRIMARY KEY, subscription_id INT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(20) DEFAULT 'pending',
    due_date DATE, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
})();

// ── PLANS ─────────────────────────────────────────────────────────────────────
router.get('/plans', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, COUNT(s.id)::int AS subscriber_count
      FROM subscription_plans p
      LEFT JOIN subscriptions s ON s.plan_id=p.id AND s.status='active'
      GROUP BY p.id ORDER BY p.price
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/plans', authMiddleware, async (req, res) => {
  const { name, description, price, billing_cycle, features } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO subscription_plans (name, description, price, billing_cycle, features)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [name, description, price||0, billing_cycle||'monthly', JSON.stringify(features||[])]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/plans/:id', authMiddleware, async (req, res) => {
  const { name, description, price, billing_cycle, features, status } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE subscription_plans SET name=$1,description=$2,price=$3,
        billing_cycle=$4,features=$5,status=$6 WHERE id=$7 RETURNING *
    `, [name, description, price||0, billing_cycle||'monthly',
        JSON.stringify(features||[]), status||'active', req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/plans/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM subscription_plans WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { status, plan_id } = req.query;
  const filters = []; const params = [];
  if (status)  { params.push(status);  filters.push(`s.status=$${params.length}`); }
  if (plan_id) { params.push(plan_id); filters.push(`s.plan_id=$${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const { rows } = await pool.query(`
      SELECT s.*, c.name AS customer_name, c.email AS customer_email,
             sp.name AS plan_name, sp.price, sp.billing_cycle
      FROM subscriptions s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
      ${where} ORDER BY s.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.status='active')::int AS active,
        COUNT(*) FILTER (WHERE s.status='cancelled')::int AS cancelled,
        COALESCE(SUM(sp.price) FILTER (WHERE s.status='active'),0) AS mrr
      FROM subscriptions s
      LEFT JOIN subscription_plans sp ON sp.id=s.plan_id
    `);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { customer_id, plan_id, start_date, end_date, next_billing_date, notes } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO subscriptions (customer_id, plan_id, start_date, end_date, next_billing_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [customer_id, plan_id, start_date||new Date().toISOString().slice(0,10),
        end_date||null, next_billing_date||null, notes]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { status, end_date, next_billing_date, notes } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE subscriptions SET status=$1, end_date=$2, next_billing_date=$3, notes=$4, updated_at=NOW()
      WHERE id=$5 RETURNING *
    `, [status||'active', end_date||null, next_billing_date||null, notes, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INVOICES ──────────────────────────────────────────────────────────────────
router.get('/:id/invoices', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscription_invoices WHERE subscription_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/invoices', authMiddleware, async (req, res) => {
  const { amount, due_date } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO subscription_invoices (subscription_id, amount, due_date)
      VALUES ($1,$2,$3) RETURNING *
    `, [req.params.id, amount, due_date||null]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/invoices/:id/pay', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE subscription_invoices SET status='paid', paid_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
