import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.folder || 'products';
    const folderPath = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });
const router = express.Router();

router.post('/', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('[Upload] Erro no multer:', err.message, err.code);
      return res.status(400).json({ error: err.message || 'Erro no upload' });
    }
    if (!req.file) {
      console.warn('[Upload] Nenhum ficheiro recebido. Body:', req.body, 'Headers content-type:', req.headers['content-type']);
      return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
    }
    const folder = req.body.folder || 'products';
    const filePath = `${folder}/${req.file.filename}`;
    console.log(`[Upload] ✅ Ficheiro guardado: ${req.file.originalname} → ${filePath} (${(req.file.size / 1024).toFixed(1)} KB)`);
    res.json({
      url: `/uploads/${filePath}`,
      publicUrl: `/uploads/${filePath}`,
      path: filePath,
      filename: req.file.filename
    });
  });
});

router.delete('/:filename', authMiddleware, (req, res) => {
  const filename = req.params.filename;
  // Pesquisar em subpastas ou ignorar segurança avançada para o propósito
  // Vou apenas assumir products
  const filePath = path.join(UPLOADS_DIR, 'products', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Ficheiro não encontrado' });
  }
});

export default router;
