/**
 * Serviço de relatórios de stock - usa função SQL get_stock_period_summary.
 * Fonte de verdade: stock_movements, stock_initial_snapshot, stock_adjustments.
 */
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError } from '../../core/services/serviceUtils';

export interface StockPeriodSummaryRow {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  unit: string;
  initialStock: number;
  purchases: number;
  sales: number;
  adjustments: number;
  finalStock: number;
  initialValue: number;
  purchasesValue: number;
  salesValue: number;
  finalValue: number;
  costPrice: number;
  profit: number; // salesValue (receita) - costOfSales; na BD usa custo, profit≈0 até enriquecer
}

export const stockReportService = {
  /**
   * Obtém resumo de stock por período via RPC.
   * Regras: stock inicial = snapshot ou movimentos antes do período;
   * compras/vendas = stock_movements tipo purchase/order no período.
   */
  async getStockPeriodSummary(
    startDate: string,
    endDate: string,
    snapshotDate?: string | null,
    includeZeroStock?: boolean
  ): Promise<StockPeriodSummaryRow[]> {
    if (!isSupabaseConfigured() || !supabase) return [];
    try {
      const { data, error } = await supabase.rpc('get_stock_period_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_snapshot_date: snapshotDate || null,
        p_include_zero_stock: includeZeroStock !== false
      });
      if (error) {
        handleSupabaseError('getStockPeriodSummary', error);
        return [];
      }
      return (data || []).map((row: Record<string, unknown>) => ({
        productId: String(row.product_id ?? ''),
        productName: String(row.product_name ?? ''),
        variantId: row.variant_id ? String(row.variant_id) : undefined,
        variantName: row.variant_name ? String(row.variant_name) : undefined,
        unit: String(row.unit ?? 'un'),
        initialStock: Number(row.initial_qty ?? 0),
        purchases: Number(row.purchases_qty ?? 0),
        sales: Number(row.sales_qty ?? 0),
        adjustments: Number(row.adjustments_qty ?? 0),
        finalStock: Number(row.final_qty ?? 0),
        initialValue: Number(row.initial_value ?? 0),
        purchasesValue: Number(row.purchases_value ?? 0),
        salesValue: Number(row.sales_value ?? 0),
        finalValue: Number(row.final_value ?? 0),
        costPrice: Number(row.cost_price ?? 0),
        profit: 0 // BD retorna valores a custo; profit pode ser enriquecido depois com orders
      }));
    } catch (e) {
      console.warn('[stockReportService] getStockPeriodSummary error:', e);
      return [];
    }
  },

  /**
   * Stock actual calculado até hoje (mesma fonte que o relatório).
   * Período hoje–hoje; usa snapshot opcional para alinhar com Gestão de Stock.
   */
  async getCurrentStockSummary(snapshotDate?: string | null): Promise<StockPeriodSummaryRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    return this.getStockPeriodSummary(today, today, snapshotDate ?? null);
  }
};
