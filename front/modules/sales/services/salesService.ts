import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError, isUuid } from '../../core/services/serviceUtils';
import { Sale, SaleItem } from '../../core/types/types';
import { getTodayDateString } from '../../core/utils/dateUtils';

function mapRowToSale(row: any): Sale {
  const items: SaleItem[] = Array.isArray(row.items) ? row.items.map((it: any) => ({
    id: it.id || `item-${Math.random().toString(36).slice(2, 9)}`,
    productId: it.productId ?? it.product_id ?? '',
    productName: it.productName ?? it.product_name ?? '',
    variantId: it.variantId ?? it.variant_id,
    variantName: it.variantName ?? it.variant_name,
    quantity: Number(it.quantity) || 0,
    price: Number(it.price) || 0,
    unit: it.unit,
    total: it.total != null ? Number(it.total) : undefined
  })) : [];
  return {
    id: row.id,
    date: row.date ? (typeof row.date === 'string' ? row.date.split('T')[0] : row.date) : undefined,
    items,
    totalSales: row.total_sales != null ? Number(row.total_sales) : 0,
    totalDeliveries: row.total_deliveries != null ? Number(row.total_deliveries) : 0,
    valueReceived: row.value_received != null ? Number(row.value_received) : undefined,
    difference: row.difference != null ? Number(row.difference) : undefined,
    notes: row.notes ?? undefined,
    saleType: row.sale_type ?? undefined,
    createdAt: row.created_at || new Date().toISOString(),
    locationId: row.location_id ?? undefined
  };
}

function saleToRow(sale: Sale): Record<string, unknown> {
  return {
    date: sale.date || getTodayDateString(),
    total_sales: sale.totalSales ?? 0,
    total_deliveries: sale.totalDeliveries ?? 0,
    value_received: sale.valueReceived ?? null,
    difference: sale.difference ?? null,
    notes: sale.notes ?? null,
    items: (sale.items || []).map(it => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      variantId: it.variantId,
      variantName: it.variantName,
      quantity: it.quantity,
      price: it.price,
      unit: it.unit,
      total: (it as SaleItem).total
    })),
    sale_type: sale.saleType ?? null,
    location_id: sale.locationId ?? null
  };
}

export const salesService = {
  async getSales(): Promise<Sale[]> {
    if (!isSupabaseConfigured() || !supabase) return [];
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('date', { ascending: false });
      if (error) {
        if (handleSupabaseError('getSales', error)) return [];
        throw error;
      }
      return (data || []).map(mapRowToSale);
    } catch (e: any) {
      console.error('[salesService] getSales:', e);
      return [];
    }
  },

  async getSalesCount(): Promise<number> {
    if (!isSupabaseConfigured() || !supabase) return 0;
    try {
      const { count, error } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });
      if (error) {
        if (handleSupabaseError('getSalesCount', error)) return 0;
        return 0;
      }
      return count ?? 0;
    } catch (e: any) {
      console.error('[salesService] getSalesCount:', e);
      return 0;
    }
  },

  async getSaleByDate(date: string): Promise<Sale | null> {
    if (!isSupabaseConfigured() || !supabase || !date) return null;
    const dateOnly = date.split('T')[0];
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('date', dateOnly)
        .order('created_at', { ascending: true })
        .limit(1);
      if (error) {
        if (handleSupabaseError('getSaleByDate', error)) return null;
        throw error;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapRowToSale(row) : null;
    } catch (e: any) {
      console.error('[salesService] getSaleByDate:', e);
      return null;
    }
  },

  async createSale(sale: Sale): Promise<{ sale: Sale | null }> {
    if (!isSupabaseConfigured() || !supabase) return { sale: null };
    try {
      const row = saleToRow(sale);
      const { data, error } = await supabase
        .from('sales')
        .insert(row)
        .select()
        .single();
      if (error) {
        if (handleSupabaseError('createSale', error)) return { sale: null };
        console.error('[salesService] createSale:', error);
        return { sale: null };
      }
      return { sale: data ? mapRowToSale(data) : null };
    } catch (e: any) {
      console.error('[salesService] createSale:', e);
      return { sale: null };
    }
  },

  async updateSale(id: string, updates: Partial<Sale>): Promise<boolean> {
    if (!isUuid(id) && !id) return false;
    if (!isSupabaseConfigured() || !supabase) return false;
    try {
      const row: Record<string, unknown> = {};
      if (updates.date !== undefined) row.date = updates.date.split?.('T')[0] ?? updates.date;
      if (updates.totalSales !== undefined) row.total_sales = updates.totalSales;
      if (updates.totalDeliveries !== undefined) row.total_deliveries = updates.totalDeliveries;
      if (updates.valueReceived !== undefined) row.value_received = updates.valueReceived;
      if (updates.difference !== undefined) row.difference = updates.difference;
      if (updates.notes !== undefined) row.notes = updates.notes;
      if (updates.saleType !== undefined) row.sale_type = updates.saleType;
      if (updates.items !== undefined) {
        row.items = updates.items.map(it => ({
          id: it.id,
          productId: it.productId,
          productName: it.productName,
          variantId: it.variantId,
          variantName: it.variantName,
          quantity: it.quantity,
          price: it.price,
          unit: it.unit,
          total: (it as SaleItem).total
        }));
      }
      if (Object.keys(row).length === 0) return true;
      const { error } = await supabase.from('sales').update(row).eq('id', id);
      if (error) {
        if (handleSupabaseError('updateSale', error)) return false;
        return false;
      }
      return true;
    } catch (e: any) {
      console.error('[salesService] updateSale:', e);
      return false;
    }
  },

  async deleteSale(id: string): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) return true;
    if (!id) return true;
    try {
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) {
        if (handleSupabaseError('deleteSale', error)) return true;
        return false;
      }
      return true;
    } catch (e: any) {
      console.error('[salesService] deleteSale:', e);
      return false;
    }
  },

  async deleteSales(ids: string[]): Promise<{ success: boolean; deleted?: number; errors?: string[] }> {
    const validIds = ids.filter(id => id && (isUuid(id) || id.length > 0));
    if (!isSupabaseConfigured() || !supabase || validIds.length === 0) {
      return { success: true, deleted: 0, errors: [] };
    }
    try {
      const { error } = await supabase.from('sales').delete().in('id', validIds);
      if (error) {
        if (handleSupabaseError('deleteSales', error)) return { success: true, deleted: 0, errors: [] };
        return { success: false, errors: [error.message] };
      }
      return { success: true, deleted: validIds.length, errors: [] };
    } catch (e: any) {
      console.error('[salesService] deleteSales:', e);
      return { success: false, errors: [e?.message || 'Erro desconhecido'] };
    }
  }
};
