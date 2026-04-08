/**
 * Serviço para listar lotes de stock (stock_lots).
 * Usado para visualização e rastreabilidade FIFO.
 */
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError } from '../../core/services/serviceUtils';

export interface StockLotRow {
    id: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string;
    unit: string;
    quantity: number;
    unitCost: number;
    totalValue: number;
    sourceType: string;
    sourceId: string | null;
    receivedAt: string;
    /** Dados da compra quando source_type='purchase' */
    invoiceNumber?: string;
    purchaseDate?: string;
    supplierName?: string;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
    purchase: 'Compra',
    adjustment: 'Ajuste',
    manual: 'Manual',
    migration: 'Migração',
    order: 'Encomenda'
};

export const stockLotsService = {
    async getStockLots(filters?: {
        productId?: string;
        variantId?: string | null;
        sourceType?: string;
        minQuantity?: number;
        includeConsumed?: boolean;
    }): Promise<StockLotRow[]> {
        if (!isSupabaseConfigured() || !supabase) return [];
        try {
            let query = supabase
                .from('stock_lots')
                .select('id, product_id, variant_id, quantity, unit_cost, source_type, source_id, received_at')
                .order('received_at', { ascending: true });
            if (!filters?.includeConsumed) {
                query = query.gt('quantity', 0);
            }

            if (filters?.productId) query = query.eq('product_id', filters.productId);
            if (filters?.variantId !== undefined) {
                if (filters.variantId === null) query = query.is('variant_id', null);
                else query = query.eq('variant_id', filters.variantId);
            }
            if (filters?.sourceType) query = query.eq('source_type', filters.sourceType);
            if (filters?.minQuantity != null) query = query.gte('quantity', filters.minQuantity);

            const { data: lots, error } = await query;
            if (error) {
                handleSupabaseError('getStockLots', error);
                return [];
            }
            if (!lots || lots.length === 0) return [];

            const productIds = [...new Set((lots as any[]).map((r: any) => r.product_id))];
            const variantIds = [...new Set((lots as any[]).map((r: any) => r.variant_id).filter(Boolean))];

            const purchaseIds = [...new Set(
                (lots as any[]).filter((r: any) => r.source_type === 'purchase' && r.source_id).map((r: any) => r.source_id)
            )];
            const [productsRes, variantsRes, purchasesRes] = await Promise.all([
                productIds.length ? supabase.from('products').select('id, name, unit').in('id', productIds) : { data: [] },
                variantIds.length ? supabase.from('product_variants').select('id, name, unit, product_id').in('id', variantIds) : { data: [] },
                purchaseIds.length ? supabase.from('purchases').select('id, invoice_number, date, supplier_name').in('id', purchaseIds) : { data: [] }
            ]);
            const productsMap = new Map((productsRes.data || []).map((p: any) => [p.id, p]));
            const variantsMap = new Map((variantsRes.data || []).map((v: any) => [v.id, v]));
            const purchasesMap = new Map((purchasesRes.data || []).map((p: any) => [p.id, p]));

            return (lots as any[]).map((row: any) => {
                const qty = Number(row.quantity) || 0;
                const cost = Number(row.unit_cost) || 0;
                const product = productsMap.get(row.product_id);
                const variant = row.variant_id ? variantsMap.get(row.variant_id) : null;
                const purchase = row.source_type === 'purchase' && row.source_id ? purchasesMap.get(row.source_id) : null;
                return {
                    id: row.id,
                    productId: row.product_id,
                    productName: product?.name ?? '',
                    variantId: row.variant_id,
                    variantName: variant?.name ?? product?.name ?? '',
                    unit: variant?.unit ?? product?.unit ?? 'un',
                    quantity: qty,
                    unitCost: cost,
                    totalValue: qty * cost,
                    sourceType: row.source_type ?? 'manual',
                    sourceId: row.source_id ?? null,
                    receivedAt: row.received_at ?? '',
                    invoiceNumber: purchase?.invoice_number ?? undefined,
                    purchaseDate: purchase?.date ? new Date(purchase.date).toISOString().slice(0, 10) : undefined,
                    supplierName: purchase?.supplier_name ?? undefined
                };
            });
        } catch (e) {
            console.warn('[stockLotsService] getStockLots error:', e);
            return [];
        }
    },

    getSourceTypeLabel(sourceType: string): string {
        return SOURCE_TYPE_LABELS[sourceType] ?? sourceType;
    },

    async updateLot(lotId: string, updates: { quantity?: number; unitCost?: number }): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured() || !supabase) return { success: false, error: 'Supabase não configurado' };
        try {
            const payload: Record<string, unknown> = {};
            if (updates.quantity !== undefined) {
                if (updates.quantity < 0) return { success: false, error: 'Quantidade não pode ser negativa' };
                payload.quantity = updates.quantity;
            }
            if (updates.unitCost !== undefined) {
                if (updates.unitCost < 0) return { success: false, error: 'Custo unitário não pode ser negativo' };
                payload.unit_cost = updates.unitCost;
            }
            if (Object.keys(payload).length === 0) return { success: true };
            const { error } = await supabase.from('stock_lots').update(payload).eq('id', lotId);
            if (error) {
                handleSupabaseError('updateLot', error);
                return { success: false, error: error.message };
            }
            return { success: true };
        } catch (e: any) {
            console.warn('[stockLotsService] updateLot error:', e);
            return { success: false, error: e?.message ?? 'Erro ao actualizar lote' };
        }
    },

    async deleteLot(lotId: string): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured() || !supabase) return { success: false, error: 'Supabase não configurado' };
        try {
            const { error } = await supabase.from('stock_lots').delete().eq('id', lotId);
            if (error) {
                handleSupabaseError('deleteLot', error);
                return { success: false, error: error.message };
            }
            return { success: true };
        } catch (e: any) {
            console.warn('[stockLotsService] deleteLot error:', e);
            return { success: false, error: e?.message ?? 'Erro ao eliminar lote' };
        }
    },

    async deleteLots(lotIds: string[]): Promise<{ deletedCount: number; errors: string[] }> {
        if (!isSupabaseConfigured() || !supabase || lotIds.length === 0) {
            return { deletedCount: 0, errors: [] };
        }
        const errors: string[] = [];
        let deletedCount = 0;
        for (const id of lotIds) {
            const result = await this.deleteLot(id);
            if (result.success) deletedCount++;
            else if (result.error) errors.push(result.error);
        }
        return { deletedCount, errors };
    },

    async setLotsQuantityToZero(lotIds: string[]): Promise<{ updatedCount: number; errors: string[] }> {
        if (!isSupabaseConfigured() || !supabase || lotIds.length === 0) {
            return { updatedCount: 0, errors: [] };
        }
        const errors: string[] = [];
        let updatedCount = 0;
        for (const id of lotIds) {
            const result = await this.updateLot(id, { quantity: 0 });
            if (result.success) updatedCount++;
            else if (result.error) errors.push(result.error);
        }
        return { updatedCount, errors };
    }
};
