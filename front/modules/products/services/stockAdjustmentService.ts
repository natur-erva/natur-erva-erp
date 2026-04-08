/**
 * Stock Adjustment Service
 * Gestao de ajustes de stock (estragados, devolucoes, correcoes, perdas, etc.)
 */
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError } from '../../core/services/serviceUtils';
import { getTodayDateString } from '../../core/utils/dateUtils';
import { AdjustmentLine, StockAdjustment, StockAdjustmentReason, StockItem, StockMovement, StockTransactionSource } from '../../core/types/types';
import { stockService } from './stockService';

// Labels para os motivos de ajuste (para UI)
export const ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
    [StockAdjustmentReason.DAMAGED]: 'Produto Estragado',
    [StockAdjustmentReason.RETURN]: 'Devolução de Cliente',
    [StockAdjustmentReason.CORRECTION]: 'Correção de Contagem',
    [StockAdjustmentReason.LOSS]: 'Perda/Roubo',
    [StockAdjustmentReason.PRODUCTION]: 'Produção Interna',
    [StockAdjustmentReason.EXPIRED]: 'Produto Expirado',
    [StockAdjustmentReason.OTHER]: 'Outro Motivo'
};

function mapRowToAdjustment(row: any): StockAdjustment {
    return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        variantId: row.variant_id ?? undefined,
        variantName: row.variant_name ?? undefined,
        quantity: Number(row.quantity) || 0,
        reason: row.reason as StockAdjustmentReason,
        notes: row.notes ?? undefined,
        date: row.date,
        createdBy: row.created_by ?? undefined,
        createdAt: row.created_at
    };
}

export const stockAdjustmentService = {
    /**
     * Obter todos os ajustes de stock
     */
    async getAdjustments(): Promise<StockAdjustment[]> {
        if (!isSupabaseConfigured() || !supabase) return [];
        try {
            const { data, error } = await supabase
                .from('stock_adjustments')
                .select('*')
                .order('date', { ascending: false });
            
            if (error) {
                // Tabela pode nao existir ainda
                if (error.code === '42P01') {
                    console.warn('[stockAdjustmentService] Tabela stock_adjustments não existe');
                    return [];
                }
                if (handleSupabaseError('getAdjustments', error)) return [];
                throw error;
            }
            return (data || []).map(mapRowToAdjustment);
        } catch (e: any) {
            console.error('[stockAdjustmentService] getAdjustments:', e);
            return [];
        }
    },

    /**
     * Obter ajustes por produto
     */
    async getAdjustmentsByProduct(productId: string): Promise<StockAdjustment[]> {
        if (!isSupabaseConfigured() || !supabase || !productId) return [];
        try {
            const { data, error } = await supabase
                .from('stock_adjustments')
                .select('*')
                .eq('product_id', productId)
                .order('date', { ascending: false });
            
            if (error) {
                if (error.code === '42P01') return [];
                if (handleSupabaseError('getAdjustmentsByProduct', error)) return [];
                throw error;
            }
            return (data || []).map(mapRowToAdjustment);
        } catch (e: any) {
            console.error('[stockAdjustmentService] getAdjustmentsByProduct:', e);
            return [];
        }
    },

    /**
     * Criar um ajuste de stock
     * - Cria registo na tabela stock_adjustments
     * - Actualiza stock na variante do produto
     * - Cria transacao de stock
     * - Cria movimento de stock
     */
    async createAdjustment(adjustment: Omit<StockAdjustment, 'id' | 'createdAt'>): Promise<{ adjustment: StockAdjustment | null; error?: string }> {
        if (!isSupabaseConfigured() || !supabase) {
            return { adjustment: null, error: 'Base de dados não configurada' };
        }

        try {
            const now = new Date().toISOString();
            const quantity = Number(adjustment.quantity) || 0;
            
            if (quantity === 0) {
                return { adjustment: null, error: 'Quantidade não pode ser zero' };
            }

            const adjustmentDate = adjustment.date || getTodayDateString();

            // ── Consolidação: verificar se já existe ajuste para o mesmo produto+variante+dia+motivo ──
            try {
                let findQuery = supabase
                    .from('stock_adjustments')
                    .select('id, quantity')
                    .eq('product_id', adjustment.productId)
                    .eq('date', adjustmentDate)
                    .eq('reason', adjustment.reason)
                    .limit(1);
                if (adjustment.variantId) {
                    findQuery = findQuery.eq('variant_id', adjustment.variantId);
                } else {
                    findQuery = findQuery.is('variant_id', null);
                }
                const { data: existing, error: findError } = await findQuery.maybeSingle();

                if (!findError && existing) {
                    // Já existe: actualizar quantidade (somar)
                    const mergedQty = Number(existing.quantity) + quantity;
                    if (mergedQty === 0) {
                        // Quantidades anulam-se: apagar o ajuste existente
                        const delResult = await this.deleteAdjustment(existing.id);
                        if (delResult.success) {
                            console.log(`[stockAdjustmentService] ✓ Ajuste ${existing.id} anulado (soma = 0), eliminado`);
                            // Retornar um objecto "virtual" para sinalizar sucesso
                            return { adjustment: { id: existing.id, productId: adjustment.productId, productName: adjustment.productName, variantId: adjustment.variantId, variantName: adjustment.variantName, quantity: 0, reason: adjustment.reason, notes: adjustment.notes, date: adjustmentDate, createdBy: adjustment.createdBy, createdAt: now } };
                        }
                    } else {
                        // Actualizar o existente com a nova quantidade total
                        const updateResult = await this.updateAdjustment(existing.id, {
                            quantity: mergedQty,
                            reason: adjustment.reason,
                            notes: adjustment.notes,
                            date: adjustmentDate
                        });
                        if (updateResult.success) {
                            console.log(`[stockAdjustmentService] ✓ Ajuste consolidado: ${existing.id}, qty: ${Number(existing.quantity)} → ${mergedQty}`);
                            return { adjustment: { id: existing.id, productId: adjustment.productId, productName: adjustment.productName, variantId: adjustment.variantId, variantName: adjustment.variantName, quantity: mergedQty, reason: adjustment.reason, notes: adjustment.notes, date: adjustmentDate, createdBy: adjustment.createdBy, createdAt: now } };
                        }
                        // Se updateAdjustment falhou, cair para criação normal abaixo
                    }
                }
            } catch (findErr) {
                // Se falhar a busca (ex: tabela não existe), prosseguir com criação normal
                console.warn('[stockAdjustmentService] Consolidation lookup failed, creating new:', findErr);
            }

            // ── Criação normal (nenhum ajuste existente encontrado) ──
            // 1. Criar registo na tabela stock_adjustments
            const row = {
                product_id: adjustment.productId,
                product_name: adjustment.productName,
                variant_id: adjustment.variantId || null,
                variant_name: adjustment.variantName || null,
                quantity: quantity,
                reason: adjustment.reason,
                notes: adjustment.notes || null,
                date: adjustmentDate,
                created_by: adjustment.createdBy || null,
                created_at: now
            };

            const { data, error } = await supabase
                .from('stock_adjustments')
                .insert(row)
                .select()
                .single();

            if (error) {
                // Se tabela nao existe, prosseguir sem gravar ajuste mas fazer o resto
                if (error.code === '42P01') {
                    console.warn('[stockAdjustmentService] Tabela stock_adjustments não existe, criando movimento sem registo de ajuste');
                } else {
                    console.error('[stockAdjustmentService] createAdjustment insert error:', error);
                    return { adjustment: null, error: error.message };
                }
            }

            const adjustmentId = data?.id || `temp-${Date.now()}`;
            const reasonLabel = ADJUSTMENT_REASON_LABELS[adjustment.reason] || adjustment.reason;

            // 2. Criar movimento de stock (processStockMovementItems aplica stock e cria transações)
            const stockItem: StockItem = {
                productId: adjustment.productId,
                productName: adjustment.productName,
                variantId: adjustment.variantId,
                variant: adjustment.variantName,
                quantity: quantity, // mantém sinal
                unit: 'un'
            };

            const movementNotes = adjustment.notes 
                ? `Ajuste: ${reasonLabel} - ${adjustment.notes}`
                : `Ajuste de stock: ${reasonLabel}`;

            const stockMovement: StockMovement = {
                id: '',
                date: adjustmentDate,
                items: [stockItem],
                notes: movementNotes,
                sourceReference: { type: StockTransactionSource.ADJUSTMENT, id: adjustmentId },
                createdAt: now
            };

            await stockService.ensureStockMovement(stockMovement);

            const createdAdjustment: StockAdjustment = {
                id: adjustmentId,
                productId: adjustment.productId,
                productName: adjustment.productName,
                variantId: adjustment.variantId,
                variantName: adjustment.variantName,
                quantity: quantity,
                reason: adjustment.reason,
                notes: adjustment.notes,
                date: adjustmentDate,
                createdBy: adjustment.createdBy,
                createdAt: now
            };

            console.log(`[stockAdjustmentService] ✓ Ajuste criado: ${reasonLabel}, qty: ${quantity}`);
            return { adjustment: createdAdjustment };

        } catch (e: any) {
            console.error('[stockAdjustmentService] createAdjustment:', e);
            return { adjustment: null, error: e.message || 'Erro ao criar ajuste' };
        }
    },

    /**
     * Criar vários ajustes em lote (mesmo motivo, data e notas).
     * Aplica quantidade com sinal conforme isEntry (entrada = positivo, saída = negativo).
     */
    async createBatchAdjustments(
        lines: AdjustmentLine[],
        common: { reason: StockAdjustmentReason; date: string; notes?: string; createdBy?: string; isEntry: boolean }
    ): Promise<{ created: number; failed: number; errors: string[] }> {
        const result = { created: 0, failed: 0, errors: [] as string[] };
        if (!lines.length) return result;

        const sign = common.isEntry ? 1 : -1;
        for (const line of lines) {
            const qty = Number(line.quantity) || 0;
            if (qty <= 0) {
                result.failed++;
                result.errors.push(`${line.productName || line.productId}${line.variantName ? ` (${line.variantName})` : ''}: quantidade inválida`);
                continue;
            }
            const res = await this.createAdjustment({
                productId: line.productId,
                productName: line.productName,
                variantId: line.variantId,
                variantName: line.variantName,
                quantity: sign * Math.abs(qty),
                reason: common.reason,
                notes: common.notes,
                date: common.date,
                createdBy: common.createdBy
            });
            if (res.adjustment) result.created++;
            else {
                result.failed++;
                if (res.error) result.errors.push(`${line.productName || line.productId}: ${res.error}`);
            }
        }
        return result;
    },

    /**
     * Eliminar um ajuste de stock
     * - Remove registo da tabela
     * - Reverte stock
     * - Remove transacao e movimento
     */
    async deleteAdjustment(adjustmentId: string): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured() || !supabase || !adjustmentId) {
            return { success: false, error: 'Parâmetros inválidos' };
        }

        try {
            // 1. Buscar ajuste para saber quantidade a reverter
            const { data: adjustment, error: fetchError } = await supabase
                .from('stock_adjustments')
                .select('*')
                .eq('id', adjustmentId)
                .single();

            if (fetchError) {
                if (fetchError.code === '42P01') {
                    // Tabela nao existe, tentar limpar apenas transacoes e movimentos
                    await this._cleanupStockRecords(adjustmentId);
                    return { success: true };
                }
                return { success: false, error: 'Ajuste não encontrado' };
            }

            if (adjustment) {
                // 2. Remover transacoes e movimentos (deleteStockMovement reverte o stock)
                await this._cleanupStockRecords(adjustmentId);

                // 3. Limpar estado "aplicado" nos itens de auditoria ligados a este ajuste
                await supabase
                    .from('stock_audit_items')
                    .update({
                        adjustment_id: null,
                        approved: false,
                        adjustment_reason: null,
                        adjustment_notes: null
                    })
                    .eq('adjustment_id', adjustmentId);

                // 4. Remover registo do ajuste
                await supabase
                    .from('stock_adjustments')
                    .delete()
                    .eq('id', adjustmentId);
            }

            return { success: true };
        } catch (e: any) {
            console.error('[stockAdjustmentService] deleteAdjustment:', e);
            return { success: false, error: e.message || 'Erro ao eliminar ajuste' };
        }
    },

    /**
     * Eliminar vários ajustes de stock em sequência.
     * Devolve número de eliminados e lista de erros por id.
     */
    async deleteAdjustments(ids: string[]): Promise<{ deletedCount: number; errors: { id: string; error: string }[] }> {
        const errors: { id: string; error: string }[] = [];
        let deletedCount = 0;
        for (const id of ids) {
            const result = await this.deleteAdjustment(id);
            if (result.success) {
                deletedCount++;
            } else {
                errors.push({ id, error: result.error || 'Erro desconhecido' });
            }
        }
        return { deletedCount, errors };
    },

    /**
     * Atualizar um ajuste de stock (quantidade, motivo, notas, data).
     * Reverte o efeito anterior em stock, limpa transações/movimentos, atualiza o registo e reaplica o novo valor.
     */
    async updateAdjustment(
        adjustmentId: string,
        payload: { quantity: number; reason: StockAdjustmentReason; notes?: string; date: string }
    ): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured() || !supabase || !adjustmentId) {
            return { success: false, error: 'Parâmetros inválidos' };
        }

        const newQuantity = Number(payload.quantity) || 0;
        if (newQuantity === 0) {
            return { success: false, error: 'Quantidade não pode ser zero' };
        }

        try {
            const { data: adjustment, error: fetchError } = await supabase
                .from('stock_adjustments')
                .select('*')
                .eq('id', adjustmentId)
                .single();

            if (fetchError || !adjustment) {
                return { success: false, error: 'Ajuste não encontrado' };
            }

            // 1. Limpar transações e movimentos (deleteStockMovement reverte o stock anterior)
            await this._cleanupStockRecords(adjustmentId);

            // 2. Atualizar linha em stock_adjustments
            const { error: updateError } = await supabase
                .from('stock_adjustments')
                .update({
                    quantity: newQuantity,
                    reason: payload.reason,
                    notes: payload.notes ?? null,
                    date: payload.date
                })
                .eq('id', adjustmentId);

            if (updateError) {
                console.error('[stockAdjustmentService] updateAdjustment update row:', updateError);
                return { success: false, error: updateError.message };
            }

            // 3. Criar movimento de stock (processStockMovementItems aplica stock e cria transações)
            const reasonLabel = ADJUSTMENT_REASON_LABELS[payload.reason] || payload.reason;
            const stockItem: StockItem = {
                productId: adjustment.product_id,
                productName: adjustment.product_name,
                variantId: adjustment.variant_id ?? undefined,
                variant: adjustment.variant_name,
                quantity: newQuantity,
                unit: 'un'
            };

            const movementNotes = payload.notes
                ? `Ajuste: ${reasonLabel} - ${payload.notes}`
                : `Ajuste de stock: ${reasonLabel}`;

            const stockMovement: StockMovement = {
                id: '',
                date: payload.date,
                items: [stockItem],
                notes: movementNotes,
                sourceReference: { type: StockTransactionSource.ADJUSTMENT, id: adjustmentId },
                createdAt: new Date().toISOString()
            };

            await stockService.ensureStockMovement(stockMovement);

            return { success: true };
        } catch (e: any) {
            console.error('[stockAdjustmentService] updateAdjustment:', e);
            return { success: false, error: e.message || 'Erro ao atualizar ajuste' };
        }
    },

    /**
     * Helper para limpar transacoes e movimentos de um ajuste
     */
    async _cleanupStockRecords(adjustmentId: string): Promise<void> {
        if (!supabase) return;

        // Remover transacoes
        try {
            await supabase
                .from('stock_transactions')
                .delete()
                .eq('source_id', adjustmentId)
                .eq('source_type', 'adjustment');
        } catch (e) {
            console.warn('[stockAdjustmentService] Erro ao remover transações:', e);
        }

        // Remover movimentos
        try {
            const movements = await stockService.getStockMovements();
            const adjustmentMovements = movements.filter(m =>
                m.sourceReference?.type === StockTransactionSource.ADJUSTMENT &&
                m.sourceReference?.id === adjustmentId
            );
            for (const m of adjustmentMovements) {
                await stockService.deleteStockMovement(m.id);
            }
        } catch (e) {
            console.warn('[stockAdjustmentService] Erro ao remover movimentos:', e);
        }
    },

    /**
     * Obter estatisticas de ajustes por razao
     */
    async getAdjustmentStats(fromDate?: string, toDate?: string): Promise<{
        byReason: Record<StockAdjustmentReason, { count: number; totalQuantity: number }>;
        total: { count: number; entries: number; exits: number };
    }> {
        const stats = {
            byReason: {} as Record<StockAdjustmentReason, { count: number; totalQuantity: number }>,
            total: { count: 0, entries: 0, exits: 0 }
        };

        // Inicializar todas as razoes
        for (const reason of Object.values(StockAdjustmentReason)) {
            stats.byReason[reason] = { count: 0, totalQuantity: 0 };
        }

        const adjustments = await this.getAdjustments();
        
        for (const adj of adjustments) {
            // Filtrar por data se especificado
            if (fromDate && adj.date < fromDate) continue;
            if (toDate && adj.date > toDate) continue;

            stats.total.count++;
            if (adj.quantity > 0) {
                stats.total.entries += adj.quantity;
            } else {
                stats.total.exits += Math.abs(adj.quantity);
            }

            if (stats.byReason[adj.reason]) {
                stats.byReason[adj.reason].count++;
                stats.byReason[adj.reason].totalQuantity += adj.quantity;
            }
        }

        return stats;
    }
};
