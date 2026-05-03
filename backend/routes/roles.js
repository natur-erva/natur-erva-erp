import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/roles
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows: roles } = await pool.query('SELECT id, name, display_name, description, is_system_role FROM roles ORDER BY display_name');
    const { rows: rolePermissions } = await pool.query(`
      SELECT rp.role_id, p.id, p.name, p.description, p.category 
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
    `);
    
    const formattedRoles = roles.map(role => ({
      id: role.id,
      name: role.name,
      display_name: role.display_name,
      description: role.description,
      is_system_role: role.is_system_role,
      role_permissions: rolePermissions
        .filter(rp => rp.role_id === role.id)
        .map(rp => ({
          permission_id: rp.id,
          permissions: {
            id: rp.id,
            name: rp.name,
            description: rp.description,
            category: rp.category
          }
        }))
    }));
    
    res.json(formattedRoles);
  } catch (err) {
    console.error('Erro ao buscar roles:', err);
    res.status(500).json({ error: 'Erro ao buscar roles' });
  }
});

// GET /api/roles/permissions
router.get('/permissions', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM role_permissions');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar permissions:', err);
    res.status(500).json({ error: 'Erro ao buscar permissions' });
  }
});

export default router;
