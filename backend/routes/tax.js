import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Auto-cria tabelas se não existirem
pool.query(`
  CREATE TABLE IF NOT EXISTS tax_config (
    id              INTEGER      PRIMARY KEY DEFAULT 1,
    company_name    VARCHAR(200) NOT NULL DEFAULT 'NaturErva',
    company_nuit    VARCHAR(30)  NOT NULL DEFAULT '',
    company_address TEXT         NOT NULL DEFAULT '',
    company_phone   VARCHAR(50)  NOT NULL DEFAULT '',
    company_email   VARCHAR(100) NOT NULL DEFAULT '',
    vat_rate        DECIMAL(5,2) NOT NULL DEFAULT 16.00,
    invoice_prefix  VARCHAR(20)  NOT NULL DEFAULT 'FACT',
    invoice_counter INTEGER      NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
  );
  INSERT INTO tax_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`).catch(e => console.error('[TAX] init:', e.message));

const mapConfig = (r) => ({
  companyName:    r.company_name,
  companyNuit:    r.company_nuit,
  companyAddress: r.company_address,
  companyPhone:   r.company_phone,
  companyEmail:   r.company_email,
  vatRate:        Number(r.vat_rate),
  invoicePrefix:  r.invoice_prefix,
  invoiceCounter: Number(r.invoice_counter),
});

// GET /api/tax/config
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tax_config WHERE id = 1');
    res.json(rows[0] ? mapConfig(rows[0]) : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tax/config
router.put('/config', authMiddleware, async (req, res) => {
  try {
    const c = req.body;
    await pool.query(
      `UPDATE tax_config SET
        company_name    = COALESCE($1, company_name),
        company_nuit    = COALESCE($2, company_nuit),
        company_address = COALESCE($3, company_address),
        company_phone   = COALESCE($4, company_phone),
        company_email   = COALESCE($5, company_email),
        vat_rate        = COALESCE($6, vat_rate),
        invoice_prefix  = COALESCE($7, invoice_prefix),
        updated_at      = NOW()
       WHERE id = 1`,
      [c.companyName, c.companyNuit, c.companyAddress, c.companyPhone,
       c.companyEmail, c.vatRate, c.invoicePrefix]
    );
    const { rows } = await pool.query('SELECT * FROM tax_config WHERE id = 1');
    res.json(mapConfig(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tax/invoice/number — incrementa e retorna próximo nº de factura
router.post('/invoice/number', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE tax_config
         SET invoice_counter = invoice_counter + 1, updated_at = NOW()
       WHERE id = 1
       RETURNING invoice_prefix, invoice_counter, EXTRACT(YEAR FROM NOW())::int AS yr`
    );
    const { invoice_prefix, invoice_counter, yr } = rows[0];
    const number = `${invoice_prefix}/${yr}/${String(invoice_counter).padStart(4, '0')}`;
    res.json({ number });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tax/report?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/report', authMiddleware, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start e end obrigatórios' });

    const { rows: cfg } = await pool.query('SELECT vat_rate FROM tax_config WHERE id = 1');
    const vatRate = Number(cfg[0]?.vat_rate ?? 16);
    const vatMult = 1 + vatRate / 100;

    // Totais globais
    const { rows: totals } = await pool.query(
      `SELECT
         COUNT(*)::int                             AS orders_count,
         COALESCE(SUM(total_amount), 0)            AS total_inc_vat,
         COALESCE(SUM(total_amount / $3), 0)       AS total_ex_vat,
         COALESCE(SUM(total_amount - total_amount / $3), 0) AS total_vat
       FROM orders
       WHERE created_at::date BETWEEN $1 AND $2
         AND status NOT IN ('cancelled')`,
      [start, end, vatMult]
    );

    // Quebra por mês
    const { rows: byMonth } = await pool.query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM')           AS month,
         COUNT(*)::int                             AS count,
         COALESCE(SUM(total_amount), 0)            AS inc_vat,
         COALESCE(SUM(total_amount / $3), 0)       AS ex_vat,
         COALESCE(SUM(total_amount - total_amount / $3), 0) AS vat
       FROM orders
       WHERE created_at::date BETWEEN $1 AND $2
         AND status NOT IN ('cancelled')
       GROUP BY TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month ASC`,
      [start, end, vatMult]
    );

    const t = totals[0];
    res.json({
      vatRate,
      ordersCount:   t.orders_count,
      totalIncVat:   Math.round(Number(t.total_inc_vat) * 100) / 100,
      totalExVat:    Math.round(Number(t.total_ex_vat)  * 100) / 100,
      totalVat:      Math.round(Number(t.total_vat)     * 100) / 100,
      byMonth: byMonth.map(r => ({
        month:    r.month,
        count:    r.count,
        incVat:   Math.round(Number(r.inc_vat) * 100) / 100,
        exVat:    Math.round(Number(r.ex_vat)  * 100) / 100,
        vat:      Math.round(Number(r.vat)     * 100) / 100,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
