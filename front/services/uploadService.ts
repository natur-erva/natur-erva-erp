/**
 * uploadService.ts — Upload via backend REST (sem Supabase Storage)
 */
import { getApiToken } from '../modules/core/services/apiClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3060/api';
const BACKEND_URL = API_BASE.replace('/api', '');

export interface UploadResult {
  url: string;
  path: string;
  publicUrl: string;
}

// Redimensiona e comprime a imagem no browser antes de enviar
function compressImage(file: File, maxSize = 600, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export const uploadService = {
  async uploadImage(file: File, folder = 'products'): Promise<UploadResult | null> {
    try {
      const compressed = await compressImage(file);

      const formData = new FormData();
      formData.append('image', compressed);
      formData.append('folder', folder);

      const token = getApiToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro de upload' }));
        throw new Error(err.error || `Upload falhou: ${response.status}`);
      }

      const data = await response.json();
      return {
        url: data.url || data.publicUrl,
        path: data.path || data.filename,
        publicUrl: data.publicUrl || data.url
      };
    } catch (err: any) {
      console.error('[uploadService] uploadImage:', err.message);
      return null;
    }
  },

  async deleteImage(urlOrPath: string): Promise<boolean> {
    try {
      const filename = urlOrPath.split('/').pop();
      if (!filename) return true;

      const token = getApiToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE}/upload/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers
      });

      return response.ok;
    } catch {
      return false;
    }
  },

  getPublicUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('data:')) return path;
    if (path.startsWith('http')) {
      try {
        const url = new URL(path);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          return `${BACKEND_URL}${url.pathname}`;
        }
      } catch {}
      return path;
    }
    if (path.startsWith('/')) return `${BACKEND_URL}${path}`;
    return `${BACKEND_URL}/uploads/${path}`;
  },

  isLocalUrl(url: string): boolean {
    return url.includes('localhost') || url.includes('/uploads/');
  }
};

export const uploadProductImage = async (file: File) => {
  const result = await uploadService.uploadImage(file, 'products');
  return result?.url || null;
};

export const deleteProductImage = uploadService.deleteImage;

export default uploadService;
