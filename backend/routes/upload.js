import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas imagens são permitidas'));
    }
    cb(null, true);
  }
});

const router = express.Router();

router.post('/', authMiddleware, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('[Upload] Erro:', err.message);
      return res.status(400).json({ error: err.message || 'Erro no upload' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
    }

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    console.log(`[Upload] ✅ ${req.file.originalname} → base64 (${(req.file.size / 1024).toFixed(1)} KB)`);

    res.json({
      url: dataUrl,
      publicUrl: dataUrl,
      path: dataUrl,
      filename: req.file.originalname
    });
  });
});

// mantido por compatibilidade — base64 não usa ficheiros
router.delete('/:filename', authMiddleware, (req, res) => {
  res.json({ success: true });
});

export default router;
