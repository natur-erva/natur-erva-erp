/**
 * productService.ts — Via API REST (sem Supabase)
 */
import api from '../../core/services/apiClient';
import { Product, ProductVariant, ProductUnit } from '../../core/types/types';

// ─── Cache simples ─────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; timestamp: number; promise?: Promise<T>; }
const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 30000;

const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
};
const setCached = <T>(key: string, data: T) => cache.set(key, { data, timestamp: Date.now() });

const getOrSetCache = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const existing = cache.get(key);
  if (existing?.promise) return existing.promise;
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  const promise = fetcher();
  cache.set(key, { data: null as any, timestamp: Date.now(), promise });
  try {
    const data = await promise;
    setCached(key, data);
    const entry = cache.get(key);
    if (entry) entry.promise = undefined;
    return data;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
};

export const clearProductCache = (key?: string) => key ? cache.delete(key) : cache.clear();

// ─── Helpers re-exportados (usados por outros módulos) ─────────────────────────
export const parseProductName = (productName: string): { baseName: string; variant: string | null } => {
  const name = productName.trim();
  const variantPatterns = [
    /\s+(\d+[\.,]?\d*\s*(kg|g|ml|l|un|dúzia|duzia))\s*$/i,
    /\s+(\d+[\.,]?\d*)\s*(kg|g|ml|l|un)\s*$/i,
    /\s+(\d+)\s*(un|dúzia|duzia)\s*$/i,
  ];
  for (const pattern of variantPatterns) {
    const match = name.match(pattern);
    if (match) return { baseName: name.replace(pattern, '').trim(), variant: match[0].trim() };
  }
  const words = name.split(/\s+/);
  const lastWord = words[words.length - 1];
  if (/\d/.test(lastWord) && words.length > 1) {
    return { baseName: words.slice(0, -1).join(' ').trim(), variant: lastWord };
  }
  return { baseName: name, variant: null };
};

export const normalizeBaseName = (name: string): string =>
  name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export const groupSimilarProducts = (products: Product[]): Map<string, Product[]> => {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const { baseName } = parseProductName(product.name);
    const normalized = normalizeBaseName(baseName);
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized)!.push(product);
  }
  return groups;
};

// ─── Service ──────────────────────────────────────────────────────────────────
export const productService = {
  clearCache: (key?: string) => clearProductCache(key),

  async getProducts(options?: { useCalculatedStock?: boolean }): Promise<Product[]> {
    const cacheKey = 'products';
    return getOrSetCache(cacheKey, () => api.get<Product[]>('/products'));
  },

  async getProductBySlug(slug: string): Promise<Product | null> {
    try {
      const products = await this.getProducts();
      return products.find(p => p.slug === slug) || null;
    } catch { return null; }
  },

  async getProductsCount(): Promise<number> {
    try {
      const res = await api.get<{ count: number }>('/products/count');
      return res.count;
    } catch { return 0; }
  },

  async addProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
    try {
      const result = await api.post<Product>('/products', product);
      clearProductCache();
      return result;
    } catch (err) {
      console.error('[addProduct]', err);
      return null;
    }
  },

  async updateProduct(productId: string, updates: Partial<Product>): Promise<boolean> {
    try {
      await api.put(`/products/${productId}`, updates);
      clearProductCache();
      return true;
    } catch (err) {
      console.error('[updateProduct]', err);
      return false;
    }
  },

  async deleteProduct(productId: string): Promise<boolean> {
    try {
      await api.delete(`/products/${productId}`);
      clearProductCache();
      return true;
    } catch { return false; }
  },

  async deleteProducts(productIds: string[]): Promise<boolean> {
    const results = await Promise.allSettled(productIds.map(id => this.deleteProduct(id)));
    return results.every(r => r.status === 'fulfilled' && r.value);
  },

  async addVariant(productId: string, variant: Omit<ProductVariant, 'id' | 'productId'>): Promise<ProductVariant | null> {
    try {
      const result = await api.post<ProductVariant>(`/products/${productId}/variants`, variant);
      clearProductCache();
      return result;
    } catch { return null; }
  },

  async updateVariant(variantId: string, updates: Partial<ProductVariant>): Promise<boolean> {
    try {
      await api.put(`/products/variants/${variantId}`, updates);
      clearProductCache();
      return true;
    } catch { return false; }
  },

  async deleteVariant(variantId: string): Promise<boolean> {
    try {
      await api.delete(`/products/variants/${variantId}`);
      clearProductCache();
      return true;
    } catch { return false; }
  },

  async getUnits(): Promise<ProductUnit[]> {
    return [
      { id: 'un', name: 'Unidade', abbreviation: 'un' },
      { id: 'kg', name: 'Kilograma', abbreviation: 'kg' },
      { id: 'g', name: 'Grama', abbreviation: 'g' },
      { id: 'l', name: 'Litro', abbreviation: 'l' },
      { id: 'ml', name: 'Mililitro', abbreviation: 'ml' },
      { id: 'dz', name: 'Dúzia', abbreviation: 'dz' },
    ];
  },

  async getCategories(): Promise<{ id: string, name: string }[]> {
    return [
      { id: 'ervas', name: 'Ervas e Plantas Medicinais' },
      { id: 'suplementos', name: 'Suplementos Naturais' },
      { id: 'cosmetica', name: 'Cosmética Natural' },
      { id: 'alimentacao', name: 'Alimentação Saudável' },
      { id: 'oleos', name: 'Óleos Essenciais' },
      { id: 'infusoes', name: 'Chás e Infusões' },
      { id: 'outros', name: 'Outros' }
    ];
  },

  // Compatibilidade com código legado que usa findOrCreateProduct
  async findOrCreateProduct(_name: string, _unit: string, _price: number) {
    return { id: null, wasCreated: false };
  },

  async mergeProductsIntoVariants(products: Product[]): Promise<Product[]> {
    return products;
  }
};

export default productService;
