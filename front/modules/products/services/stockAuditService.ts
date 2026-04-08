/**
 * Stock Audit Service
 * Gestão de auditorias de stock: registo de contagens físicas e comparação com sistema
 */
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import {
    StockAudit,
    StockAuditItem,
    StockAuditStatus,
    StockAuditScope,
    Product,
    ProductVariant,
    StockAdjustmentReason
} from '../../core/types/types';
import { stockAdjustmentService } from './stockAdjustmentService';
import { stockService } from './stockService';
import { stockReportService } from './stockReportService';

// Helper para mapear linha da BD para StockAudit
function mapRowToAudit(row: any): StockAudit {
    return {
        id: row.id,
        auditDate: row.audit_date,
        description: row.description,
        status: row.status as StockAuditStatus,
        scope: row.scope as StockAuditScope,
        scopeFilter: row.scope_filter,
        createdBy: row.created_by,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        appliedAt: row.applied_at
    };
}

// Helper para mapear linha da BD para StockAuditItem
function mapRowToAuditItem(row: any): StockAuditItem {
    return {
        id: row.id,
        auditId: row.audit_id,
        productId: row.product_id,
        productName: row.product_name,
        variantId: row.variant_id,
        variantName: row.variant_name,
        systemQuantity: parseFloat(row.system_quantity) || 0,
        countedQuantity: row.counted_quantity ? parseFloat(row.counted_quantity) : undefined,
        discrepancy: row.discrepancy ? parseFloat(row.discrepancy) : undefined,
        unit: row.unit,
        costPrice: row.cost_price ? parseFloat(row.cost_price) : undefined,
        notes: row.notes,
        adjustmentReason: row.adjustment_reason as StockAdjustmentReason | undefined,
        adjustmentNotes: row.adjustment_notes,
        approved: row.approved || false,
        adjustmentId: row.adjustment_id || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export const stockAuditService = {

    /**
     * Criar nova auditoria e gerar itens baseados no âmbito
     */
    async createAudit(
        auditDate: string,
        description: string | undefined,
        scope: StockAuditScope,
        scopeFilter: any,
        products: Product[]
    ): Promise<{ audit: StockAudit | null; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { audit: null, error: 'Supabase não configurado' };
        }

        try {
            // 1. Criar auditoria
            const { data: auditData, error: auditError } = await supabase
                .from('stock_audits')
                .insert({
                    audit_date: auditDate,
                    description,
                    status: StockAuditStatus.DRAFT,
                    scope,
                    scope_filter: scopeFilter
                })
                .select()
                .single();

            if (auditError) {
                console.error('[stockAuditService] Erro ao criar auditoria:', auditError);
                return { audit: null, error: auditError.message };
            }

            const audit = mapRowToAudit(auditData);

            // 2. Obter stock na data da auditoria (base para comparação com contagem física)
            const dateNorm = auditDate.includes('T') ? auditDate.split('T')[0] : auditDate;
            const summaryRows = await stockReportService.getStockPeriodSummary(dateNorm, dateNorm);
            const stockAtDateMap = new Map<string, number>();
            for (const row of summaryRows) {
                const key = `${row.productId}|${row.variantId ?? ''}`;
                stockAtDateMap.set(key, row.initialStock);
            }

            // 3. Gerar itens baseados no âmbito com system_quantity = stock na data da auditoria
            const itemsToInsert = await this._generateAuditItems(audit.id, scope, scopeFilter, products, stockAtDateMap);

            if (itemsToInsert.length > 0) {
                const { error: itemsError } = await supabase
                    .from('stock_audit_items')
                    .insert(itemsToInsert);

                if (itemsError) {
                    console.error('[stockAuditService] Erro ao criar itens:', itemsError);
                    // Reverter auditoria se falhar a criar itens
                    await supabase.from('stock_audits').delete().eq('id', audit.id);
                    return { audit: null, error: itemsError.message };
                }
            }

            return { audit };
        } catch (error: any) {
            console.error('[stockAuditService] Erro ao criar auditoria:', error);
            return { audit: null, error: error.message };
        }
    },

    /**
     * Gerar itens de auditoria baseados no âmbito.
     * system_quantity = stock na data da auditoria (stockAtDateMap); se não existir no mapa, usa 0.
     */
    async _generateAuditItems(
        auditId: string,
        scope: StockAuditScope,
        scopeFilter: any,
        products: Product[],
        stockAtDateMap: Map<string, number>
    ): Promise<any[]> {
        let filteredProducts: Product[] = [];

        switch (scope) {
            case StockAuditScope.ALL:
                filteredProducts = products;
                break;
            case StockAuditScope.SELECTED:
                if (scopeFilter?.productIds) {
                    filteredProducts = products.filter(p => scopeFilter.productIds.includes(p.id));
                }
                break;
            case StockAuditScope.CATEGORY:
                if (scopeFilter?.category) {
                    filteredProducts = products.filter(p => p.category === scopeFilter.category);
                }
                break;
        }

        const items: any[] = [];

        for (const product of filteredProducts) {
            if (product.variants && product.variants.length > 0) {
                for (const variant of product.variants) {
                    const key = `${product.id}|${variant.id}`;
                    const systemQty = stockAtDateMap.get(key) ?? 0;
                    items.push({
                        audit_id: auditId,
                        product_id: product.id,
                        product_name: product.name,
                        variant_id: variant.id,
                        variant_name: variant.name,
                        system_quantity: systemQty,
                        counted_quantity: 0,
                        unit: variant.unit || product.unit
                    });
                }
            } else {
                const key = `${product.id}|`;
                const systemQty = stockAtDateMap.get(key) ?? 0;
                items.push({
                    audit_id: auditId,
                    product_id: product.id,
                    product_name: product.name,
                    variant_id: null,
                    variant_name: null,
                    system_quantity: systemQty,
                    counted_quantity: 0,
                    unit: product.unit
                });
            }
        }

        return items;
    },

    /**
     * Listar todas as auditorias
     */
    async getAudits(): Promise<StockAudit[]> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('stock_audits')
                .select('*')
                .order('audit_date', { ascending: false });

            if (error) {
                console.error('[stockAuditService] Erro ao obter auditorias:', error);
                return [];
            }

            return data?.map(mapRowToAudit) || [];
        } catch (error) {
            console.error('[stockAuditService] Erro ao obter auditorias:', error);
            return [];
        }
    },

    /**
     * Obter detalhes de uma auditoria específica
     */
    async getAuditById(auditId: string): Promise<StockAudit | null> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return null;
        }

        try {
            const { data, error } = await supabase
                .from('stock_audits')
                .select('*')
                .eq('id', auditId)
                .single();

            if (error) {
                console.error('[stockAuditService] Erro ao obter auditoria:', error);
                return null;
            }

            return data ? mapRowToAudit(data) : null;
        } catch (error) {
            console.error('[stockAuditService] Erro ao obter auditoria:', error);
            return null;
        }
    },

    /**
     * Obter itens de uma auditoria
     */
    async getAuditItems(auditId: string): Promise<StockAuditItem[]> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('stock_audit_items')
                .select(`
                *,
                products (
                    category,
                    unit,
                    cost_price
                ),
                product_variants (
                    unit,
                    cost_price
                )
            `)
                .eq('audit_id', auditId)
                .order('product_name', { ascending: true });

            if (error) {
                console.error('[stockAuditService] Erro ao obter itens:', error);
                return [];
            }

            return (data || []).map((row: any) => {
                const item = mapRowToAuditItem(row);

                // Fallback for unit if not stored in stock_audit_items (for older reports)
                if (!item.unit) {
                    item.unit = row.product_variants?.unit || row.products?.unit || '-';
                }

                // Fallback for costPrice if not stored in stock_audit_items (for older reports)
                if (!item.costPrice) {
                    item.costPrice = row.product_variants?.cost_price || row.products?.cost_price || 0;
                }

                return {
                    ...item,
                    categoryName: row.products?.category || 'Sem Categoria'
                };
            });
        } catch (error) {
            console.error('[stockAuditService] Erro ao obter itens:', error);
            return [];
        }
    },

    /**
     * Registar contagem física para um item
     */
    async updateAuditItem(
        itemId: string,
        countedQuantity: number,
        notes?: string
    ): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { success: false, error: 'Supabase não configurado' };
        }

        try {
            const { error } = await supabase
                .from('stock_audit_items')
                .update({
                    counted_quantity: countedQuantity,
                    notes
                })
                .eq('id', itemId);

            if (error) {
                console.error('[stockAuditService] Erro ao atualizar item:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            console.error('[stockAuditService] Erro ao atualizar item:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Guardar contagens e notas de vários itens de auditoria de uma vez.
     */
    async updateAuditItemsBatch(
        auditId: string,
        updates: Array<{ itemId: string; countedQuantity: number; notes?: string }>
    ): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { success: false, error: 'Supabase não configurado' };
        }
        if (updates.length === 0) return { success: true };

        try {
            const results = await Promise.all(
                updates.map(({ itemId, countedQuantity, notes }) =>
                    supabase
                        .from('stock_audit_items')
                        .update({ counted_quantity: countedQuantity, notes: notes ?? null })
                        .eq('id', itemId)
                        .eq('audit_id', auditId)
                )
            );
            const failed = results.find(r => r.error);
            if (failed?.error) {
                console.error('[stockAuditService] Erro em updateAuditItemsBatch:', failed.error);
                return { success: false, error: failed.error.message };
            }
            return { success: true };
        } catch (error: any) {
            console.error('[stockAuditService] Erro em updateAuditItemsBatch:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Marcar auditoria como completa
     */
    async completeAudit(auditId: string): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { success: false, error: 'Supabase não configurado' };
        }

        try {
            const { error } = await supabase
                .from('stock_audits')
                .update({
                    status: StockAuditStatus.COMPLETED,
                    completed_at: new Date().toISOString()
                })
                .eq('id', auditId);

            if (error) {
                console.error('[stockAuditService] Erro ao completar auditoria:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            console.error('[stockAuditService] Erro ao completar auditoria:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Aplicar ajustes ao stock baseado nas discrepâncias APROVADAS
     * e salvar snapshot do stock real para relatórios futuros
     */
    async applyAuditAdjustments(
        auditId: string,
        auditDate: string
    ): Promise<{ success: boolean; adjustmentsCreated: number; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { success: false, adjustmentsCreated: 0, error: 'Supabase não configurado' };
        }

        try {
            // 1. Obter apenas itens APROVADOS com discrepâncias
            const items = await this.getAuditItems(auditId);
            const approvedItems = items.filter(
                item => item.approved === true &&
                    item.discrepancy !== undefined &&
                    item.discrepancy !== null &&
                    item.discrepancy !== 0 &&
                    item.adjustmentReason // Must have a reason
            );

            if (approvedItems.length === 0) {
                return {
                    success: false,
                    adjustmentsCreated: 0,
                    error: 'Nenhum item aprovado para ajuste'
                };
            }

            // 2. Criar ajustes apenas para itens aprovados
            let adjustmentsCreated = 0;
            for (const item of approvedItems) {
                const result = await stockAdjustmentService.createAdjustment({
                    productId: item.productId,
                    productName: item.productName,
                    variantId: item.variantId || undefined,
                    variantName: item.variantName || undefined,
                    quantity: item.discrepancy!,
                    reason: item.adjustmentReason!, // Use the specified reason
                    notes: item.adjustmentNotes || `Auditoria: ${item.notes || 'Correção de contagem'}`,
                    date: auditDate
                });

                if (result.adjustment) {
                    adjustmentsCreated++;
                    await supabase
                        .from('stock_audit_items')
                        .update({ adjustment_id: result.adjustment.id })
                        .eq('id', item.id);
                }
            }

            // 3. Marcar auditoria como aplicada
            const { error: updateError } = await supabase
                .from('stock_audits')
                .update({
                    status: StockAuditStatus.APPLIED,
                    applied_at: new Date().toISOString()
                })
                .eq('id', auditId);

            if (updateError) {
                console.error('[stockAuditService] Erro ao marcar auditoria como aplicada:', updateError);
                return {
                    success: false,
                    adjustmentsCreated,
                    error: updateError.message
                };
            }

            // NOTA: Não salvamos snapshot aqui. O snapshot com countedQuantity causava dupla contagem:
            // o get_stock_period_summary usa init = snapshot(d) + movements(d), e o ajuste já está em
            // stock_movements. Ao gravar countedQuantity (valor final) no snapshot, estávamos a somar
            // snapshot + ajuste = valor final + delta = valor errado. Os ajustes em stock_adjustments
            // e stock_movements bastam para o stock bater correctamente.

            return { success: true, adjustmentsCreated };
        } catch (error: any) {
            console.error('[stockAuditService] Erro ao aplicar ajustes:', error);
            return { success: false, adjustmentsCreated: 0, error: error.message };
        }
    },

    /**
     * Atualizar aprovação de um item de auditoria
     */
    async updateAuditItemApproval(
        itemId: string,
        approved: boolean,
        adjustmentReason?: StockAdjustmentReason,
        adjustmentNotes?: string
    ): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { success: false, error: 'Supabase não configurado' };
        }

        try {
            const { error } = await supabase
                .from('stock_audit_items')
                .update({
                    approved,
                    adjustment_reason: adjustmentReason || null,
                    adjustment_notes: adjustmentNotes || null
                })
                .eq('id', itemId);

            if (error) {
                console.error('[stockAuditService] Erro ao atualizar aprovação:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            console.error('[stockAuditService] Erro ao atualizar aprovação:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Reverter auditoria aplicada para "Completa", permitindo aplicar ajustes novamente.
     * Remove os ajustes criados (reverte o stock) e repõe o estado para nova aplicação.
     */
    async revertAuditToCompleted(auditId: string): Promise<{ success: boolean; revertedCount: number; error?: string }> {
        if (!isSupabaseConfigured()) {
            return { success: false, revertedCount: 0, error: 'Supabase não configurado' };
        }

        try {
            const audit = await this.getAuditById(auditId);
            if (!audit) return { success: false, revertedCount: 0, error: 'Auditoria não encontrada' };
            if (audit.status !== StockAuditStatus.APPLIED) {
                return { success: false, revertedCount: 0, error: 'Apenas auditorias aplicadas podem ser revertidas' };
            }

            const items = await this.getAuditItems(auditId);
            const adjustmentIds = items.map(i => i.adjustmentId).filter((id): id is string => !!id);
            if (adjustmentIds.length === 0) {
                // Nenhum ajuste para reverter, apenas repor o estado
            } else {
                const result = await stockAdjustmentService.deleteAdjustments(adjustmentIds);
                if (result.errors.length > 0) {
                    console.warn('[stockAuditService] Alguns ajustes não foram revertidos:', result.errors);
                }
            }

            const { error } = await supabase
                .from('stock_audits')
                .update({
                    status: StockAuditStatus.COMPLETED,
                    applied_at: null
                })
                .eq('id', auditId);

            if (error) {
                console.error('[stockAuditService] Erro ao reverter auditoria:', error);
                return { success: false, revertedCount: 0, error: error.message };
            }

            // Remover snapshot da data da auditoria (se existir) — evitava dupla contagem após bug anterior
            const auditDate = audit.auditDate?.includes('T') ? audit.auditDate.split('T')[0] : audit.auditDate;
            if (auditDate) {
                await supabase.from('stock_initial_snapshot').delete().eq('snapshot_date', auditDate);
            }

            return { success: true, revertedCount: adjustmentIds.length };
        } catch (e: any) {
            console.error('[stockAuditService] Erro ao reverter auditoria:', e);
            return { success: false, revertedCount: 0, error: e.message };
        }
    },

    /**
     * Eliminar auditoria.
     * Por defeito apenas status = 'draft'. Com options.allowAnyStatus = true (ex.: super admin) permite qualquer estado.
     */
    async deleteAudit(auditId: string, options?: { allowAnyStatus?: boolean }): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) {
            console.warn('[stockAuditService] Supabase não configurado');
            return { success: false, error: 'Supabase não configurado' };
        }

        try {
            const audit = await this.getAuditById(auditId);
            if (!audit) {
                return { success: false, error: 'Auditoria não encontrada' };
            }

            if (!options?.allowAnyStatus && audit.status !== StockAuditStatus.DRAFT) {
                return {
                    success: false,
                    error: 'Apenas auditorias em rascunho podem ser eliminadas'
                };
            }

            const { error } = await supabase
                .from('stock_audits')
                .delete()
                .eq('id', auditId);

            if (error) {
                console.error('[stockAuditService] Erro ao eliminar auditoria:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            console.error('[stockAuditService] Erro ao eliminar auditoria:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Obter estatísticas de uma auditoria
     */
    async getAuditStats(auditId: string): Promise<{
        totalItems: number;
        itemsWithDiscrepancy: number;
        totalDiscrepancyValue: number;
        positiveDiscrepancies: number;
        negativeDiscrepancies: number;
    }> {
        const items = await this.getAuditItems(auditId);

        const stats = {
            totalItems: items.length,
            itemsWithDiscrepancy: 0,
            totalDiscrepancyValue: 0,
            positiveDiscrepancies: 0,
            negativeDiscrepancies: 0
        };

        for (const item of items) {
            if (item.discrepancy !== undefined && item.discrepancy !== null && item.discrepancy !== 0) {
                stats.itemsWithDiscrepancy++;
                stats.totalDiscrepancyValue += Math.abs(item.discrepancy);

                if (item.discrepancy > 0) {
                    stats.positiveDiscrepancies++;
                } else {
                    stats.negativeDiscrepancies++;
                }
            }
        }

        return stats;
    }
};
