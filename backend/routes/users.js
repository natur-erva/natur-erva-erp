import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

const mapUser = (profile) => ({
  id: profile.id,
  name: profile.name || profile.email?.split('@')[0] || 'Utilizador',
  email: profile.email || '',
  phone: profile.phone || undefined,
  role: profile.role || 'STAFF',
  avatar: profile.avatar_url,
  isActive: profile.is_active !== false,
  lastLogin: profile.last_login || undefined,
  locationId: profile.location_id || undefined,
  locationIds: profile.location_ids || [],
  isSuperAdmin: profile.is_super_admin || false
});

// GET /api/users
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT *, location_id, is_super_admin, location_ids FROM profiles ORDER BY name'
    );
    res.json(rows.map(mapUser));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar utilizadores' });
  }
});

// GET /api/users/sales-managers
router.get('/sales-managers', authMiddleware, async (req, res) => {
  try {
    // Tentar via user_roles
    let rows = [];
    try {
      const { rows: roleRows } = await pool.query(
        `SELECT p.* FROM profiles p
         JOIN user_roles ur ON ur.user_id = p.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.name = 'GESTOR_VENDAS'
         ORDER BY p.name`
      );
      rows = roleRows;
    } catch {}

    // Fallback: campo role em profiles
    if (!rows.length) {
      const { rows: fallback } = await pool.query(
        "SELECT * FROM profiles WHERE role = 'GESTOR_VENDAS' ORDER BY name"
      );
      rows = fallback;
    }

    res.json(rows.map(u => ({ ...mapUser(u), role: 'GESTOR_VENDAS' })));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar gestores' });
  }
});

// GET /api/users/order-vendors
router.get('/order-vendors', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.* FROM profiles p
       INNER JOIN orders o ON o.created_by = p.id
       WHERE o.created_by IS NOT NULL
       ORDER BY p.name`
    );
    res.json(rows.map(mapUser));
  } catch (err) {
    res.json([]);
  }
});

// GET /api/users/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilizador não encontrado' });
    res.json(mapUser(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar utilizador' });
  }
});

// POST /api/users
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, email, phone, password, role_ids, is_active, is_super_admin, location_id, location_ids } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Nome, email e password são obrigatórios' });
    }

    // Verificar se o email já existe
    const { rows: existing } = await client.query('SELECT id FROM profiles WHERE email = $1', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Já existe um utilizador com este email' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await client.query('BEGIN');

    // Inserir na tabela profiles
    const { rows: newProfile } = await client.query(
      `INSERT INTO profiles (email, name, phone, role, password_hash, is_active, is_super_admin, location_id, location_ids) 
       VALUES ($1, $2, $3, 'STAFF', $4, $5, $6, $7, $8) RETURNING *`,
      [email, name, phone, passwordHash, is_active !== false, is_super_admin || false, location_id || null, location_ids || '[]']
    );

    const userId = newProfile[0].id;

    // Inserir em user_roles
    if (role_ids && role_ids.length > 0) {
      for (const roleId of role_ids) {
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(mapUser(newProfile[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar utilizador:', err);
    res.status(500).json({ error: 'Erro ao criar utilizador' });
  } finally {
    client.release();
  }
});

// PUT /api/users/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const u = req.body;
    const userId = req.params.id;
    
    await client.query('BEGIN');
    
    const fields = [];
    const values = [];
    let i = 1;

    if (u.name !== undefined) { fields.push(`name = $${i++}`); values.push(u.name); }
    if (u.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(u.phone); }
    if (u.role !== undefined) { fields.push(`role = $${i++}`); values.push(u.role); }
    if (u.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(u.isActive); }
    if (u.locationId !== undefined) { fields.push(`location_id = $${i++}`); values.push(u.locationId); }
    if (u.locationIds !== undefined) { fields.push(`location_ids = $${i++}`); values.push(u.locationIds); }
    if (u.isSuperAdmin !== undefined) { fields.push(`is_super_admin = $${i++}`); values.push(u.isSuperAdmin); }
    if (u.avatar !== undefined) { fields.push(`avatar_url = $${i++}`); values.push(u.avatar); }
    
    if (u.password) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(u.password, salt);
      fields.push(`password_hash = $${i++}`); values.push(passwordHash);
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      values.push(userId);
      await client.query(`UPDATE profiles SET ${fields.join(', ')} WHERE id = $${i}`, values);
    }

    if (u.role_ids !== undefined) {
      // Limpar roles antigas
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      // Inserir novas roles
      if (u.role_ids.length > 0) {
        for (const roleId of u.role_ids) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar utilizador:', err);
    res.status(500).json({ error: 'Erro ao atualizar utilizador' });
  } finally {
    client.release();
  }
});

// DELETE /api/users/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    // Opcionalmente, proibir a deleção do próprio usuário ou do último super admin
    if (req.user && req.user.id === userId) {
      return res.status(400).json({ error: 'Não é possível remover a própria conta.' });
    }
    
    await pool.query('DELETE FROM profiles WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover utilizador:', err);
    res.status(500).json({ error: 'Erro ao remover utilizador' });
  }
});

export default router;
