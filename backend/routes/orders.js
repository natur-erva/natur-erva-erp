import express from 'express';
import pool from '../db.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const mapOrder = (row) => ({
  id: row.id,
  externalId: row.external_id,
  orderNumber: row.order_number,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  items: row.items || [],
  totalAmount: Number(row.total_amount) || 0,
  status: row.status,
  source: row.source,
  isDelivery: !!row.is_delivery,
  deliveryLocation: row.delivery_location,
  deliveryFee: Number(row.delivery_fee) || 0,
  paymentStatus: row.payment_status || 'unpaid',
  amountPaid: Number(row.amount_paid) || 0,
  paymentProof: row.payment_proof,
  paymentProofText: row.payment_proof_text,
  notes: row.notes,
  createdAt: row.created_at,
  createdBy: row.created_by,
  createdByName: row.creator_name || undefined,
  deliveryZoneId: row.delivery_zone_id,
  deliveryZoneName: row.delivery_zone_name,
  deliveryLatitude: row.delivery_latitude,
  deliveryLongitude: row.delivery_longitude,
  deliveryAddressFormatted: row.delivery_address_formatted
});

// GET /api/orders
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, p.name as creator_name 
       FROM orders o 
       LEFT JOIN profiles p ON p.id = o.created_by
       ORDER BY o.created_at DESC`
    );
    res.json(rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders]', err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// GET /api/orders/count
router.get('/count', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM orders');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    console.error('[GET /orders/count]', err);
    res.status(500).json({ error: 'Erro ao contar pedidos' });
  }
});

// GET /api/orders/next-number
router.get('/next-number', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 100'
    );
    let max = 0;
    for (const row of rows) {
      const num = parseInt((row.order_number || '').replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    res.json({ nextNumber: String(max + 1) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar número' });
  }
});

// GET /api/orders/check-number/:number
router.get('/check-number/:number', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id FROM orders WHERE order_number = $1 LIMIT 1',
      [req.params.number]
    );
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao verificar número' });
  }
});

// GET /api/orders/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT o.*, p.name as creator_name FROM orders o LEFT JOIN profiles p ON p.id = o.created_by WHERE o.id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(mapOrder(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// POST /api/orders
router.post('/', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = req.body;

    const rawPhone = order.customerPhone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const hasPhone = cleanPhone.length > 5;
    const phoneToSave = hasPhone ? cleanPhone : `no_phone_${Date.now()}`;

    // Encontrar ou criar cliente
    let customerId = order.customerId;
    let customerCreated = false;
    let customerUpdated = false;

    if (hasPhone) {
      const { rows: existing } = await client.query(
        'SELECT id, total_orders, total_spent, last_order_date FROM customers WHERE phone = $1 LIMIT 1',
        [cleanPhone]
      );
      if (existing.length) {
        customerId = existing[0].id;
        customerUpdated = true;
        const newOrders = (existing[0].total_orders || 0) + 1;
        const newSpent = (existing[0].total_spent || 0) + order.totalAmount;
        const tier = newOrders > 15 || newSpent > 20000 ? 'GOLD' : newOrders > 5 || newSpent > 5000 ? 'SILVER' : 'BRONZE';
        await client.query(
          'UPDATE customers SET total_orders = $1, total_spent = $2, tier = $3, last_order_date = $4 WHERE id = $5',
          [newOrders, newSpent, tier, order.createdAt || new Date().toISOString(), customerId]
        );
      }
    }

    if (!customerId && order.customerName) {
      const { rows: byName } = await client.query(
        'SELECT id FROM customers WHERE name = $1 LIMIT 1',
        [order.customerName]
      );
      if (byName.length) customerId = byName[0].id;
    }

    if (!customerId) {
      customerCreated = true;
      const { rows: newCust } = await client.query(
        `INSERT INTO customers (name, phone, total_orders, total_spent, tier, last_order_date, address)
         VALUES ($1, $2, 1, $3, 'BRONZE', $4, $5) RETURNING id`,
        [order.customerName, phoneToSave, order.totalAmount,
         order.createdAt || new Date().toISOString(), order.deliveryLocation || null]
      );
      customerId = newCust[0].id;
    }

    // Gerar número de pedido se não tiver
    let orderNumber = order.orderNumber;
    if (!orderNumber?.trim()) {
      const { rows: nums } = await client.query('SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 100');
      let max = 0;
      for (const r of nums) {
        const n = parseInt((r.order_number || '').replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > max) max = n;
      }
      orderNumber = String(max + 1);
    }

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
        external_id, order_number, customer_id, customer_name, customer_phone,
        items, total_amount, status, source, is_delivery, delivery_location,
        delivery_fee, payment_status, amount_paid, payment_proof, payment_proof_text,
        notes, created_at, created_by, delivery_zone_id, delivery_zone_name,
        delivery_latitude, delivery_longitude, delivery_address_formatted
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING *`,
      [
        order.externalId || null, orderNumber, customerId, order.customerName,
        hasPhone ? cleanPhone : '', JSON.stringify(order.items || []),
        order.totalAmount, order.status, order.source || null,
        order.isDelivery || false, order.deliveryLocation || null,
        order.deliveryFee || 0, order.paymentStatus || 'unpaid',
        order.amountPaid || 0, order.paymentProof || null,
        order.paymentProofText || null, order.notes || null,
        order.createdAt || new Date().toISOString(),
        order.createdBy || req.user?.id || null,
        order.deliveryZoneId || null, order.deliveryZoneName || null,
        order.deliveryLatitude || null, order.deliveryLongitude || null,
        order.deliveryAddressFormatted || null
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({
      order: mapOrder(orderRows[0]),
      customerCreated,
      customerUpdated
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /orders]', err);
    res.status(500).json({ error: 'Erro ao criar pedido: ' + err.message });
  } finally {
    client.release();
  }
});

// PUT /api/orders/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    const fieldMap = {
      status: 'status', totalAmount: 'total_amount', items: 'items',
      createdAt: 'created_at', customerName: 'customer_name',
      customerPhone: 'customer_phone', isDelivery: 'is_delivery',
      deliveryLocation: 'delivery_location', deliveryFee: 'delivery_fee',
      paymentStatus: 'payment_status', amountPaid: 'amount_paid',
      paymentProof: 'payment_proof', paymentProofText: 'payment_proof_text',
      notes: 'notes', deliveryZoneId: 'delivery_zone_id',
      deliveryZoneName: 'delivery_zone_name', deliveryLatitude: 'delivery_latitude',
      deliveryLongitude: 'delivery_longitude', deliveryAddressFormatted: 'delivery_address_formatted',
      createdBy: 'created_by'
    };

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (updates[jsKey] !== undefined) {
        fields.push(`${dbKey} = $${i++}`);
        values.push(jsKey === 'items' ? JSON.stringify(updates[jsKey]) : updates[jsKey]);
      }
    }

    if (fields.length === 0) return res.json({ success: true });
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(`UPDATE orders SET ${fields.join(', ')} WHERE id = $${i}`, values);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /orders]', err);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar pedido' });
  }
});

// DELETE /api/orders (bulk)
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.json({ success: true, deleted: 0, errors: [] });
    await pool.query('DELETE FROM orders WHERE id = ANY($1)', [ids]);
    res.json({ success: true, deleted: ids.length, errors: [] });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar pedidos' });
  }
});

export default router;
