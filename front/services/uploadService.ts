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

export const uploadService = {
  /**
   * Fazer upload de um ficheiro de imagem para o backend local
   */
  async uploadImage(file: File, folder = 'products'): Promise<UploadResult | null> {
    try {
      const formData = new FormData();
      formData.append('image', file);
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

  /**
   * Apagar uma imagem do backend (por URL ou path)
   */
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

  /**
   * Obter URL pública de uma imagem já armazenada
   */
  getPublicUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) {
      try {
        const url = new URL(path);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          // URL guardado em dev — usa só o pathname para funcionar em produção
          return `${BACKEND_URL}${url.pathname}`;
        }
      } catch {}
      return path;
    }
    if (path.startsWith('/')) return `${BACKEND_URL}${path}`;
    return `${BACKEND_URL}/uploads/${path}`;
  },

  /**
   * Verificar se a URL é do backend local
   */
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
