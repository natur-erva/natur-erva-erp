/**
 * Tipos de produtos
 */

export enum ProductType {
  FRESH = 'fresh',
  FROZEN = 'frozen',
  PROCESSED = 'processed',
}

export enum ProductCategory {
  CARNE = 'Carne',
  POLPA = 'Polpa',
  VERDURA = 'Verdura',
  OVOS = 'Ovos',
  OLEO = 'Óleo',
  GERAL = 'Geral',
}

export enum ProductUnit {
  KG = 'kg',
  G = 'g',
  L = 'l',
  ML = 'ml',
  UN = 'un',
  DZ = 'duzia',
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  isDefault: boolean;
  displayOrder?: number | null;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  type: ProductType | string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  image?: string;
  updatedAt?: string;
  showInShop?: boolean;
  variants?: ProductVariant[];
  hasVariants?: boolean;
}
