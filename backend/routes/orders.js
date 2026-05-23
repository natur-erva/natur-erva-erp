import express from 'express';
import pool from '../db.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const mapOrder = (row) => ({
  id: row.id,
  externalId: row.external_id,
  orderNumber: row.order_number,
  trackingCode: row.tracking_code || null,
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
  updatedAt: row.updated_at,
  createdBy: row.created_by,
  createdByName: row.creator_name || undefined,
  deliveryZoneId: row.delivery_zone_id,
  deliveryZoneName: row.delivery_zone_name,
  deliveryLatitude: row.delivery_latitude,
  deliveryLongitude: row.delivery_longitude,
  deliveryAddressFormatted: row.delivery_address_formatted,
  couponCode: row.coupon_code,
  discountAmount: Number(row.discount_amount) || 0
});

const generateTrackingCode = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `NE-${date}-${suffix}`;
};

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

// GET /api/orders/my-orders — encomendas do cliente autenticado
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT o.*
       FROM orders o
       JOIN profiles p ON p.id = $1
       WHERE o.customer_id = p.customer_id OR o.created_by = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json(rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders/my-orders]', err);
    res.status(500).json({ error: 'Erro ao buscar encomendas' });
  }
});

// GET /api/orders/my-orders/:id — detalhe de 1 encomenda do cliente
router.get('/my-orders/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT o.*
       FROM orders o
       JOIN profiles p ON p.id = $1
       WHERE o.id = $2 AND (o.customer_id = p.customer_id OR o.created_by = $1)`,
      [userId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(mapOrder(rows[0]));
  } catch (err) {
    console.error('[GET /orders/my-orders/:id]', err);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// PUT /api/orders/my-orders/:id/confirm — cliente confirma receção
router.put('/my-orders/:id/confirm', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, status FROM orders
       WHERE id = $1 AND (user_id = $2 OR customer_id IN (SELECT customer_id FROM profiles WHERE id = $2))`,
      [req.params.id, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (rows[0].status !== 'delivered') return res.status(400).json({ error: 'Só é possível confirmar encomendas no estado "Entregue".' });

    await pool.query(
      `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /orders/my-orders/:id/confirm]', err);
    res.status(500).json({ error: 'Erro ao confirmar receção' });
  }
});

// GET /api/orders/tracking/:code — público, sem autenticação
router.get('/tracking/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT order_number, tracking_code, status, created_at, updated_at,
              delivery_zone_name, is_delivery, customer_name
       FROM orders WHERE UPPER(tracking_code) = UPPER($1)`,
      [req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    const o = rows[0];
    res.json({
      trackingCode: o.tracking_code,
      orderNumber: o.order_number,
      status: o.status,
      customerName: o.customer_name,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      deliveryZoneName: o.delivery_zone_name,
      isDelivery: o.is_delivery,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao rastrear pedido' });
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
        const newOrders = Number(existing[0].total_orders || 0) + 1;
        const newSpent = Number(existing[0].total_spent || 0) + Number(order.totalAmount);
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

    // Validar e aplicar cupão se fornecido
    let couponCode = order.couponCode || null;
    let discountAmount = order.discountAmount || 0;
    if (couponCode) {
      const { rows: couponRows } = await client.query(
        'SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = TRUE LIMIT 1',
        [couponCode]
      );
      if (couponRows.length) {
        const coupon = couponRows[0];
        const now = new Date();
        const valid = (!coupon.valid_from || new Date(coupon.valid_from) <= now)
                   && (!coupon.valid_until || new Date(coupon.valid_until) >= now)
                   && (coupon.max_uses === null || coupon.current_uses < coupon.max_uses);
        if (valid) {
          couponCode = coupon.code;
          await client.query(
            'UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1',
            [coupon.id]
          );
        } else {
          couponCode = null;
          discountAmount = 0;
        }
      } else {
        couponCode = null;
        discountAmount = 0;
      }
    }

    const trackingCode = generateTrackingCode();

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (
        external_id, order_number, tracking_code, customer_id, customer_name, customer_phone,
        items, total_amount, status, source, is_delivery, delivery_location,
        delivery_fee, payment_status, amount_paid, payment_proof, payment_proof_text,
        notes, created_at, created_by, delivery_zone_id, delivery_zone_name,
        delivery_latitude, delivery_longitude, delivery_address_formatted,
        coupon_code, discount_amount
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      RETURNING *`,
      [
        order.externalId || null, orderNumber, trackingCode, customerId, order.customerName,
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
        order.deliveryAddressFormatted || null,
        couponCode, discountAmount
      ]
    );

    await client.query('COMMIT');

    // Gerar comissão de afiliado (best-effort — não bloqueia o pedido)
    try {
      const buyerId = order.createdBy || req.user?.id;
      if (buyerId) {
        const { rows: refRows } = await pool.query(
          'SELECT referred_by_code FROM profiles WHERE id = $1', [buyerId]
        );
        const refCode = refRows[0]?.referred_by_code;
        if (refCode) {
          const { rows: affRows } = await pool.query(
            "SELECT id, commission_rate FROM affiliates WHERE referral_code = $1 AND status = 'active'",
            [refCode]
          );
          if (affRows.length) {
            const { id: affiliateId, commission_rate } = affRows[0];
            const commAmt = (Number(order.totalAmount) * Number(commission_rate) / 100).toFixed(2);
            await pool.query(
              `INSERT INTO affiliate_commissions
               (affiliate_id, order_id, referred_profile_id, order_amount, commission_rate, commission_amount)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [affiliateId, orderRows[0].id, buyerId, order.totalAmount, commission_rate, commAmt]
            );
            await pool.query(
              'UPDATE affiliates SET pending_balance = pending_balance + $1, updated_at = NOW() WHERE id = $2',
              [commAmt, affiliateId]
            );
          }
        }
      }
    } catch (affErr) {
      console.warn('[Orders] affiliate commission error:', affErr.message);
    }

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

    // Atribuir pontos ao cliente quando pedido é marcado como entregue/concluído (best-effort)
    if (updates.status === 'delivered' || updates.status === 'completed') {
      try {
        const { rows: orderData } = await pool.query(
          'SELECT total_amount, created_by FROM orders WHERE id = $1',
          [req.params.id]
        );
        if (orderData.length && orderData[0].created_by) {
          const pts = Math.floor(Number(orderData[0].total_amount) / 10);
          if (pts > 0) {
            await pool.query(
              'UPDATE profiles SET points = points + $1, total_points_earned = total_points_earned + $1 WHERE id = $2',
              [pts, orderData[0].created_by]
            );
          }
        }
      } catch (pErr) {
        console.warn('[Orders] points award error:', pErr.message);
      }
    }

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
