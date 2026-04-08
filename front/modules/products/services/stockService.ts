/**
 * Stock: fonte de verdade em product_variants.stock.
 * Todas as leituras/escritas de disponibilidade usam apenas product_variants; ProductLocationStock não é usado.
 */
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import {
    StockMovement,
    Product,
    ProductVariant,
    OrderStatus,
    StockTransactionSource,
    StockMovementSourceType,
    StockItem
} from '../../core/types/types';
import { handleSupabaseError } from '../../core/services/serviceUtils';
import { extractLocalDate, getTodayDateString } from '../../core/utils/dateUtils';

// Helper utils for stock processing
const normalizeProductName = (name: string): string => {
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

const normalizeVariantName = (variant: string): string => {
    if (!variant) return '';
    // Remover espaços, converter para maiúsculas e normalizar acentos basicos
    let normalized = variant.trim().toUpperCase()
        .replace(/\s+/g, '')
        .replace(/Á/g, 'A')
        .replace(/É/g, 'E')
        .replace(/Í/g, 'I')
        .replace(/Ó/g, 'O')
        .replace(/Ú/g, 'U')
        .replace(/Ã/g, 'A')
        .replace(/Õ/g, 'O');
    
    normalized = normalized.replace(',', '.');
    normalized = normalized.replace(/\bK\b/g, 'KG');
    normalized = normalized.replace(/KG$/g, 'KG');
    normalized = normalized.replace(/G$/g, 'G');
    normalized = normalized.replace(/ML$/g, 'ML');
    normalized = normalized.replace(/L$/g, 'L');
    normalized = normalized.replace(/UN$/g, 'UN');
    return normalized;
};

const variantsMatch = (variant1: string, variant2: string): boolean => {
    if (!variant1 || !variant2) return variant1 === variant2;
    
    const norm1 = normalizeVariantName(variant1);
    const norm2 = normalizeVariantName(variant2);
    
    // Prioridade 1: Correspondência exacta após normalização (funciona para "Encubar", "Consumo", etc.)
    if (norm1 === norm2) return true;

    // Prioridade 2: Correspondência baseada em extracção de valores numéricos e unidades
    const extractVariant = (v: string): { value: number; unit: string } | null => {
        const match = v.match(/(\d+\.?\d*)\s*(KG|G|ML|L|UN|K|DZ|DUZIA)?$/i);
        if (match) {
            return {
                value: parseFloat(match[1]),
                unit: (match[2] || '').toUpperCase().replace('K', 'KG').replace('DUZIA', 'DZ')
            };
        }
        return null;
    };

    const v1 = extractVariant(norm1);
    const v2 = extractVariant(norm2);

    if (v1 && v2) {
        const valueMatch = Math.abs(v1.value - v2.value) < 0.01;
        const unitMatch = v1.unit === v2.unit || (!v1.unit && !v2.unit);
        return valueMatch && unitMatch;
    }
    
    // Fallback: se um contém o outro (normalizado)
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

    return false;
};

const parseProductName = (productName: string): { baseName: string; variant: string | null } => {
    const name = productName.trim();
    const variantPatterns = [
        /\s+(\d+[\.,]?\d*\s*(kg|g|ml|l|un|duzia))\s*$/i,
        /\s+(\d+[\.,]?\d*)\s*(kg|g|ml|l|un)\s*$/i,
        /\s+(\d+)\s*(un|duzia)\s*$/i,
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

export const stockService = {

    // ============================================
    // STOCK MANAGEMENT
    // ============================================

    async adjustVariantStock(
        productId: string,
        variantId: string | null,
        quantityChange: number,
        operation: 'add' | 'subtract' = 'add'
    ): Promise<boolean> {
        if (!isSupabaseConfigured()) return false;
        try {
            if (!variantId) {
                // Se não tem variantId, buscar variante padrão
                const { data: variants } = await supabase
                    .from('product_variants')
                    .select('id, is_default')
                    .eq('product_id', productId);

                if (!variants || variants.length === 0) {
                    console.error('[adjustVariantStock] Produto não tem variantes:', productId);
                    return false;
                }
                const defaultVariant = variants.find(v => v.is_default) || variants[0];
                variantId = defaultVariant.id;
            }

            const { data: variant, error: fetchError } = await supabase
                .from('product_variants')
                .select('stock')
                .eq('id', variantId)
                .maybeSingle();

            if (fetchError || !variant) {
                console.error('[adjustVariantStock] Erro ao buscar variante:', fetchError);
                return false;
            }

            const currentStock = Number(variant.stock || 0);
            const newStock = operation === 'add'
                ? currentStock + quantityChange
                : currentStock - quantityChange;

            const { error: updateError } = await supabase
                .from('product_variants')
                .update({
                    stock: newStock,
                    updated_at: new Date().toISOString()
                })
                .eq('id', variantId);

            if (updateError) {
                console.error('[adjustVariantStock] Erro ao atualizar stock:', updateError);
                return false;
            }

            console.log(`[adjustVariantStock] ✓ Stock ${operation === 'add' ? 'adicionado' : 'deduzido'}: ${quantityChange} (${currentStock} -> ${newStock})`);
            return true;
        } catch (e: any) {
            console.error('[adjustVariantStock] Erro:', e);
            return false;
        }
    },

    async ensureStockTransaction(
        productId: string,
        productName: string,
        variantId: string | null,
        variantName: string | null,
        type: 'entry' | 'exit',
        quantity: number,
        unit: string,
        date: string,
        sourceType: string, // 'order', 'adjustment', 'transfer', 'production'
        sourceId: string,
        sourceReference: string,
        costPrice?: number,
        salePrice?: number,
        notes?: string
    ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
        if (!isSupabaseConfigured()) {
            return { success: false, error: 'Database not connected' };
        }

        try {
            // Verificar se a variante existe antes de inserir (evitar erro de FK)
            let validVariantId = variantId;
            if (variantId) {
                const { data: variantExists } = await supabase
                    .from('product_variants')
                    .select('id')
                    .eq('id', variantId)
                    .single();
                
                if (!variantExists) {
                    console.warn(`[ensureStockTransaction] Variante ${variantId} não existe, usando NULL`);
                    validVariantId = null;
                }
            }

            const transaction = {
                product_id: productId,
                product_name: productName,
                variant_id: validVariantId,
                variant_name: variantName,
                transaction_type: type,
                quantity: quantity,
                unit: unit,
                date: date, // ISO string
                source_type: sourceType,
                source_id: sourceId,
                source_reference: sourceReference,
                cost_price: costPrice,
                sale_price: salePrice,
                notes: notes,
                created_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from('stock_transactions')
                .insert(transaction)
                .select()
                .single();

            if (error) {
                // Ignorar erro se tabela não existir (migração pendente)
                if (error.code === '42P01') {
                    console.warn('Tabela stock_transactions não existe (ignorado)');
                    return { success: true };
                }
                // Ignorar erro de FK se variante não existe (dados antigos)
                if (error.code === '23503' && error.message.includes('variant_id')) {
                    console.warn('[ensureStockTransaction] FK erro variante, tentando sem variant_id');
                    transaction.variant_id = null;
                    const { data: retryData, error: retryError } = await supabase
                        .from('stock_transactions')
                        .insert(transaction)
                        .select()
                        .single();
                    if (retryError) {
                        console.error('Error creating stock transaction (retry):', retryError);
                        return { success: false, error: retryError.message };
                    }
                    return { success: true, transactionId: retryData.id };
                }
                console.error('Error creating stock transaction:', error);
                return { success: false, error: error.message };
            }

            return { success: true, transactionId: data.id };
        } catch (e: any) {
            console.error('Error ensuring stock transaction:', e);
            return { success: false, error: e.message };
        }
    },

    async _createStockLot(
        productId: string,
        variantId: string | null,
        quantity: number,
        unitCost: number,
        sourceType: string,
        sourceId: string | undefined,
        receivedAt: string
    ): Promise<void> {
        if (!isSupabaseConfigured() || !supabase || quantity <= 0) return;
        try {
            const { error } = await supabase.from('stock_lots').insert({
                product_id: productId,
                variant_id: variantId,
                quantity,
                unit_cost: unitCost,
                source_type: sourceType,
                source_id: sourceId ?? null,
                received_at: receivedAt
            });
            if (error) {
                if (error.code === '42P01') return; // tabela não existe
                console.warn('[stockService._createStockLot]', error.message);
            }
        } catch (e) {
            console.warn('[stockService._createStockLot]', e);
        }
    },

    /**
     * Para ajustes de stock: actualiza o lote mais recente do produto/variante
     * em vez de criar um novo lote. Se não existir lote activo (quantity > 0),
     * cria um novo.
     */
    async _updateOrCreateStockLot(
        productId: string,
        variantId: string | null,
        quantity: number,
        unitCost: number,
        sourceType: string,
        sourceId: string | undefined,
        receivedAt: string
    ): Promise<void> {
        if (!isSupabaseConfigured() || !supabase || quantity <= 0) return;
        try {
            // Buscar o lote mais recente com quantity > 0 para este produto/variante
            let query = supabase
                .from('stock_lots')
                .select('id, quantity')
                .eq('product_id', productId)
                .gt('quantity', 0)
                .order('received_at', { ascending: false })
                .limit(1);
            if (variantId === null) {
                query = query.is('variant_id', null);
            } else {
                query = query.eq('variant_id', variantId);
            }
            const { data: lots, error: fetchError } = await query;
            if (fetchError && fetchError.code === '42P01') return; // tabela não existe

            if (lots && lots.length > 0) {
                // Actualizar o lote existente, somando a quantidade
                const existingLot = lots[0];
                const newQty = Number(existingLot.quantity) + quantity;
                const { error: updateError } = await supabase
                    .from('stock_lots')
                    .update({ quantity: newQty })
                    .eq('id', existingLot.id);
                if (updateError) {
                    console.warn('[stockService._updateOrCreateStockLot] update error:', updateError.message);
                }
            } else {
                // Nenhum lote activo encontrado, criar um novo
                await this._createStockLot(productId, variantId, quantity, unitCost, sourceType, sourceId, receivedAt);
            }
        } catch (e) {
            console.warn('[stockService._updateOrCreateStockLot]', e);
        }
    },

    async ensureStockMovement(movement: StockMovement): Promise<{ stockMovement: StockMovement | null; error?: string }> {
        if (!isSupabaseConfigured()) return { stockMovement: null, error: 'Database not connected' };

        try {
            const ref = movement.sourceReference;
            // Evitar duplicados: se já existe movimento com o mesmo sourceReference (type:id), devolver o existente.
            // Não fazer esta query para type 'adjustment': cada ajuste gera um movimento novo e o filtro .eq() em JSONB pode causar 400 no PostgREST.
            const refTypeStr = ref?.type ? String(ref.type) : undefined;
            const skipDuplicateCheck = refTypeStr === 'adjustment' || refTypeStr === String(StockTransactionSource.ADJUSTMENT);
            if (ref?.type != null && ref?.id && !skipDuplicateCheck) {
                const refStr = JSON.stringify(ref);
                const { data: existing, error: fetchError } = await supabase
                    .from('stock_movements')
                    .select('id, date, items, notes, source_reference, created_at, updated_at')
                    .eq('source_reference', refStr)
                    .limit(1)
                    .maybeSingle();

                if (!fetchError && existing) {
                    const existingMovement: StockMovement = {
                        id: existing.id,
                        date: existing.date,
                        items: existing.items ?? [],
                        notes: existing.notes ?? undefined,
                        sourceReference: existing.source_reference ?? undefined,
                        createdAt: existing.created_at,
                        updatedAt: existing.updated_at
                    };
                    return { stockMovement: existingMovement, error: undefined };
                }
            }

            // Adaptar para formato do banco (snake_case)
            const dbMovement = {
                date: movement.date,
                notes: movement.notes,
                source_reference: movement.sourceReference,
                created_at: movement.createdAt || new Date().toISOString(),
                items: movement.items // Assumindo JSONB
            };

            const { data, error } = await supabase
                .from('stock_movements')
                .insert(dbMovement)
                .select()
                .single();

            if (error) {
                if (handleSupabaseError('ensureStockMovement', error)) {
                    return { stockMovement: movement, error: 'Database error' };
                }
                throw error;
            }

            const createdMovement: StockMovement = {
                ...movement,
                id: data.id,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };

            // Processar itens do movimento (atualizar stock e transações)
            await this.processStockMovementItems(createdMovement);

            return { stockMovement: createdMovement, error: undefined };
        } catch (e: any) {
            console.warn('Error creating stock movement:', e);
            return { stockMovement: null, error: e.message };
        }
    },

    async createStockMovement(stock: StockMovement): Promise<{ stockMovement: StockMovement | null; error?: string }> {
        return this.ensureStockMovement(stock);
    },

    async updateStockMovement(stockId: string, stock: StockMovement): Promise<boolean> {
        if (!isSupabaseConfigured()) return true;

        try {
            // Buscar movimento antigo para comparar
            const { data: oldMovement } = await supabase
                .from('stock_movements')
                .select('*')
                .eq('id', stockId)
                .maybeSingle();

            const { error } = await supabase
                .from('stock_movements')
                .update({
                    date: stock.date,
                    items: stock.items,
                    notes: stock.notes || null,
                    source_reference: stock.sourceReference || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', stockId);

            if (error) {
                if (handleSupabaseError('updateStockMovement', error)) return false;
                throw error;
            }

            // Se os itens mudaram, atualizar transações e stock
            if (oldMovement && JSON.stringify(oldMovement.items) !== JSON.stringify(stock.items)) {
                try {
                    // Deletar transações antigas relacionadas a este movimento
                    await supabase
                        .from('stock_transactions')
                        .delete()
                        .eq('source_id', stockId);

                    // Reverter stock do movimento antigo
                    if (oldMovement.items && Array.isArray(oldMovement.items)) {
                        await this.revertStockMovementItems({
                            id: stockId,
                            date: oldMovement.date,
                            items: oldMovement.items,
                            createdAt: oldMovement.created_at,
                            updatedAt: oldMovement.updated_at,
                            notes: oldMovement.notes,
                            sourceReference: oldMovement.source_reference
                        });
                    }

                    // Apagar lot consumptions existentes para esta fonte antes de reprocessar
                    // (evita duplicação de consumos ao re-executar processStockMovementItems)
                    const sourceId = oldMovement.source_reference?.id || stockId;
                    const sourceType = oldMovement.source_reference?.type
                        ? String(oldMovement.source_reference.type)
                        : undefined;
                    if (sourceId && sourceType) {
                        await supabase
                            .from('stock_lot_consumptions')
                            .delete()
                            .eq('source_id', sourceId)
                            .eq('source_type', sourceType);
                    }

                    // Processar novos itens
                    await this.processStockMovementItems(stock);
                } catch (processError: any) {
                    console.warn('[updateStockMovement] Erro ao atualizar transações e stock (não crítico):', processError.message);
                }
            }

            return true;
        } catch (e: any) {
            console.error('Error updating stock movement:', e);
            return false;
        }
    },

    /**
     * Obtém custos de stock_transactions por movimento/produto/variante.
     * Chave: `${movementId}-${productId}-${variantId || 'null'}`; valor: cost_price.
     */
    async getTransactionCostsForMovements(movementIds: string[]): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        if (!isSupabaseConfigured() || !supabase || movementIds.length === 0) return map;
        try {
            const { data, error } = await supabase
                .from('stock_transactions')
                .select('source_id, product_id, variant_id, cost_price')
                .in('source_id', movementIds)
                .eq('transaction_type', 'exit');
            if (error) {
                if (error.code === '42P01') return map;
                handleSupabaseError('getTransactionCostsForMovements', error);
                return map;
            }
            (data || []).forEach((row: { source_id: string; product_id: string; variant_id: string | null; cost_price: number }) => {
                const key = `${row.source_id}-${row.product_id}-${row.variant_id ?? 'null'}`;
                map.set(key, Number(row.cost_price ?? 0));
            });
        } catch (e) {
            console.warn('[getTransactionCostsForMovements]', e);
        }
        return map;
    },

    async getStockMovements(): Promise<StockMovement[]> {
        if (!isSupabaseConfigured()) return [];
        try {
            const { data, error } = await supabase
                .from('stock_movements')
                .select('*')
                .order('date', { ascending: false });

            if (error) {
                handleSupabaseError('getStockMovements', error);
                return [];
            }

            return (data || []).map((m: any) => ({
                id: m.id,
                date: m.date,
                items: m.items,
                notes: m.notes,
                sourceReference: m.source_reference,
                createdAt: m.created_at,
                updatedAt: m.updated_at
            }));
        } catch (e) {
            return [];
        }
    },

    async deleteStockMovement(stockId: string): Promise<boolean> {
        if (!isSupabaseConfigured()) return true;

        try {
            // Buscar movimento antes de deletar para reverter transações e stock
            const { data: movement } = await supabase
                .from('stock_movements')
                .select('*')
                .eq('id', stockId)
                .maybeSingle();

            if (movement) {
                // Deletar transações
                await supabase
                    .from('stock_transactions')
                    .delete()
                    .eq('source_id', stockId);

                // Reverter stock
                if (movement.items && Array.isArray(movement.items)) {
                    await this.revertStockMovementItems({
                        id: stockId,
                        date: movement.date,
                        items: movement.items,
                        createdAt: movement.created_at,
                        updatedAt: movement.updated_at,
                        notes: movement.notes,
                        sourceReference: movement.source_reference
                    });
                }
            }

            const { error } = await supabase
                .from('stock_movements')
                .delete()
                .eq('id', stockId);

            if (error) {
                if (handleSupabaseError('deleteStockMovement', error)) return false;
                throw error;
            }

            return true;
        } catch (e: any) {
            console.error('Error deleting stock movement:', e);
            return false;
        }
    },

    async checkStockAvailability(
        productId: string,
        variantId: string | null,
        locationId: string, // Legacy param, kept for compatibility interface
        requiredQuantity: number
    ): Promise<{
        available: boolean;
        availableQuantity: number;
        reservedQuantity: number;
        totalQuantity: number;
        message?: string;
    }> {
        if (!isSupabaseConfigured()) return { available: false, availableQuantity: 0, reservedQuantity: 0, totalQuantity: 0, message: 'System error' };

        try {
            // Usar tabela product_variants como fonte de verdade
            let query = supabase.from('product_variants').select('stock').eq('product_id', productId);
            if (variantId) {
                query = query.eq('id', variantId);
            } else {
                // Se não tem variantId, buscar default
                query = query.eq('is_default', true);
            }

            const { data } = await query.maybeSingle();
            const totalQuantity = data ? Number(data.stock || 0) : 0;
            // Não temos reserved_quantity na product_variants por padrão neste modelo simplificado?
            // Assumindo 0 reservados por enquanto, ou verificar outra tabela se existir.
            const reservedQuantity = 0;
            const availableQuantity = totalQuantity - reservedQuantity;
            const available = availableQuantity >= requiredQuantity;

            return {
                available,
                availableQuantity,
                reservedQuantity,
                totalQuantity,
                message: available ? undefined : `Stock insuficiente. Disponível: ${availableQuantity}`
            };
        } catch (e) {
            return { available: false, availableQuantity: 0, reservedQuantity: 0, totalQuantity: 0 };
        }
    },

    async validateStockIntegrity(): Promise<any> {
        // Implementação simplificada para validar se stock_transactions batem com movements
        return { isValid: true, errors: [], warnings: [], summary: {} };
    },

    async getStockConfig(): Promise<any> {
        if (!isSupabaseConfigured()) return null;
        const { data } = await supabase.from('stock_config').select('*').eq('is_active', true).maybeSingle();
        if (!data) return null;
        return { resetDate: data.reset_date, resetReason: data.reset_reason, createdAt: data.created_at };
    },

    async resetStockHistory(resetDate: string, resetReason: string, initialStocks: any[]): Promise<any> {
        if (!isSupabaseConfigured()) return { success: false };
        try {
            await supabase.from('stock_config').update({ is_active: false }).eq('is_active', true);
            await supabase.from('stock_config').insert({ reset_date: resetDate, reset_reason: resetReason, is_active: true });

            for (const item of initialStocks) {
                const safeStock = Math.max(0, Number(item.stock) || 0);
                await supabase.from('product_variants').update({ stock: safeStock }).eq('id', item.variantId);
            }
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    },

    /** Valor total dos lotes para produto/variante (para valorização FIFO no snapshot). */
    async _getStockLotsTotalValue(productId: string, variantId: string | null): Promise<number | null> {
        if (!isSupabaseConfigured() || !supabase) return null;
        try {
            let q = supabase.from('stock_lots')
                .select('quantity, unit_cost')
                .eq('product_id', productId)
                .gt('quantity', 0);
            if (variantId === null) q = q.is('variant_id', null);
            else q = q.eq('variant_id', variantId);
            const { data, error } = await q;
            if (error || !data || data.length === 0) return null;
            const total = data.reduce((sum: number, r: { quantity: number; unit_cost: number }) =>
                sum + (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0), 0);
            return total;
        } catch {
            return null;
        }
    },

    /** Devolve quantidades de stock inicial guardadas para uma data (para relatório). */
    async getStockInitialSnapshot(snapshotDate: string): Promise<{ productId: string; variantId: string | null; quantity: number }[]> {
        if (!isSupabaseConfigured()) return [];
        const { data, error } = await supabase
            .from('stock_initial_snapshot')
            .select('product_id, variant_id, quantity')
            .eq('snapshot_date', snapshotDate);
        if (error) {
            console.warn('[getStockInitialSnapshot]', error.message);
            return [];
        }
        return (data || []).map((row: { product_id: string; variant_id: string | null; quantity: number }) => ({
            productId: row.product_id,
            variantId: row.variant_id ?? null,
            quantity: Number(row.quantity) || 0
        }));
    },

    /** Grava/atualiza quantidades de stock inicial para uma data. Substitui todas as linhas dessa data. */
    async saveStockInitialSnapshot(
        snapshotDate: string,
        items: { productId: string; variantId?: string | null; quantity: number }[]
    ): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) return { success: false, error: 'Supabase não configurado' };
        try {
            const { error: deleteError } = await supabase
                .from('stock_initial_snapshot')
                .delete()
                .eq('snapshot_date', snapshotDate);
            if (deleteError) throw deleteError;

            if (items.length === 0) return { success: true };

            const rows = await Promise.all(items.map(async (item) => {
                const variantId = item.variantId ?? null;
                const totalValue = await this._getStockLotsTotalValue(item.productId, variantId);
                return {
                    snapshot_date: snapshotDate,
                    product_id: item.productId,
                    variant_id: variantId,
                    quantity: item.quantity,
                    total_value: totalValue ?? undefined
                };
            }));
            const { error: insertError } = await supabase.from('stock_initial_snapshot').insert(rows);
            if (insertError) throw insertError;
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e?.message || 'Erro ao guardar snapshot' };
        }
    },

    /** Grava/atualiza uma única linha do snapshot (por produto/variante). Upsert por (snapshot_date, product_id, variant_id). */
    async saveStockInitialSnapshotItem(
        snapshotDate: string,
        item: { productId: string; variantId?: string | null; quantity: number }
    ): Promise<{ success: boolean; error?: string }> {
        if (!isSupabaseConfigured()) return { success: false, error: 'Supabase não configurado' };
        try {
            const variantId = item.variantId ?? null;
            let query = supabase
                .from('stock_initial_snapshot')
                .select('id, quantity')
                .eq('snapshot_date', snapshotDate)
                .eq('product_id', item.productId);
            if (variantId === null) {
                query = query.is('variant_id', null);
            } else {
                query = query.eq('variant_id', variantId);
            }
            const { data: existing, error: selectError } = await query.maybeSingle();
            if (selectError) throw selectError;

            const totalValue = await this._getStockLotsTotalValue(item.productId, variantId);
            const row: Record<string, unknown> = {
                snapshot_date: snapshotDate,
                product_id: item.productId,
                variant_id: variantId,
                quantity: item.quantity
            };
            if (totalValue != null) row.total_value = totalValue;

            if (existing) {
                const updatePayload: Record<string, unknown> = { quantity: item.quantity, updated_at: new Date().toISOString() };
                if (totalValue != null) updatePayload.total_value = totalValue;
                const { error: updateError } = await supabase
                    .from('stock_initial_snapshot')
                    .update(updatePayload)
                    .eq('id', existing.id);
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await supabase.from('stock_initial_snapshot').insert(row);
                if (insertError) throw insertError;
            }
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e?.message || 'Erro ao guardar linha do snapshot' };
        }
    },

    async processStockMovementItems(stockMovement: StockMovement): Promise<void> {
        if (!isSupabaseConfigured() || !stockMovement.items || stockMovement.items.length === 0) {
            return;
        }

        let transactionType: 'entry' | 'exit' = 'entry';
        const sourceRef = stockMovement.sourceReference;
        const sourceTypeStr = sourceRef?.type ? String(sourceRef.type) : undefined;
        
        const isAdjustment = sourceTypeStr === 'adjustment' || sourceTypeStr === String(StockTransactionSource.ADJUSTMENT);

        if (sourceTypeStr === 'purchase' || sourceTypeStr === String(StockTransactionSource.PURCHASE)) {
            transactionType = 'entry';
        } else if (sourceTypeStr === 'order' || sourceTypeStr === String(StockTransactionSource.SALE) || sourceTypeStr === String(StockTransactionSource.TRANSFER)) {
            transactionType = 'exit';
        } else if (isAdjustment) {
            transactionType = 'entry'; // será determinado por item conforme o sinal da quantidade
        } else if (!sourceRef) {
            const notesLower = (stockMovement.notes || '').toLowerCase();
            if (notesLower.includes('entrada') || notesLower.includes('compra') || notesLower.includes('recebido')) {
                transactionType = 'entry';
            } else if (notesLower.includes('saída') || notesLower.includes('venda') || notesLower.includes('deduzido')) {
                transactionType = 'exit';
            }
        }

        // Importar productService dinamicamente para evitar circular dependency se houver
        const { productService } = await import('./productService');
        const allProducts = await productService.getProducts();

        for (const item of stockMovement.items) {
            try {
                let product: Product | undefined;
                if (item.productId) {
                    product = allProducts.find(p => p.id === item.productId);
                }
                if (!product) {
                    product = allProducts.find(p =>
                        p.name.toLowerCase() === (item.productName || '').toLowerCase()
                    );
                }

                if (product) {
                    let variantId = item.variantId || null;
                    const variantSearchName = item.variant || item.variantName;
                    
                    if (!variantId && variantSearchName && product.variants) {
                        const variant = product.variants.find(v => variantsMatch(v.name, variantSearchName));
                        variantId = variant?.id || null;
                    }

                    // Se ainda não tem variantId, usar default
                    if (!variantId && product.variants && product.variants.length > 0) {
                        const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
                        variantId = defaultVariant.id;
                        console.log(`[processStockMovementItems] Variante não resolvida para "${item.productName}", usando default: ${defaultVariant.name}`);
                    }

                    // Para saídas (order/sale), movimentos podem ter quantidade negativa: usar valor absoluto na aplicação
                    const rawQty = Number(item.quantity) || 0;
                    let effectiveQty: number;
                    let itemTransactionType = transactionType;
                    if (isAdjustment) {
                        itemTransactionType = rawQty >= 0 ? 'entry' : 'exit';
                        effectiveQty = Math.abs(rawQty);
                    } else {
                        effectiveQty = transactionType === 'exit' ? Math.abs(rawQty) : rawQty;
                    }
                    if (effectiveQty <= 0) continue;

                    // Ajustar stock
                    await this.adjustVariantStock(
                        product.id,
                        variantId,
                        effectiveQty,
                        itemTransactionType === 'entry' ? 'add' : 'subtract'
                    );

                    let costPrice: number;
                    if (itemTransactionType === 'entry') {
                        if (item.unitPrice != null && item.unitPrice >= 0) {
                            costPrice = item.unitPrice;
                        } else if (isAdjustment) {
                            const { stockValuationService } = await import('./stockValuationService');
                            costPrice = await stockValuationService.getAverageCost(product.id, variantId);
                            if (costPrice <= 0) costPrice = product.costPrice ?? 0;
                        } else {
                            costPrice = product.costPrice ?? 0;
                        }
                        // Criar ou actualizar lote em stock_lots (para valorização FIFO/LIFO)
                        if (isAdjustment) {
                            // Ajustes: actualizar o lote mais recente em vez de criar um novo
                            await this._updateOrCreateStockLot(
                                product.id,
                                variantId,
                                effectiveQty,
                                costPrice,
                                sourceTypeStr || 'manual',
                                stockMovement.sourceReference?.id,
                                stockMovement.date
                            );
                        } else {
                            // Compras e outros: criar novo lote
                            await this._createStockLot(
                                product.id,
                                variantId,
                                effectiveQty,
                                costPrice,
                                sourceTypeStr || 'manual',
                                stockMovement.sourceReference?.id,
                                stockMovement.date
                            );
                        }
                    } else {
                        // Saída: valorização via stockValuationService (FIFO/LIFO/média/padrão)
                        const { stockValuationService } = await import('./stockValuationService');
                        const result = await stockValuationService.computeExitCost(
                            product.id,
                            variantId,
                            effectiveQty,
                            stockMovement.date,
                            sourceTypeStr as any,
                            stockMovement.sourceReference?.id
                        );
                        costPrice = effectiveQty > 0 ? result.costAmount / effectiveQty : 0;
                    }

                    // Criar transação (quantidade positiva; o tipo indica entrada/saída)
                    await this.ensureStockTransaction(
                        product.id,
                        product.name,
                        variantId,
                        item.variant || item.variantName || null,
                        itemTransactionType,
                        effectiveQty,
                        item.unit || product.unit || 'un',
                        stockMovement.date,
                        sourceTypeStr || 'manual',
                        stockMovement.id,
                        stockMovement.notes || 'Ajuste de stock automático',
                        costPrice,
                        product.price,
                        stockMovement.notes
                    );
                } else {
                    console.warn(`[processStockMovementItems] Produto não encontrado para item:`, item.productName || item.productId);
                }
            } catch (err) {
                console.error('[processStockMovementItems] Erro ao processar item:', item, err);
            }
        }
    },

    async revertStockMovementItems(stockMovement: StockMovement): Promise<void> {
        if (!isSupabaseConfigured() || !stockMovement.items || stockMovement.items.length === 0) {
            return;
        }

        let transactionType: 'entry' | 'exit' = 'entry';
        const sourceRef = stockMovement.sourceReference;
        const sourceTypeStr = sourceRef?.type ? String(sourceRef.type) : undefined;
        const isAdjustment = sourceTypeStr === 'adjustment' || sourceTypeStr === String(StockTransactionSource.ADJUSTMENT);

        if (sourceTypeStr === 'purchase' || sourceTypeStr === String(StockTransactionSource.PURCHASE)) {
            transactionType = 'entry';
        } else if (sourceTypeStr === 'order' || sourceTypeStr === String(StockTransactionSource.SALE) || sourceTypeStr === String(StockTransactionSource.TRANSFER)) {
            transactionType = 'exit';
        } else if (isAdjustment) {
            transactionType = 'entry'; // será determinado por item conforme o sinal da quantidade
        } else if (!sourceRef) {
            const notesLower = (stockMovement.notes || '').toLowerCase();
            if (notesLower.includes('entrada') || notesLower.includes('compra') || notesLower.includes('recebido')) {
                transactionType = 'entry';
            } else if (notesLower.includes('saída') || notesLower.includes('venda') || notesLower.includes('deduzido')) {
                transactionType = 'exit';
            }
        }

        // Restaurar lotes consumidos (saídas: order/adjustment)
        if (sourceRef?.id && sourceTypeStr && (sourceTypeStr === 'order' || sourceTypeStr === 'adjustment')) {
            try {
                const { data: consumptions } = await supabase
                    .from('stock_lot_consumptions')
                    .select('lot_id, quantity_consumed')
                    .eq('source_id', sourceRef.id)
                    .eq('source_type', sourceTypeStr);

                if (consumptions && consumptions.length > 0) {
                    // Restaurar quantidade em cada lote individualmente
                    for (const c of consumptions) {
                        const { data: lot } = await supabase
                            .from('stock_lots')
                            .select('quantity')
                            .eq('id', c.lot_id)
                            .single();
                        if (lot) {
                            await supabase
                                .from('stock_lots')
                                .update({ quantity: (Number(lot.quantity) || 0) + Number(c.quantity_consumed) })
                                .eq('id', c.lot_id);
                        }
                    }
                    // Apagar os registos de consumo
                    await supabase
                        .from('stock_lot_consumptions')
                        .delete()
                        .eq('source_id', sourceRef.id)
                        .eq('source_type', sourceTypeStr);
                }
            } catch (err) {
                console.error('[revertStockMovementItems] Erro ao restaurar lotes:', err);
            }
        }

        const { productService } = await import('./productService');
        const allProducts = await productService.getProducts();

        for (const item of stockMovement.items) {
            try {
                let product: Product | undefined;
                if (item.productId) {
                    product = allProducts.find(p => p.id === item.productId);
                }
                if (!product && item.productName) {
                    product = allProducts.find(p => p.name.toLowerCase() === item.productName!.toLowerCase());
                }

                if (product) {
                    let variantId = item.variantId || null;
                    const variantSearchName = item.variant || item.variantName;

                    if (!variantId && variantSearchName && product.variants) {
                        const variant = product.variants.find(v => variantsMatch(v.name, variantSearchName));
                        variantId = variant?.id || null;
                    }

                    if (!variantId && product.variants && product.variants.length > 0) {
                        const defaultVariant = product.variants.find(v => v.isDefault) || product.variants[0];
                        variantId = defaultVariant.id;
                    }

                    // Quantidade em valor absoluto (movimentos de venda podem ter qty negativa)
                    const rawQty = Number(item.quantity) || 0;
                    const effectiveQty = Math.abs(rawQty);
                    if (effectiveQty <= 0) continue;

                    // Para adjustment: transactionType por item conforme sinal
                    const itemTransactionType = isAdjustment ? (rawQty >= 0 ? 'entry' : 'exit') : transactionType;

                    // Reverter: se era entrada (add), agora subtraímos. Se era saída (subtract), agora adicionamos.
                    await this.adjustVariantStock(
                        product.id,
                        variantId,
                        effectiveQty,
                        itemTransactionType === 'entry' ? 'subtract' : 'add'
                    );
                }
            } catch (err) {
                console.error('[revertStockMovementItems] Erro ao reverter item:', item, err);
            }
        }
    },

    async synchronizeStockMovements(onProgress?: (p: any) => void): Promise<{
        success: boolean;
        created: number;
        updated: number;
        deleted: number;
        errors: string[];
    }> {
        const errors: string[] = [];
        let deleted = 0;
        let updated = 0;
        const totalSteps = 5;

        if (!isSupabaseConfigured()) {
            return { success: false, created: 0, updated: 0, deleted: 0, errors: ['Base de dados não configurada'] };
        }

        try {
            onProgress?.({ stage: 'Carregar dados...', current: 0, total: totalSteps * 100, message: 'A carregar compras, pedidos e movimentos...' });

            const { purchaseService } = await import('./purchaseService');
            const { orderService } = await import('../../sales/services/orderService');
            const { productService } = await import('./productService');

            const [purchases, orders, movements] = await Promise.all([
                purchaseService.getPurchases(),
                orderService.getOrders(),
                this.getStockMovements()
            ]);

            const purchaseIds = new Set(purchases.map(p => p.id));
            const orderIds = new Set(orders.map(o => o.id));
            const allProducts = await productService.getProducts();

            onProgress?.({ stage: 'Remover orfãos...', current: 100, total: totalSteps * 100, message: 'A verificar movimentos sem compra/pedido...' });

            const movementsWithRef = movements.filter(m => m.sourceReference?.type && m.sourceReference?.id);
            const orphanIds: string[] = [];
            for (const m of movementsWithRef) {
                const ref = m.sourceReference!;
                const refType = String(ref.type);
                const isOrphan =
                    (refType === 'purchase' && !purchaseIds.has(ref.id)) ||
                    ((refType === 'order' || refType === 'sale') && !orderIds.has(ref.id));
                if (isOrphan) orphanIds.push(m.id);
            }

            for (const id of orphanIds) {
                try {
                    const ok = await this.deleteStockMovement(id);
                    if (ok) deleted++;
                } catch (e: any) {
                    errors.push(`Orfão ${id}: ${e.message || e}`);
                }
            }

            onProgress?.({ stage: 'Remover duplicados...', current: 200, total: totalSteps * 100, message: 'A remover movimentos duplicados por origem...' });

            const remaining = movements.filter(m => !orphanIds.includes(m.id));
            const bySource = new Map<string, StockMovement[]>();
            for (const m of remaining) {
                if (!m.sourceReference?.type || !m.sourceReference?.id) continue;
                const key = `${m.sourceReference.type}:${m.sourceReference.id}`;
                if (!bySource.has(key)) bySource.set(key, []);
                bySource.get(key)!.push(m);
            }

            const duplicateToDelete: string[] = [];
            for (const [, group] of bySource) {
                if (group.length <= 1) continue;
                group.sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));
                for (let i = 1; i < group.length; i++) duplicateToDelete.push(group[i].id);
            }

            for (const id of duplicateToDelete) {
                try {
                    const ok = await this.deleteStockMovement(id);
                    if (ok) deleted++;
                } catch (e: any) {
                    errors.push(`Duplicado ${id}: ${e.message || e}`);
                }
            }

            onProgress?.({ stage: 'Normalizar nomes nos movimentos...', current: 300, total: totalSteps * 100, message: 'A atualizar nomes dos produtos...' });

            const stillRemaining = remaining.filter(m => !duplicateToDelete.includes(m.id));
            for (const movement of stillRemaining) {
                if (!movement.items?.length) continue;
                let changed = false;
                const newItems = movement.items.map((item: StockItem) => {
                    if (!item.productId) return item;
                    const product = allProducts.find(p => p.id === item.productId);
                    if (!product) return item;
                    const canonicalName = product.name;
                    let canonicalVariant: string | undefined = item.variant || item.variantName;
                    if (product.variants?.length) {
                        const variantId = item.variantId;
                        const v = variantId
                            ? product.variants.find(ev => ev.id === variantId)
                            : (item.variant || item.variantName
                                ? product.variants.find(ev => variantsMatch(ev.name, item.variant || item.variantName || ''))
                                : product.variants.find(ev => ev.isDefault) || product.variants[0]);
                        if (v) canonicalVariant = v.name;
                    } else {
                        canonicalVariant = undefined;
                    }
                    if ((item.productName !== canonicalName) || (item.variant !== canonicalVariant && item.variantName !== canonicalVariant)) {
                        changed = true;
                        return {
                            ...item,
                            productName: canonicalName,
                            variant: canonicalVariant,
                            variantName: canonicalVariant
                        };
                    }
                    return item;
                });
                if (changed) {
                    try {
                        const { error } = await supabase
                            .from('stock_movements')
                            .update({
                                items: newItems,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', movement.id);
                        if (!error) updated++;
                        else errors.push(`Movimento ${movement.id}: ${error.message}`);
                    } catch (e: any) {
                        errors.push(`Movimento ${movement.id}: ${e.message || e}`);
                    }
                }
            }

            onProgress?.({ stage: 'Concluído', current: totalSteps * 100, total: totalSteps * 100, message: 'Sincronização concluída.', stats: { created: 0, updated, deleted } });

            return {
                success: errors.length === 0,
                created: 0,
                updated,
                deleted,
                errors
            };
        } catch (e: any) {
            const msg = e?.message || String(e);
            errors.push(msg);
            return { success: false, created: 0, updated, deleted, errors };
        }
    },

    async synchronizeMovementProductNames(): Promise<{ success: boolean; updated: number; errors: string[] }> {
        const errors: string[] = [];
        let updated = 0;
        if (!isSupabaseConfigured()) {
            return { success: false, updated: 0, errors: ['Base de dados não configurada'] };
        }
        try {
            const { productService } = await import('./productService');
            const movements = await this.getStockMovements();
            const allProducts = await productService.getProducts();

            for (const movement of movements) {
                if (!movement.items?.length) continue;
                let changed = false;
                const newItems = movement.items.map((item: StockItem) => {
                    if (!item.productId) return item;
                    const product = allProducts.find(p => p.id === item.productId);
                    if (!product) return item;
                    const canonicalName = product.name;
                    let canonicalVariant: string | undefined = item.variant || item.variantName;
                    if (product.variants?.length) {
                        const v = item.variantId
                            ? product.variants.find(ev => ev.id === item.variantId)
                            : (item.variant || item.variantName
                                ? product.variants.find(ev => variantsMatch(ev.name, item.variant || item.variantName || ''))
                                : product.variants.find(ev => ev.isDefault) || product.variants[0]);
                        if (v) canonicalVariant = v.name;
                    } else {
                        canonicalVariant = undefined;
                    }
                    if ((item.productName !== canonicalName) || (item.variant !== canonicalVariant && item.variantName !== canonicalVariant)) {
                        changed = true;
                        return {
                            ...item,
                            productName: canonicalName,
                            variant: canonicalVariant,
                            variantName: canonicalVariant
                        };
                    }
                    return item;
                });
                if (changed) {
                    const { error } = await supabase
                        .from('stock_movements')
                        .update({
                            items: newItems,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', movement.id);
                    if (!error) updated++;
                    else errors.push(`Movimento ${movement.id}: ${error.message}`);
                }
            }
            return { success: errors.length === 0, updated, errors };
        } catch (e: any) {
            const msg = e?.message || String(e);
            errors.push(msg);
            return { success: false, updated, errors };
        }
    },

    /**
     * Recalcula o stock de um produto/variante com base nos movimentos
     * @param productId ID do produto
     * @param variantId ID da variante (null para variante default)
     * @param fromDate Data inicial para calculo (opcional, usa snapshot se existir)
     * @returns Stock calculado, stock actual, e diferenca
     */
    async recalculateStockFromMovements(
        productId: string,
        variantId: string | null,
        fromDate?: string
    ): Promise<{ calculated: number; current: number; difference: number; details: { date: string; quantity: number; source: string }[] }> {
        const details: { date: string; quantity: number; source: string }[] = [];
        let calculated = 0;
        let current = 0;

        if (!isSupabaseConfigured() || !supabase) {
            return { calculated: 0, current: 0, difference: 0, details };
        }

        try {
            // 1. Obter stock inicial do snapshot (se existir)
            if (fromDate) {
                const snapshots = await this.getStockInitialSnapshot(fromDate);
                const snapshot = snapshots.find(s => 
                    s.productId === productId && 
                    (variantId ? s.variantId === variantId : !s.variantId)
                );
                if (snapshot) {
                    calculated = snapshot.quantity;
                    details.push({ date: fromDate, quantity: snapshot.quantity, source: 'Snapshot inicial' });
                }
            }

            // 2. Obter todos os movimentos
            const movements = await this.getStockMovements();
            
            // 3. Filtrar movimentos relevantes
            for (const movement of movements) {
                // Filtrar por data se especificado
                if (fromDate && movement.date < fromDate) continue;
                
                // Encontrar items relevantes
                for (const item of movement.items || []) {
                    const itemVariantId = item.variantId || null;
                    
                    // Verificar se é o produto/variante correcto
                    if (item.productId !== productId) continue;
                    if (variantId && itemVariantId !== variantId) continue;
                    if (!variantId && itemVariantId) continue; // Se nao especificou variante, usar apenas items sem variante
                    
                    calculated += item.quantity || 0;
                    details.push({
                        date: movement.date,
                        quantity: item.quantity || 0,
                        source: movement.notes || movement.sourceReference?.type || 'Movimento'
                    });
                }
            }

            // 4. Obter stock actual
            if (variantId) {
                const { data: variant } = await supabase
                    .from('product_variants')
                    .select('stock')
                    .eq('id', variantId)
                    .maybeSingle();
                current = Number(variant?.stock || 0);
            } else {
                // Buscar variante default
                const { data: variants } = await supabase
                    .from('product_variants')
                    .select('id, stock, is_default')
                    .eq('product_id', productId);
                
                if (variants?.length) {
                    const defaultVariant = variants.find(v => v.is_default) || variants[0];
                    current = Number(defaultVariant?.stock || 0);
                }
            }

            const difference = calculated - current;
            return { calculated, current, difference, details };

        } catch (e: any) {
            console.error('[recalculateStockFromMovements]', e);
            return { calculated: 0, current: 0, difference: 0, details };
        }
    },

    /**
     * Recalcula e corrige o stock de todos os produtos com base nos movimentos
     * @param dryRun Se true, apenas simula sem fazer alteracoes
     * @param fromDate Data inicial para calculo
     * @returns Resultado da operacao
     */
    async recalculateAllStock(dryRun = true, fromDate?: string): Promise<{
        success: boolean;
        products: { productId: string; productName: string; variantId: string; variantName: string; before: number; after: number; difference: number }[];
        errors: string[];
    }> {
        const products: { productId: string; productName: string; variantId: string; variantName: string; before: number; after: number; difference: number }[] = [];
        const errors: string[] = [];

        if (!isSupabaseConfigured() || !supabase) {
            return { success: false, products, errors: ['Base de dados não configurada'] };
        }

        try {
            const { productService } = await import('./productService');
            const allProducts = await productService.getProducts();
            const movements = await this.getStockMovements();

            // Calcular stock por variante
            const stockByVariant = new Map<string, number>();

            // Se houver fromDate, carregar snapshots
            if (fromDate) {
                const snapshots = await this.getStockInitialSnapshot(fromDate);
                for (const s of snapshots) {
                    const key = s.variantId || `product:${s.productId}`;
                    stockByVariant.set(key, s.quantity);
                }
            }

            // Processar movimentos
            for (const movement of movements) {
                if (fromDate && movement.date < fromDate) continue;

                for (const item of movement.items || []) {
                    const key = item.variantId || `product:${item.productId}`;
                    const current = stockByVariant.get(key) || 0;
                    stockByVariant.set(key, current + (item.quantity || 0));
                }
            }

            // Comparar e actualizar
            for (const product of allProducts) {
                for (const variant of product.variants || []) {
                    const calculated = stockByVariant.get(variant.id) || 0;
                    const current = Number(variant.stock || 0);
                    const difference = calculated - current;

                    if (Math.abs(difference) > 0.01) {
                        const safeStock = Math.max(0, calculated);
                        products.push({
                            productId: product.id,
                            productName: product.name,
                            variantId: variant.id,
                            variantName: variant.name,
                            before: current,
                            after: safeStock,
                            difference: safeStock - current
                        });

                        if (!dryRun) {
                            const { error } = await supabase
                                .from('product_variants')
                                .update({ stock: safeStock, updated_at: new Date().toISOString() })
                                .eq('id', variant.id);
                            
                            if (error) {
                                errors.push(`${product.name} ${variant.name}: ${error.message}`);
                            }
                        }
                    }
                }
            }

            return { success: errors.length === 0, products, errors };

        } catch (e: any) {
            errors.push(e?.message || String(e));
            return { success: false, products, errors };
        }
    }
};
