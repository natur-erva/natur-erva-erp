import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Mapeamento DB -> JS
const mapProduct = (p) => ({
  id: p.id,
  name: p.name,
  slug: p.slug || '',
  price: Number(p.price),
  costPrice: Number(p.cost_price || 0),
  type: p.type,
  category: p.category,
  stock: Number(p.stock || 0),
  minStock: Number(p.min_stock || 0),
  unit: p.unit,
  image: p.image,
  image2: p.image_url2,
  image3: p.image_url3,
  image4: p.image_url4,
  updatedAt: p.updated_at,
  showInShop: p.show_in_shop !== undefined ? p.show_in_shop : true,
  description: p.description,
  descriptionLong: p.description_long,
  benefits: p.benefits,
  howToUse: p.how_to_use,
  ingredients: p.ingredients,
  landingPageEnabled: p.landing_page_enabled,
  landingPageData: p.landing_page_data
});

const mapVariant = (v) => ({
  id: v.id,
  productId: v.product_id,
  name: v.name,
  price: Number(v.price),
  costPrice: Number(v.cost_price || 0),
  stock: Number(v.stock || 0),
  minStock: Number(v.min_stock || 0),
  unit: v.unit,
  isDefault: v.is_default || false,
  displayOrder: v.display_order ?? null,
  image: v.image_url || undefined
});

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { rows: products } = await pool.query(
      'SELECT * FROM products ORDER BY category ASC, name ASC'
    );
    const { rows: variants } = await pool.query(
      'SELECT * FROM product_variants ORDER BY display_order ASC NULLS LAST, is_default DESC, name ASC'
    );

    const variantsMap = {};
    for (const v of variants) {
      if (!variantsMap[v.product_id]) variantsMap[v.product_id] = [];
      variantsMap[v.product_id].push(mapVariant(v));
    }

    const result = products.map(p => {
      const product = mapProduct(p);
      const productVariants = variantsMap[p.id] || [];
      product.variants = productVariants;
      product.hasVariants = productVariants.length > 0;
      if (productVariants.length > 0) {
        const def = productVariants.find(v => v.isDefault) || productVariants[0];
        product.price = def.price;
        product.costPrice = def.costPrice;
        product.stock = 0;
      }
      return product;
    });

    res.json(result);
  } catch (err) {
    console.error('[GET /products]', err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// GET /api/products/count
router.get('/count', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM products');
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao contar produtos' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });

    const product = mapProduct(rows[0]);
    const { rows: variants } = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY display_order ASC NULLS LAST, is_default DESC',
      [req.params.id]
    );
    product.variants = variants.map(mapVariant);
    product.hasVariants = product.variants.length > 0;

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

// POST /api/products
router.post('/', authMiddleware, async (req, res) => {
  try {
    const p = req.body;

    // Gerar slug único: normaliza acentos, remove caracteres especiais, garante unicidade
    const baseSlug = (p.slug || p.name || 'produto')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Verificar se o slug já existe e adicionar sufixo numérico se necessário
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const { rows: existing } = await pool.query('SELECT id FROM products WHERE slug = $1', [slug]);
      if (existing.length === 0) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const { rows } = await pool.query(
      `INSERT INTO products (name, slug, price, cost_price, type, category, stock, min_stock, unit, image, image_url2, image_url3, image_url4, show_in_shop, description, description_long, benefits, how_to_use, ingredients)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [p.name, slug, p.price, p.costPrice || 0,
       p.type, p.category, p.stock || 0, p.minStock || 0, p.unit,
       p.image || null, p.image2 || null, p.image3 || null, p.image4 || null,
       p.showInShop !== false, p.description || null, p.descriptionLong || null,
       p.benefits || null, p.howToUse || null, p.ingredients || null]
    );
    res.status(201).json(mapProduct(rows[0]));
  } catch (err) {
    console.error('[POST /products]', err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// PUT /api/products/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const p = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (p.name !== undefined) { fields.push(`name = $${i++}`); values.push(p.name); }
    if (p.slug !== undefined) { fields.push(`slug = $${i++}`); values.push(p.slug); }
    if (p.price !== undefined) { fields.push(`price = $${i++}`); values.push(p.price); }
    if (p.costPrice !== undefined) { fields.push(`cost_price = $${i++}`); values.push(p.costPrice); }
    if (p.type !== undefined) { fields.push(`type = $${i++}`); values.push(p.type); }
    if (p.category !== undefined) { fields.push(`category = $${i++}`); values.push(p.category); }
    if (p.stock !== undefined) { fields.push(`stock = $${i++}`); values.push(p.stock); }
    if (p.minStock !== undefined) { fields.push(`min_stock = $${i++}`); values.push(p.minStock); }
    if (p.unit !== undefined) { fields.push(`unit = $${i++}`); values.push(p.unit); }
    if (p.image !== undefined) { fields.push(`image = $${i++}`); values.push(p.image); }
    if (p.image2 !== undefined) { fields.push(`image_url2 = $${i++}`); values.push(p.image2); }
    if (p.image3 !== undefined) { fields.push(`image_url3 = $${i++}`); values.push(p.image3); }
    if (p.image4 !== undefined) { fields.push(`image_url4 = $${i++}`); values.push(p.image4); }
    if (p.showInShop !== undefined) { fields.push(`show_in_shop = $${i++}`); values.push(p.showInShop); }
    if (p.description !== undefined) { fields.push(`description = $${i++}`); values.push(p.description); }
    if (p.descriptionLong !== undefined) { fields.push(`description_long = $${i++}`); values.push(p.descriptionLong); }
    if (p.benefits !== undefined) { fields.push(`benefits = $${i++}`); values.push(p.benefits); }
    if (p.howToUse !== undefined) { fields.push(`how_to_use = $${i++}`); values.push(p.howToUse); }
    if (p.ingredients !== undefined) { fields.push(`ingredients = $${i++}`); values.push(p.ingredients); }

    if (fields.length === 0) return res.json({ success: true });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(mapProduct(rows[0]));
  } catch (err) {
    console.error('[PUT /products]', err);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar produto' });
  }
});

// === VARIANTES ===

// GET /api/products/:id/variants
router.get('/:id/variants', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY display_order ASC NULLS LAST, is_default DESC',
      [req.params.id]
    );
    res.json(rows.map(mapVariant));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar variantes' });
  }
});

// POST /api/products/:id/variants
router.post('/:id/variants', authMiddleware, async (req, res) => {
  try {
    const v = req.body;
    const { rows } = await pool.query(
      `INSERT INTO product_variants (product_id, name, price, cost_price, stock, min_stock, unit, is_default, display_order, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.params.id, v.name, v.price, v.costPrice || 0, v.stock || 0, v.minStock || 0,
       v.unit, v.isDefault || false, v.displayOrder ?? null, v.image || null]
    );
    res.status(201).json(mapVariant(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar variante' });
  }
});

// PUT /api/products/variants/:variantId
router.put('/variants/:variantId', authMiddleware, async (req, res) => {
  try {
    const v = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (v.name !== undefined) { fields.push(`name = $${i++}`); values.push(v.name); }
    if (v.price !== undefined) { fields.push(`price = $${i++}`); values.push(v.price); }
    if (v.costPrice !== undefined) { fields.push(`cost_price = $${i++}`); values.push(v.costPrice); }
    if (v.stock !== undefined) { fields.push(`stock = $${i++}`); values.push(v.stock); }
    if (v.minStock !== undefined) { fields.push(`min_stock = $${i++}`); values.push(v.minStock); }
    if (v.unit !== undefined) { fields.push(`unit = $${i++}`); values.push(v.unit); }
    if (v.isDefault !== undefined) { fields.push(`is_default = $${i++}`); values.push(v.isDefault); }
    if (v.displayOrder !== undefined) { fields.push(`display_order = $${i++}`); values.push(v.displayOrder); }
    if (v.image !== undefined) { fields.push(`image_url = $${i++}`); values.push(v.image); }

    if (fields.length === 0) return res.json({ success: true });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.variantId);

    const { rows } = await pool.query(
      `UPDATE product_variants SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Variante não encontrada' });
    res.json(mapVariant(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar variante' });
  }
});

// DELETE /api/products/variants/:variantId
router.delete('/variants/:variantId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variants WHERE id = $1', [req.params.variantId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao apagar variante' });
  }
});

export default router;
