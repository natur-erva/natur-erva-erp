
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { normalizeForSearch } from '../../core/services/serviceUtils';
import { MOCK_PRODUCTS } from '../../core/services/mockData';
import { Product, ProductType, ProductVariant, ProductCategory, ProductUnit, VariantTemplate } from '../../core/types/types';
import { stockReportService } from './stockReportService';
import { extractLocalDate, getStockSnapshotDate } from '../../core/utils/dateUtils';

// ==========================================================
// SISTEMA DE CACHE SIMPLES (Duplicado para independência do módulo)
// ==========================================================
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    promise?: Promise<T>;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 30000; // 30 segundos

const getCached = <T>(key: string): T | null => {
    const entry = cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL) {
        cache.delete(key);
        return null;
    }

    return entry.data;
};

const setCached = <T>(key: string, data: T): void => {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
};

const getOrSetCache = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
    const existing = cache.get(key);
    if (existing?.promise) {
        return existing.promise;
    }

    const cached = getCached<T>(key);
    if (cached !== null) {
        return cached;
    }

    const promise = fetcher();
    cache.set(key, {
        data: null as any,
        timestamp: Date.now(),
        promise
    });

    try {
        const data = await promise;
        setCached(key, data);
        const entry = cache.get(key);
        if (entry) {
            entry.promise = undefined;
        }
        return data;
    } catch (error) {
        cache.delete(key);
        throw error;
    }
};

const clearCache = (key?: string): void => {
    if (key) {
        cache.delete(key);
    } else {
        cache.clear();
    }
};

// Helper utils
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const handleSupabaseError = (context: string, error: any) => {
    if (error?.code === '42P01') {
        console.warn(`[${context}] Tabelas não encontradas no Supabase.`);
        return true;
    }
    if (error?.code === 'PGRST205' || (error?.message && error.message.includes('Could not find the table'))) {
        console.warn(`[${context}] Tabela não encontrada no schema cache.`);
        return true;
    }
    if (error?.code === '42703') {
        console.warn(`[${context}] Coluna em falta no banco de dados. Atualize o Schema.`, error.message);
        return true;
    }

    console.error(`[${context}] Erro:`, error.message || error);
    return false;
};

// Lista de preços fixos dos produtos
const FIXED_PRODUCT_PRICES: Record<string, number> = {
    'AMENDOIM PILADO 500G': 160,
    'BATATA DOCE 1KG': 80,
    'COCO RALADO 500G': 70,
    'CODORNA 12UN': 1080,
    'CODORNIZ VIVO UN': 70,
    'COUVE 350G': 60,
    'FARINHA DE MANDIOCA 1KG': 100,
    'FRANGO NORMAL UN': 310,
    'FRANGO FUMADO UN': 335,
    'GALINHA CAFREAL UN': 400,
    'GALINHA CAFREAL FUMADA UN': 425,
    'MAÇANICA SECA 1KG': 200,
    'MANDIOCA FRESCA 1KG': 60,
    'MANGA SECA 1KG': 300,
    'MATAPA 1KG': 180,
    'MBOA 350G': 60,
    'MEL 700ML': 650,
    'NHANGANA 1KG': 180,
    'OLEO DE COCO 150ML': 180,
    'OLEO DE COCO 700ML': 650,
    'OLEO DE MAFURA 150ML': 280,
    'OLEO DE MAFURA 700ML': 850,
    'OVOS DE CODORNA 12UN': 80,
    'OVOS DE GALINHA UN': 30,
    'OVOS DE PATO UN': 35,
    'PATO FUMADO UN': 425,
    'PATO NORMAL UN': 400,
    'PINTOS DE GALINHA': 100,
    'POLPA DE ABACATE 500G': 150,
    'POLPA DE ANANAS 500G': 150,
    'POLPA DE LARANJA 500G': 150,
    'POLPA DE MAÇANICA 1KG': 300,
    'POLPA DE MAFILUA 500G': 150,
    'POLPA DE MANGA 500G': 150,
    'POLPA DE MARACUJÁ 1KG': 300,
    'POLPA DE MARACUJÁ 500G': 150,
    'POLPA DE MASSALA 500G': 150,
    'POLPA DE MELANCIA 500G': 150,
    'POLPA DE PAPAIA 500G': 150,
    'POLPA DE TAMARINO 1KG': 300,
    'POLPA DE TANGERINA 500G': 150,
};

const normalizeProductNameForPrice = (name: string): string => {
    return name.toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/Á/g, 'A')
        .replace(/É/g, 'E')
        .replace(/Í/g, 'I')
        .replace(/Ó/g, 'O')
        .replace(/Ú/g, 'U')
        .replace(/Ç/g, 'C')
        .replace(/Ã/g, 'A')
        .replace(/Õ/g, 'O');
};

const getFixedProductPrice = (productName: string, quantity: number, unit: string): number | null => {
    const normalized = normalizeProductNameForPrice(productName);

    if (FIXED_PRODUCT_PRICES[normalized]) {
        return FIXED_PRODUCT_PRICES[normalized];
    }

    if (normalized.includes('PATO NORMAL') || normalized.includes('PATO FUMADO')) {
        if (unit === 'kg') {
            return 200;
        }
        if (normalized.includes('PATO NORMAL')) return 400;
        if (normalized.includes('PATO FUMADO')) return 425;
    }

    if (normalized.includes('FRANGO NORMAL')) {
        if (unit === 'kg') return 155;
        return 310;
    }

    if (normalized.includes('FRANGO FUMADO')) {
        if (unit === 'kg') return 167.5;
        return 335;
    }

    if (normalized.includes('GALINHA CAFREAL')) {
        if (normalized.includes('FUMADA')) {
            if (unit === 'kg') return 212.5;
            return 425;
        }
        if (unit === 'kg') return 200;
        return 400;
    }

    return null;
};

const parseMonetaryValue = (value: string): number => {
    if (!value || value.trim() === '') return 0;

    let clean = value.toString()
        .replace(/MT/gi, '')
        .replace(/MZN/gi, '')
        .replace(/\s/g, '')
        .trim();

    clean = clean.replace(/[^\d.,]/g, '');

    if (!clean) return 0;

    if (clean.includes('.') && clean.includes(',')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    }
    else if (clean.includes(',')) {
        const commaIndex = clean.indexOf(',');
        const afterComma = clean.substring(commaIndex + 1);
        if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
            clean = clean.replace(',', '.');
        } else {
            clean = clean.replace(/,/g, '');
        }
    }
    else if (clean.includes('.')) {
        const dotMatches = clean.match(/\./g);
        const dotCount = dotMatches ? dotMatches.length : 0;

        if (dotCount > 1) {
            clean = clean.replace(/\./g, '');
        } else {
            const dotIndex = clean.indexOf('.');
            const afterDot = clean.substring(dotIndex + 1);
            const beforeDot = clean.substring(0, dotIndex);
            const afterDotIsNumeric = /^\d+$/.test(afterDot);
            const beforeDotIsNumeric = beforeDot.length === 0 || /^\d+$/.test(beforeDot);

            if (!afterDotIsNumeric || !beforeDotIsNumeric) {
                clean = clean.replace(/[^\d]/g, '');
            }
            else if (afterDot.length === 3) {
                clean = clean.replace('.', '');
            }
            else if (afterDot.length <= 2) {
                if (beforeDot.length > 2) {
                } else {
                }
            }
            else {
                clean = clean.replace('.', '');
            }
        }
    }

    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

const findOrCreateProduct = async (productName: string, unit: string, priceAtTime: number): Promise<{ id: string | null, wasCreated: boolean }> => {
    if (!isSupabaseConfigured() || !supabase) return { id: null, wasCreated: false };

    const normalizedName = productName.trim().toLowerCase();
    const searchNorm = normalizeForSearch(normalizedName);

    const cleanName = normalizedName
        .replace(/^(pato|frango|carne|polpa|é³leo|oleo)\s+/i, '')
        .replace(/\s+(normal|fumado|fresco|congelado)$/i, '')
        .trim();

    let existing: { id: string; name?: string } | undefined;

    const { data: exactRows } = await supabase
        .from('products')
        .select('id, name')
        .ilike('name', normalizedName)
        .limit(10);
    const exactMatch = exactRows?.find(r => normalizeForSearch(r.name || '').includes(searchNorm) || normalizeForSearch(r.name || '') === searchNorm);
    if (exactMatch) existing = { id: exactMatch.id };

    if (!existing) {
        const { data: partialRows } = await supabase
            .from('products')
            .select('id, name')
            .ilike('name', `%${normalizedName}%`)
            .limit(20);
        const match = partialRows?.find(r => normalizeForSearch(r.name || '').includes(searchNorm));
        if (match) existing = { id: match.id };
    }

    if (!existing && cleanName !== normalizedName) {
        const { data: cleanRows } = await supabase
            .from('products')
            .select('id, name')
            .ilike('name', `%${cleanName}%`)
            .limit(20);
        const match = cleanRows?.find(r => normalizeForSearch(r.name || '').includes(normalizeForSearch(cleanName)));
        if (match) existing = { id: match.id };
    }

    if (!existing) {
        const keywords = cleanName
            .split(/\s+/)
            .filter(w => w.length > 3 && !/^\d+/.test(w))
            .slice(0, 2);

        for (const keyword of keywords) {
            const { data: keywordRows } = await supabase
                .from('products')
                .select('id, name')
                .ilike('name', `%${keyword}%`)
                .limit(20);
            const match = keywordRows?.find(r => normalizeForSearch(r.name || '').includes(normalizeForSearch(keyword)));
            if (match) {
                existing = { id: match.id };
                break;
            }
        }
    }

    if (!existing && searchNorm) {
        const { data: fallbackRows } = await supabase
            .from('products')
            .select('id, name')
            .limit(200);
        const match = fallbackRows?.find(r => normalizeForSearch(r.name || '').includes(searchNorm));
        if (match) existing = { id: match.id };
    }

    if (existing) {
        return { id: existing.id, wasCreated: false };
    }

    let type = ProductType.FRESH;
    let category = 'Geral';

    const nameLower = normalizedName;
    if (nameLower.includes('pato') || nameLower.includes('frango') || nameLower.includes('carne')) {
        type = ProductType.FROZEN;
        category = 'Carnes';
    } else if (nameLower.includes('polpa') || nameLower.includes('maracujá') || nameLower.includes('maphilua')) {
        type = ProductType.PROCESSED;
        category = 'Polpas';
    } else if (nameLower.includes('matapa') || nameLower.includes('folha') || nameLower.includes('abóbora')) {
        type = ProductType.FRESH;
        category = 'Verduras';
    } else if (nameLower.includes('codorniz') || nameLower.includes('ovo')) {
        type = ProductType.FRESH;
        category = 'Ovos';
    } else if (nameLower.includes('óleo') || nameLower.includes('oleo')) {
        type = ProductType.PROCESSED;
        category = 'Óleos';
    }

    let finalUnit = unit || 'un';
    if (nameLower.includes('kg') || nameLower.includes('quilograma')) finalUnit = 'kg';
    else if (nameLower.includes('g ')) finalUnit = 'g';
    else if (nameLower.includes('ml') || nameLower.includes('litro')) finalUnit = 'l';
    else if (nameLower.includes('dúzia') || nameLower.includes('duzia')) finalUnit = 'dúzia';

    const { data: newProduct, error } = await supabase
        .from('products')
        .insert({
            name: productName.trim(),
            price: priceAtTime > 0 ? priceAtTime : 0,
            cost_price: priceAtTime > 0 ? priceAtTime * 0.6 : 0,
            type: type as string,
            category: category,
            stock: 0,
            min_stock: 5,
            unit: finalUnit
        })
        .select('id')
        .single();

    if (error) {
        console.error(`[FindOrCreateProduct] Erro ao criar produto "${productName}":`, error.message);
        return { id: null, wasCreated: false };
    }

    return { id: newProduct?.id || null, wasCreated: true };
};

export const parseProductName = (productName: string): { baseName: string; variant: string | null } => {
    const name = productName.trim();

    const variantPatterns = [
        /\s+(\d+[\.,]?\d*\s*(kg|g|ml|l|un|dúzia|duzia))\s*$/i,
        /\s+(\d+[\.,]?\d*)\s*(kg|g|ml|l|un)\s*$/i,
        /\s+(\d+)\s*(un|dúzia|duzia)\s*$/i,
    ];

    for (const pattern of variantPatterns) {
        const match = name.match(pattern);
        if (match) {
            const variant = match[0].trim();
            const baseName = name.replace(pattern, '').trim();
            return { baseName, variant };
        }
    }

    const words = name.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (/\d/.test(lastWord)) {
        const variant = lastWord;
        const baseName = words.slice(0, -1).join(' ').trim();
        if (baseName) {
            return { baseName, variant };
        }
    }

    return { baseName: name, variant: null };
};

export const normalizeBaseName = (name: string): string => {
    return name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

export const groupSimilarProducts = (products: Product[]): Map<string, Product[]> => {
    const groups = new Map<string, Product[]>();

    for (const product of products) {
        const { baseName } = parseProductName(product.name);
        const normalized = normalizeBaseName(baseName);

        if (!groups.has(normalized)) {
            groups.set(normalized, []);
        }
        groups.get(normalized)!.push(product);
    }

    return groups;
};

export const mergeProductsIntoVariants = async (products: Product[]): Promise<Product[]> => {
    if (!isSupabaseConfigured() || !supabase) {
        return products;
    }

    const groups = groupSimilarProducts(products);
    const mergedProducts: Product[] = [];

    for (const [baseName, similarProducts] of groups.entries()) {
        if (similarProducts.length === 1) {
            mergedProducts.push(similarProducts[0]);
        } else {
            const mainProduct = similarProducts[0];
            const variants: ProductVariant[] = [];

            for (const product of similarProducts) {
                const { variant } = parseProductName(product.name);
                const variantName = variant || product.unit || 'UN';

                variants.push({
                    id: product.id,
                    productId: mainProduct.id,
                    name: variantName,
                    price: product.price,
                    costPrice: product.costPrice || 0,
                    stock: product.stock,
                    minStock: product.minStock || 5,
                    unit: product.unit,
                    isDefault: product === mainProduct
                });
            }

            const mergedProduct: Product = {
                ...mainProduct,
                name: parseProductName(mainProduct.name).baseName,
                variants,
                hasVariants: true,
                stock: variants.reduce((sum, v) => sum + v.stock, 0)
            };

            mergedProducts.push(mergedProduct);
        }
    }

    return mergedProducts;
};

export const productService = {

    async getProducts(options?: { useCalculatedStock?: boolean }): Promise<Product[]> {
        const useCalculatedStock = options?.useCalculatedStock !== false;
        const cacheKey = useCalculatedStock ? 'products' : 'products-raw';
        return getOrSetCache(cacheKey, async () => {
            if (isSupabaseConfigured() && supabase) {
                const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });

                if (error) {
                    handleSupabaseError('GetProducts', error);
                } else if (data) {
                    const products = data.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        slug: p.slug || '',
                        price: Number(p.price),
                        costPrice: Number(p.cost_price || 0),
                        type: p.type,
                        category: p.category,
                        stock: Number(p.stock),
                        minStock: Number(p.min_stock || 0),
                        unit: p.unit,
                        image: p.image_url,
                        updatedAt: p.updated_at,
                        showInShop: p.show_in_shop !== undefined ? p.show_in_shop : true,
                        description: p.description,
                        descriptionLong: p.description_long,
                        landingPageEnabled: p.landing_page_enabled,
                        landingPageData: p.landing_page_data
                    })) as Product[];

                    try {
                        const { data: variantsData, error: variantsError } = await supabase
                            .from('product_variants')
                            .select('*')
                            .order('display_order', { ascending: true, nullsFirst: false })
                            .order('is_default', { ascending: false })
                            .order('name', { ascending: true });

                        if (!variantsError && variantsData) {
                            const variantsMap = new Map<string, ProductVariant[]>();
                            for (const v of variantsData) {
                                const variant: ProductVariant = {
                                    id: v.id,
                                    productId: v.product_id,
                                    name: v.name,
                                    price: Number(v.price),
                                    costPrice: Number(v.cost_price || 0),
                                    stock: Number(v.stock),
                                    minStock: Number(v.min_stock || 0),
                                    unit: v.unit,
                                    isDefault: v.is_default || false,
                                    displayOrder: v.display_order ?? null,
                                    image: v.image_url || undefined
                                };

                                if (!variantsMap.has(v.product_id)) {
                                    variantsMap.set(v.product_id, []);
                                }
                                variantsMap.get(v.product_id)!.push(variant);
                            }

                            for (const product of products) {
                                let variants = variantsMap.get(product.id) || [];

                                if (variants.length === 0) {
                                    console.warn(`[getProducts] ⚠️ Produto "${product.name}" não tem variantes. Criando variante padrão...`);

                                    let variantName = 'Padrão';
                                    if (product.unit === 'DZ') {
                                        variantName = 'Dúzia';
                                    } else if (product.unit === 'KG' || product.unit === 'kg') {
                                        variantName = '1kg';
                                    } else if (product.unit === 'G' || product.unit === 'g') {
                                        variantName = '500g';
                                    } else if (product.unit === 'ML' || product.unit === 'ml') {
                                        variantName = '500ml';
                                    } else if (product.unit === 'L' || product.unit === 'l') {
                                        variantName = '1L';
                                    }

                                    try {
                                        const { data: newVariant, error: variantError } = await supabase
                                            .from('product_variants')
                                            .insert({
                                                product_id: product.id,
                                                name: variantName,
                                                price: product.price,
                                                cost_price: product.costPrice || 0,
                                                stock: product.stock || 0,
                                                unit: product.unit || 'un',
                                                is_default: true,
                                                display_order: 0
                                            })
                                            .select()
                                            .single();

                                        if (!variantError && newVariant) {
                                            const variant: ProductVariant = {
                                                id: newVariant.id,
                                                productId: product.id,
                                                name: newVariant.name,
                                                price: Number(newVariant.price),
                                                costPrice: Number(newVariant.cost_price || 0),
                                                stock: Number(newVariant.stock),
                                                minStock: Number(newVariant.min_stock || 0),
                                                unit: newVariant.unit,
                                                isDefault: true,
                                                displayOrder: 0,
                                                image: newVariant.image_url || undefined
                                            };
                                            variants = [variant];
                                            console.log(`[getProducts] ✅ Variante padrão "${variantName}" criada para "${product.name}"`);
                                        } else {
                                            console.error(`[getProducts] ❌ Erro ao criar variante padrão:`, variantError);
                                        }
                                    } catch (err: any) {
                                        console.error(`[getProducts] ❌ Erro ao criar variante padrão:`, err);
                                    }
                                }

                                if (variants.length > 0) {
                                    product.variants = variants;
                                    product.hasVariants = true;
                                    product.stock = 0;
                                    const defaultVariant = variants.find(v => v.isDefault) || variants[0];
                                    if (defaultVariant) {
                                        product.price = defaultVariant.price;
                                        product.costPrice = defaultVariant.costPrice;
                                    }
                                } else {
                                    console.error(`[getProducts] ❌ Produto "${product.name}" não tem variantes e não foi possível criar uma.`);
                                    product.variants = [];
                                    product.hasVariants = false;
                                    product.stock = 0;
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('[GetProducts] Tabela product_variants não encontrada. Produtos serão exibidos sem variações.');
                    }

                    if (useCalculatedStock) {
                        try {
                            const snapshotDate = getStockSnapshotDate();
                            const rows = await stockReportService.getCurrentStockSummary(snapshotDate);
                            const stockByKey = new Map<string, number>();
                            for (const row of rows) {
                                const key = row.variantId ?? `product:${row.productId}`;
                                stockByKey.set(key, Math.max(0, row.finalStock ?? 0));
                            }
                            for (const product of products) {
                                if (product.variants && product.variants.length > 0) {
                                    for (const variant of product.variants) {
                                        const qty = stockByKey.get(variant.id);
                                        if (qty !== undefined) variant.stock = qty;
                                        else variant.stock = Math.max(0, variant.stock ?? 0);
                                    }
                                } else {
                                    const qty = stockByKey.get(`product:${product.id}`);
                                    if (qty !== undefined) product.stock = qty;
                                    else product.stock = Math.max(0, product.stock ?? 0);
                                }
                            }
                            // Garantir que nenhum stock exibido seja negativo (BD ou API)
                            for (const product of products) {
                                if (product.variants) {
                                    for (const v of product.variants) {
                                        if ((v.stock ?? 0) < 0) v.stock = 0;
                                    }
                                }
                                if ((product.stock ?? 0) < 0) product.stock = 0;
                            }
                        } catch (e) {
                            console.warn('[getProducts] getCurrentStockSummary failed, using DB stock:', e);
                            for (const product of products) {
                                if (product.variants) {
                                    for (const v of product.variants) {
                                        if ((v.stock ?? 0) < 0) v.stock = 0;
                                    }
                                }
                                if ((product.stock ?? 0) < 0) product.stock = 0;
                            }
                        }
                    }

                    return products.sort((a, b) => {
                        const catA = a.category || 'zzz';
                        const catB = b.category || 'zzz';
                        if (catA < catB) return -1;
                        if (catA > catB) return 1;
                        return a.name.localeCompare(b.name);
                    });
                }
            }
            return Promise.resolve(MOCK_PRODUCTS as unknown as Product[]);
        });
    },

    async getProductBySlug(slug: string): Promise<Product | null> {
        if (!isSupabaseConfigured() || !supabase) return null;
        
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('slug', slug)
            .single();

        if (error || !data) {
            console.error('[getProductBySlug] Erro:', error);
            return null;
        }

        const product: Product = {
            id: data.id,
            name: data.name,
            slug: data.slug,
            price: Number(data.price),
            costPrice: Number(data.cost_price || 0),
            type: data.type,
            category: data.category,
            stock: Number(data.stock),
            minStock: Number(data.min_stock || 0),
            unit: data.unit,
            image: data.image_url,
            updatedAt: data.updated_at,
            showInShop: data.show_in_shop !== undefined ? data.show_in_shop : true,
            description: data.description,
            descriptionLong: data.description_long,
            landingPageEnabled: data.landing_page_enabled,
            landingPageData: data.landing_page_data
        };

        // Fetch variants
        const { data: variantsData } = await supabase
            .from('product_variants')
            .select('*')
            .eq('product_id', product.id)
            .order('display_order', { ascending: true, nullsFirst: false });

        if (variantsData) {
            product.variants = variantsData.map((v: any) => ({
                id: v.id,
                productId: v.product_id,
                name: v.name,
                price: Number(v.price),
                costPrice: Number(v.cost_price || 0),
                stock: Number(v.stock),
                minStock: Number(v.min_stock || 0),
                unit: v.unit,
                isDefault: v.is_default || false,
                displayOrder: v.display_order ?? null,
                image: v.image_url || undefined
            }));
            product.hasVariants = product.variants.length > 0;
            
            // Recalculate stock
            try {
                const snapshotDate = getStockSnapshotDate();
                const rows = await stockReportService.getCurrentStockSummary(snapshotDate);
                const stockByVariant = new Map<string, number>();
                for (const row of rows) {
                    if (row.productId === product.id) {
                        stockByVariant.set(row.variantId || 'main', Math.max(0, row.finalStock || 0));
                    }
                }
                
                if (product.variants) {
                    for (const v of product.variants) {
                        const qty = stockByVariant.get(v.id);
                        if (qty !== undefined) v.stock = qty;
                    }
                }
            } catch (e) {
                console.warn('[getProductBySlug] Failed to recalculate stock:', e);
            }
        }

        return product;
    },

    async getProductsCount(): Promise<number> {
        if (!isSupabaseConfigured() || !supabase) return 0;
        try {
            const { count, error } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true });
            if (error) {
                handleSupabaseError('GetProductsCount', error);
                return 0;
            }
            return count ?? 0;
        } catch (error: any) {
            console.error('[getProductsCount] Erro:', error);
            return 0;
        }
    },

    async addProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
        if (isSupabaseConfigured() && supabase) {
            const dbProduct = {
                name: product.name,
                price: product.price,
                cost_price: product.costPrice || 0,
                type: product.type,
                category: product.category,
                stock: 0,
                min_stock: product.minStock,
                unit: product.unit,
                image_url: product.image,
                show_in_shop: product.showInShop !== undefined ? product.showInShop : true
            };

            let { data, error } = await supabase.from('products').insert(dbProduct).select().single();

            if (error?.code === '42703') {
                console.warn("DB schema outdated (missing columns). Attempting basic insert...");
                const basicProduct = { ...dbProduct };
                delete (basicProduct as any).cost_price;
                delete (basicProduct as any).image_url;

                const retry = await supabase.from('products').insert(basicProduct).select().single();
                data = retry.data;
                error = retry.error;
            }

            if (error) {
                console.error('Supabase Products Error:', error.message);
                return null;
            }

            if (data && data.id) {
                let variantName = 'Padrão';
                if (product.unit === 'DZ') {
                    variantName = 'Dúzia';
                } else if (product.unit === 'KG' || product.unit === 'kg') {
                    variantName = '1kg';
                } else if (product.unit === 'G' || product.unit === 'g') {
                    variantName = '500g';
                } else if (product.unit === 'ML' || product.unit === 'ml') {
                    variantName = '500ml';
                } else if (product.unit === 'L' || product.unit === 'l') {
                    variantName = '1L';
                }

                const { data: variantData, error: variantError } = await supabase
                    .from('product_variants')
                    .insert({
                        product_id: data.id,
                        name: variantName,
                        price: product.price,
                        cost_price: product.costPrice || 0,
                        stock: product.stock || 0,
                        unit: product.unit || 'un',
                        is_default: true,
                        display_order: 0
                    })
                    .select()
                    .single();

                if (variantError) {
                    console.error('[addProduct] Erro ao criar variante padrão:', variantError);
                } else {
                    console.log(`[addProduct] ✅ Variante padrão "${variantName}" criada para produto "${product.name}"`);
                }
            }

            return data;
        }
        return null;
    },

    async updateProduct(id: string, updates: Partial<Product>): Promise<boolean> {
        clearCache('products');
        clearCache('products-raw');
        if (isSupabaseConfigured() && supabase) {
            const dbUpdates: any = {};

            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.price !== undefined) dbUpdates.price = updates.price;
            if (updates.type !== undefined) dbUpdates.type = updates.type;
            if (updates.category !== undefined) dbUpdates.category = updates.category;
            if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
            if (updates.unit !== undefined) dbUpdates.unit = updates.unit;

            if (updates.minStock !== undefined) dbUpdates.min_stock = updates.minStock;
            if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
            if (updates.image !== undefined) dbUpdates.image_url = updates.image;
            if (updates.showInShop !== undefined) dbUpdates.show_in_shop = updates.showInShop;
            if (updates.slug !== undefined) dbUpdates.slug = updates.slug;
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.descriptionLong !== undefined) dbUpdates.description_long = updates.descriptionLong;
            if (updates.landingPageEnabled !== undefined) dbUpdates.landing_page_enabled = updates.landingPageEnabled;
            if (updates.landingPageData !== undefined) dbUpdates.landing_page_data = updates.landingPageData;

            dbUpdates.updated_at = new Date().toISOString();

            let { error } = await supabase.from('products').update(dbUpdates).eq('id', id);

            if (error?.code === '42703') {
                console.warn("[UpdateProduct] Coluna não encontrada. Tentando sem campos opcionais...");
                const basicUpdates: any = {};
                if (updates.name !== undefined) basicUpdates.name = updates.name;
                if (updates.price !== undefined) basicUpdates.price = updates.price;
                if (updates.type !== undefined) basicUpdates.type = updates.type;
                if (updates.category !== undefined) basicUpdates.category = updates.category;
                if (updates.stock !== undefined) basicUpdates.stock = updates.stock;
                if (updates.unit !== undefined) basicUpdates.unit = updates.unit;

                const retry = await supabase.from('products').update(basicUpdates).eq('id', id);
                error = retry.error;
            }

            if (error) {
                console.error('[UpdateProduct] Erro ao atualizar produto:', error.message, error.code);
                if (error.code === '42703') {
                    console.error('[UpdateProduct] Coluna não existe no banco. Execute o script SQL nas Configurações.');
                }
                return false;
            }
            return true;
        }
        return true;
    },

    async deleteProduct(id: string): Promise<boolean> {
        clearCache('products');
        clearCache('products-raw');
        if (isSupabaseConfigured() && supabase) {
            await supabase.from('product_variants').delete().eq('product_id', id);
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) {
                console.error('Supabase Products Error:', error.message);
                return false;
            }
            return true;
        }
        return true;
    },

    async addVariant(productId: string, variant: Omit<ProductVariant, 'id' | 'productId'>): Promise<ProductVariant | null> {
        if (isSupabaseConfigured() && supabase) {
            const { data: existingVariants } = await supabase
                .from('product_variants')
                .select('display_order')
                .eq('product_id', productId)
                .order('display_order', { ascending: false, nullsFirst: false })
                .limit(1);

            const maxOrder = existingVariants && existingVariants.length > 0
                ? (existingVariants[0].display_order ?? -1) + 1
                : 0;

            const dbVariant: any = {
                product_id: productId,
                name: variant.name,
                price: variant.price,
                cost_price: variant.costPrice || 0,
                stock: variant.stock,
                min_stock: variant.minStock || 5,
                unit: variant.unit,
                is_default: variant.isDefault || false,
                display_order: variant.displayOrder ?? maxOrder,
                image_url: variant.image || null
            };

            const { data, error } = await supabase
                .from('product_variants')
                .insert(dbVariant)
                .select()
                .single();

            if (error) {
                console.error('[AddVariant] Erro:', error.message);
                return null;
            }

            clearCache('products');
            clearCache('products-raw');

            return {
                id: data.id,
                productId: data.product_id,
                name: data.name,
                price: Number(data.price),
                costPrice: Number(data.cost_price || 0),
                stock: Number(data.stock),
                minStock: Number(data.min_stock || 0),
                unit: data.unit,
                isDefault: data.is_default || false,
                displayOrder: data.display_order ?? null,
                image: data.image_url || undefined
            };
        }
        return null;
    },

    async updateVariant(variantId: string, updates: Partial<ProductVariant>): Promise<boolean> {
        if (isSupabaseConfigured() && supabase) {
            const dbUpdates: any = {};
            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.price !== undefined) dbUpdates.price = updates.price;
            if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
            if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
            if (updates.minStock !== undefined) dbUpdates.min_stock = updates.minStock;
            if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
            if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;
            if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;
            if (updates.image !== undefined) dbUpdates.image_url = updates.image || null;
            dbUpdates.updated_at = new Date().toISOString();

            const { error } = await supabase
                .from('product_variants')
                .update(dbUpdates)
                .eq('id', variantId);

            if (error) {
                console.error('[UpdateVariant] Erro:', error.message);
                return false;
            }
            clearCache('products');
            clearCache('products-raw');
            return true;
        }
        return true;
    },

    async deleteVariant(variantId: string): Promise<boolean> {
        if (isSupabaseConfigured() && supabase) {
            const { error } = await supabase
                .from('product_variants')
                .delete()
                .eq('id', variantId);

            if (error) {
                console.error('[DeleteVariant] Erro:', error.message);
                return false;
            }
            clearCache('products');
            clearCache('products-raw');
            return true;
        }
        return true;
    },

    async importProductsFromList(productList: string): Promise<{ success: number; errors: string[] }> {
        const lines = productList.split('\n').map(l => l.trim()).filter(l => l);
        const errors: string[] = [];
        let successCount = 0;

        const existingProducts = await this.getProducts();

        for (const line of lines) {
            try {
                let name = '';
                let price = 0;

                const tabMatch = line.match(/^(.+?)[\t]\s*(\d+[\.,]?\d*)\s*(MT)?$/i);
                if (tabMatch) {
                    name = tabMatch[1].trim();
                    price = parseMonetaryValue(tabMatch[2]);
                } else {
                    const spaceMatch = line.match(/^(.+?)\s+(\d+[\.,]?\d*)\s*(MT|MZN)?$/i);
                    if (spaceMatch) {
                        name = spaceMatch[1].trim();
                        price = parseMonetaryValue(spaceMatch[2]);
                    } else {
                        errors.push(`Linha não reconhecida: ${line}`);
                        continue;
                    }
                }

                if (!name || price <= 0) {
                    errors.push(`Linha inválida: ${line} (nome vazio ou preço inválido)`);
                    continue;
                }

                const productName = name.trim();

                let category = 'Diversos';
                let type = ProductType.FRESH;
                const nameLower = productName.toLowerCase();

                if (nameLower.includes('pato') || nameLower.includes('frango') || nameLower.includes('galinha') || nameLower.includes('codorna') || nameLower.includes('codorniz')) {
                    category = 'Carnes';
                    type = nameLower.includes('fumado') || nameLower.includes('fumada') ? ProductType.PROCESSED : ProductType.FRESH;
                } else if (nameLower.includes('polpa')) {
                    category = 'Polpas';
                    type = ProductType.FROZEN;
                } else if (nameLower.includes('óleo') || nameLower.includes('oleo')) {
                    category = 'Óleos';
                    type = ProductType.PROCESSED;
                } else if (nameLower.includes('couve') || nameLower.includes('matapa') || nameLower.includes('mboa')) {
                    category = 'Verduras';
                    type = ProductType.FRESH;
                } else if (nameLower.includes('ovo') || nameLower.includes('ovos')) {
                    category = 'Diversos';
                    type = ProductType.FRESH;
                } else if (nameLower.includes('mel')) {
                    category = 'Diversos';
                    type = ProductType.PROCESSED;
                }

                let unit = 'un';
                if (nameLower.includes('kg') || nameLower.match(/\d+\s*kg/i)) {
                    unit = 'kg';
                } else if (nameLower.includes('g ') || nameLower.match(/\d+\s*g\b/i)) {
                    unit = 'g';
                } else if (nameLower.includes('ml') || nameLower.match(/\d+\s*ml/i)) {
                    unit = 'ml';
                } else if (nameLower.includes('l') && !nameLower.includes('ml')) {
                    unit = 'l';
                } else if (nameLower.match(/\d+\s*un/i) || nameLower.includes('un')) {
                    unit = 'un';
                }

                const existing = existingProducts.find(p =>
                    p.name.toLowerCase().trim() === productName.toLowerCase().trim()
                );

                if (existing) {
                    if (existing.price !== price) {
                        await this.updateProduct(existing.id, {
                            price,
                            costPrice: price * 0.6
                        });
                        successCount++;
                    } else {
                        continue;
                    }
                } else {
                    const newProduct = await this.addProduct({
                        name: productName,
                        price,
                        costPrice: price * 0.6,
                        type,
                        category,
                        stock: 0,
                        minStock: 5,
                        unit
                    });

                    if (newProduct) {
                        successCount++;
                    } else {
                        errors.push(`Erro ao criar produto: ${productName}`);
                    }
                }
            } catch (error: any) {
                errors.push(`Erro ao processar linha "${line}": ${error.message}`);
            }
        }

        return { success: successCount, errors };
    },

    // Categories
    async getCategories(): Promise<ProductCategory[]> {
        return getOrSetCache('product_categories', async () => {
            if (isSupabaseConfigured() && supabase) {
                const { data, error } = await supabase
                    .from('product_categories')
                    .select('*')
                    .order('name', { ascending: true });

                if (error) {
                    handleSupabaseError('GetCategories', error);
                    return [];
                }

                return (data || []).map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    color: c.color,
                    icon: c.icon,
                    isActive: c.is_active ?? true,
                    createdAt: c.created_at,
                    updatedAt: c.updated_at
                }));
            }
            return [];
        });
    },

    // Units
    async getUnits(): Promise<ProductUnit[]> {
        return getOrSetCache('product_units', async () => {
            if (isSupabaseConfigured() && supabase) {
                const { data, error } = await supabase
                    .from('product_units')
                    .select('*')
                    .order('name', { ascending: true });

                if (error) {
                    handleSupabaseError('GetUnits', error);
                    return [];
                }

                return (data || []).map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    abbreviation: u.abbreviation,
                    description: u.description,
                    isActive: u.is_active ?? true,
                    createdAt: u.created_at,
                    updatedAt: u.updated_at
                }));
            }
            return [];
        });
    },

    // CRUD Categories
    async addCategory(category: Omit<ProductCategory, 'id'>): Promise<ProductCategory | null> {
        if (!isSupabaseConfigured() || !supabase) return null;
        
        const { data, error } = await supabase
            .from('product_categories')
            .insert({
                name: category.name,
                description: category.description,
                color: category.color,
                icon: category.icon,
                is_active: category.isActive ?? true
            })
            .select()
            .single();

        if (error) {
            handleSupabaseError('AddCategory', error);
            return null;
        }

        clearCache('product_categories');
        return {
            id: data.id,
            name: data.name,
            description: data.description,
            color: data.color,
            icon: data.icon,
            isActive: data.is_active ?? true,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };
    },

    async updateCategory(id: string, updates: Partial<ProductCategory>): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase) return false;

        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.color !== undefined) dbUpdates.color = updates.color;
        if (updates.icon !== undefined) dbUpdates.icon = updates.icon;
        if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

        const { error } = await supabase
            .from('product_categories')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            handleSupabaseError('UpdateCategory', error);
            return false;
        }

        clearCache('product_categories');
        return true;
    },

    async deleteCategory(id: string): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase) return false;

        const { error } = await supabase
            .from('product_categories')
            .delete()
            .eq('id', id);

        if (error) {
            handleSupabaseError('DeleteCategory', error);
            return false;
        }

        clearCache('product_categories');
        return true;
    },

    // CRUD Units
    async addUnit(unit: Omit<ProductUnit, 'id'>): Promise<ProductUnit | null> {
        if (!isSupabaseConfigured() || !supabase) return null;
        
        const { data, error } = await supabase
            .from('product_units')
            .insert({
                name: unit.name,
                abbreviation: unit.abbreviation,
                description: unit.description,
                is_active: unit.isActive ?? true
            })
            .select()
            .single();

        if (error) {
            handleSupabaseError('AddUnit', error);
            return null;
        }

        clearCache('product_units');
        return {
            id: data.id,
            name: data.name,
            abbreviation: data.abbreviation,
            description: data.description,
            isActive: data.is_active ?? true,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };
    },

    async updateUnit(id: string, updates: Partial<ProductUnit>): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase) return false;

        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.abbreviation !== undefined) dbUpdates.abbreviation = updates.abbreviation;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

        const { error } = await supabase
            .from('product_units')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            handleSupabaseError('UpdateUnit', error);
            return false;
        }

        clearCache('product_units');
        return true;
    },

    async deleteUnit(id: string): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase) return false;

        const { error } = await supabase
            .from('product_units')
            .delete()
            .eq('id', id);

        if (error) {
            handleSupabaseError('DeleteUnit', error);
            return false;
        }

        clearCache('product_units');
        return true;
    },

    // Variant Templates (stubs - não mais usado mas mantido para compatibilidade)
    async getVariantTemplates(): Promise<VariantTemplate[]> {
        return [];
    },

    async addVariantTemplate(_template: Omit<VariantTemplate, 'id'>): Promise<VariantTemplate | null> {
        return null;
    },

    async updateVariantTemplate(_id: string, _updates: Partial<VariantTemplate>): Promise<boolean> {
        return false;
    },

    async deleteVariantTemplate(_id: string): Promise<boolean> {
        return false;
    }
};
