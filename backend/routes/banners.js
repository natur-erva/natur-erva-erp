import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Garantir que a tabela existe
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_banners (
      id SERIAL PRIMARY KEY,
      image_url TEXT,
      title TEXT NOT NULL DEFAULT 'Saúde Natural & Bem-Estar',
      subtitle TEXT DEFAULT 'Descubra o poder da natureza com produtos 100% naturais e selecionados',
      button_text TEXT DEFAULT 'Ver Produto',
      product_slug TEXT,
      product_id TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

// GET /api/banners/active — público, para a loja
router.get('/active', async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT * FROM shop_banners WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
    );
    if (!rows.length) {
      // Retornar banner padrão se não houver nenhum configurado
      return res.json({
        id: null,
        imageUrl: null,
        title: 'Saúde Natural & Bem-Estar',
        subtitle: 'Descubra o poder da natureza com produtos 100% naturais e selecionados',
        buttonText: 'Explorar Produtos',
        productSlug: null,
        productId: null,
        isActive: true
      });
    }
    const b = rows[0];
    res.json({
      id: b.id,
      imageUrl: b.image_url,
      title: b.title,
      subtitle: b.subtitle,
      buttonText: b.button_text,
      productSlug: b.product_slug,
      productId: b.product_id,
      isActive: b.is_active
    });
  } catch (err) {
    console.error('[Banners GET]', err);
    res.status(500).json({ error: 'Erro ao carregar banner' });
  }
});

// PUT /api/banners — apenas admins
router.put('/', authMiddleware, async (req, res) => {
  try {
    await ensureTable();
    const { imageUrl, title, subtitle, buttonText, productSlug, productId } = req.body;

    // Verificar role admin
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Verificar se já existe um banner
    const { rows: existing } = await pool.query(`SELECT id FROM shop_banners LIMIT 1`);

    if (existing.length > 0) {
      await pool.query(
        `UPDATE shop_banners SET
          image_url = $1, title = $2, subtitle = $3,
          button_text = $4, product_slug = $5, product_id = $6,
          is_active = true, updated_at = NOW()
         WHERE id = $7`,
        [imageUrl || null, title, subtitle, buttonText, productSlug || null, productId || null, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO shop_banners (image_url, title, subtitle, button_text, product_slug, product_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [imageUrl || null, title, subtitle, buttonText, productSlug || null, productId || null]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Banners PUT]', err);
    res.status(500).json({ error: 'Erro ao guardar banner' });
  }
});

export default router;
