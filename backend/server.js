import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar rotas
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import orderRoutes from './routes/orders.js';
import salesRoutes from './routes/sales.js';
import stockRoutes from './routes/stock.js';
import purchaseRoutes from './routes/purchases.js';
import userRoutes from './routes/users.js';
import uploadRoute from './routes/upload.js';
import bannerRoutes from './routes/banners.js';
import roleRoutes from './routes/roles.js';

const app = express();
const PORT = process.env.PORT || 3060;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3055',
  'http://localhost:3056',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Permitir em dev – qualquer localhost
      if (origin?.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origem não permitida: ${origin}`));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── REQUEST LOGGER ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 500 ? '\x1b[31m' // red
                : res.statusCode >= 400 ? '\x1b[33m' // yellow
                : res.statusCode >= 300 ? '\x1b[36m' // cyan
                : '\x1b[32m';                         // green
    const reset = '\x1b[0m';
    console.log(`${color}[${res.statusCode}]${reset} ${req.method} ${req.originalUrl} — ${ms}ms`);
  });
  next();
});

// ── BODY PARSING ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── UPLOADS (ficheiros estáticos) ──────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ── HEALTH CHECK ───────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const { default: pool } = await import('./db.js');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', port: PORT });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ── API ROUTES ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoute);
app.use('/api/banners', bannerRoutes);
app.use('/api/roles', roleRoutes);

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// ── ERROR HANDLER ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});

// ── START ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 NaturErva Backend rodando na porta ${PORT}`);
  console.log(`📦 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
  console.log(`🗄️  DB: ${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`);
});
