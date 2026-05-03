import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'naturerva_erp_jwt_secret_2025_super_secure_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Nome, Email e password são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A password deve ter pelo menos 6 caracteres' });
    }

    // Verificar se o email já existe
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM profiles WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'Este email já está registado. Por favor faça login.' });
    }

    // Gerar hash da password
    const hash = await bcrypt.hash(password, 12);

    // Inserir perfil com role CLIENTE
    const { rows: newProfileRows } = await pool.query(
      `INSERT INTO profiles (email, name, phone, role, password_hash, is_active) 
       VALUES ($1, $2, $3, 'CLIENTE', $4, true) RETURNING id, email, name, role`,
      [email.trim(), name.trim(), phone || null, hash]
    );

    const profile = newProfileRows[0];

    // Criar registo de cliente associado
    try {
      await pool.query(
        `INSERT INTO customers (name, email, phone, profile_id) VALUES ($1, $2, $3, $4)`,
        [name.trim(), email.trim(), phone || null, profile.id]
      );
    } catch (err) {
      console.warn('Erro ao criar registo de customer, mas perfil foi criado:', err.message);
    }

    // Gerar JWT
    const tokenPayload = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: 'CLIENTE',
      roles: ['CLIENTE'],
      isSuperAdmin: false
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const user = {
      id: profile.id,
      email: profile.email || '',
      name: profile.name || '',
      phone: phone || undefined,
      role: 'CLIENTE',
      roles: ['CLIENTE'],
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || email)}&background=random`,
      isActive: true,
      isSuperAdmin: false
    };

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[Auth Register]', err);
    res.status(500).json({ error: 'Erro interno ao registar conta' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password são obrigatórios' });
    }

    // Buscar utilizador na tabela profiles (email pode estar em profiles ou auth.users)
    const { rows } = await pool.query(
      `SELECT p.*, p.password_hash 
       FROM profiles p 
       WHERE LOWER(p.email) = LOWER($1) AND p.is_active = true
       LIMIT 1`,
      [email.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique o email e a password.' });
    }

    const profile = rows[0];

    // Verificar password
    if (!profile.password_hash) {
      return res.status(401).json({ error: 'Conta sem password configurada. Contacte o administrador.' });
    }

    const passwordMatch = await bcrypt.compare(password, profile.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique o email e a password.' });
    }

    // Buscar roles
    let roles = [profile.role || 'STAFF'];
    try {
      const { rows: roleRows } = await pool.query(
        `SELECT r.name FROM user_roles ur 
         JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = $1`,
        [profile.id]
      );
      if (roleRows.length > 0) {
        roles = roleRows.map(r => r.name);
      }
    } catch {}

    // Atualizar last_login
    await pool.query(
      'UPDATE profiles SET last_login = NOW() WHERE id = $1',
      [profile.id]
    ).catch(() => {});

    // Gerar JWT
    const tokenPayload = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role || 'STAFF',
      roles,
      isSuperAdmin: profile.is_super_admin || false
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const user = {
      id: profile.id,
      email: profile.email || '',
      name: profile.name || email.split('@')[0],
      phone: profile.phone || undefined,
      role: profile.role || 'STAFF',
      roles,
      avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || email)}&background=random`,
      customerId: profile.customer_id || undefined,
      isActive: profile.is_active !== false,
      isSuperAdmin: profile.is_super_admin || false,
      lastLogin: new Date().toISOString(),
      requiresStrongPassword: profile.requires_strong_password === true
    };

    res.json({ token, user });
  } catch (err) {
    console.error('[Auth Login]', err);
    res.status(500).json({ error: 'Erro interno ao fazer login' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows } = await pool.query(
      'SELECT * FROM profiles WHERE id = $1',
      [decoded.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Utilizador não encontrado' });

    const profile = rows[0];
    let roles = [profile.role || 'STAFF'];
    try {
      const { rows: roleRows } = await pool.query(
        `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
        [profile.id]
      );
      if (roleRows.length > 0) roles = roleRows.map(r => r.name);
    } catch {}

    res.json({
      id: profile.id,
      email: profile.email || '',
      name: profile.name || '',
      phone: profile.phone || undefined,
      role: profile.role || 'STAFF',
      roles,
      avatar: profile.avatar_url,
      customerId: profile.customer_id,
      isActive: profile.is_active !== false,
      isSuperAdmin: profile.is_super_admin || false,
      lastLogin: profile.last_login,
      requiresStrongPassword: profile.requires_strong_password === true
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // JWT é stateless — o cliente apaga o token
  res.json({ success: true });
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado' });
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Passwords obrigatórias' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Nova password deve ter pelo menos 6 caracteres' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM profiles WHERE id = $1', [decoded.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilizador não encontrado' });

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash || '');
    if (!match) return res.status(400).json({ error: 'Password atual incorreta' });

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE profiles SET password_hash = $1, requires_strong_password = false, updated_at = NOW() WHERE id = $2',
      [hash, decoded.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Auth ChangePassword]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
