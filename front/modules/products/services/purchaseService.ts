import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError, parseProductName } from '../../core/services/serviceUtils';
import { Purchase, PurchaseItem, StockItem, StockMovement } from '../../core/types/types';
import { stockService } from './stockService';
import { getTodayDateString } from '../../core/utils/dateUtils';

function mapRowToPurchase(row: any): Purchase {
  const items: PurchaseItem[] = Array.isArray(row.items)
    ? row.items.map((it: any) => {
      const qty = Number(it.quantity) || 0;
      const unitPrice = it.unit_price ?? it.unitPrice ?? it.cost_price ?? it.costPrice ?? 0;
      let totalPrice = it.total_price ?? it.totalPrice ?? it.total ?? (qty * Number(unitPrice));

      // Correção defensiva: se total é igual ao preço unitário mas quantidade > 1, recalcular
      if (qty > 1 && Number(totalPrice) === Number(unitPrice)) {
        totalPrice = qty * Number(unitPrice);
      }
      return {
        id: it.id || `item-${Math.random().toString(36).slice(2, 9)}`,
        productId: it.productId ?? it.product_id ?? '',
        productName: it.productName ?? it.product_name ?? '',
        quantity: qty,
        unitPrice: Number(unitPrice),
        totalPrice: Number(totalPrice),
        variant: it.variant,
        unit: it.unit,
        costPrice: Number(unitPrice),
        total: Number(totalPrice)
      };
    })
    : [];
  const dateVal = row.date ?? row.order_date;
  const orderDate = dateVal ? (typeof dateVal === 'string' ? dateVal.split('T')[0] : dateVal) : null;
  return {
    id: row.id,
    supplierId: row.supplier_id != null ? String(row.supplier_id) : '',
    supplierName: row.supplier_name ?? undefined,
    supplierLocationId: row.supplier_location_id != null ? String(row.supplier_location_id) : undefined,
    supplierLocationName: row.supplier_location_name ?? undefined,
    items,
    totalAmount: Number(row.total_amount) || 0,
    orderDate: orderDate ?? undefined,
    date: orderDate ?? undefined,
    notes: row.notes ?? undefined,
    createdBy: row.created_by != null ? String(row.created_by) : undefined,
    locationId: row.location_id != null ? String(row.location_id) : undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
    amountPaid: row.amount_paid != null ? Number(row.amount_paid) : undefined,
    paymentDate: row.payment_date ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function purchaseToRow(p: Purchase): Record<string, unknown> {
  const dateVal = p.date ?? p.orderDate ?? getTodayDateString();
  const d = typeof dateVal === 'string' ? dateVal.split('T')[0] : dateVal;
  return {
    date: d,
    supplier_id: p.supplierId || null,
    supplier_name: p.supplierName ?? null,
    supplier_location_id: p.supplierLocationId || null,
    supplier_location_name: p.supplierLocationName ?? null,
    total_amount: p.totalAmount,
    items: (p.items || []).map(it => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      unit_price: it.unitPrice ?? it.costPrice,
      total_price: (it.quantity > 1 && (it.totalPrice ?? it.total) === (it.unitPrice ?? it.costPrice))
        ? (it.quantity * (it.unitPrice ?? it.costPrice ?? 0))
        : (it.totalPrice ?? it.total ?? (it.quantity * (it.unitPrice ?? it.costPrice ?? 0))),
      variant: it.variant ?? null,
      unit: it.unit ?? null
    })),
    notes: p.notes ?? null,
    created_by: p.createdBy ?? null,
    location_id: p.locationId ?? null,
    invoice_number: p.invoiceNumber ?? null,
    payment_status: p.paymentStatus ?? null,
    amount_paid: p.amountPaid ?? null,
    payment_date: p.paymentDate ?? null,
    updated_at: new Date().toISOString()
  };
}

/**
 * Compara se os items de uma compra mudaram de forma relevante para o stock.
 * Ignora mudanças em preços (que não afetam stock).
 * @returns true se os items mudaram (productId, quantity, variant)
 */
function hasItemsChanged(oldItems: any[] | undefined, newItems: PurchaseItem[] | undefined): boolean {
  if (!oldItems && !newItems) return false;
  if (!oldItems || !newItems) return true;
  if (oldItems.length !== newItems.length) {
    console.log('[hasItemsChanged] Número de items diferente:', oldItems.length, 'vs', newItems.length);
    return true;
  }

  // Criar mapa dos items antigos por productId+variant
  const oldMap = new Map<string, number>();
  for (const item of oldItems) {
    const pid = item.productId ?? item.product_id;
    const variant = item.variant ?? '';
    const key = `${pid}::${variant}`;
    const qty = Number(item.quantity) || 0;
    oldMap.set(key, (oldMap.get(key) || 0) + qty);
  }

  // Comparar com items novos
  const newMap = new Map<string, number>();
  for (const item of newItems) {
    const key = `${item.productId}::${item.variant ?? ''}`;
    const qty = Number(item.quantity) || 0;
    newMap.set(key, (newMap.get(key) || 0) + qty);
  }

  // Verificar se os mapas são iguais
  if (oldMap.size !== newMap.size) {
    console.log('[hasItemsChanged] Produtos/variantes diferentes');
    return true;
  }

  for (const [key, oldQty] of oldMap) {
    const newQty = newMap.get(key);
    if (newQty === undefined || newQty !== oldQty) {
      console.log('[hasItemsChanged] Quantidade diferente para', key, ':', oldQty, 'vs', newQty);
      return true;
    }
  }

  console.log('[hasItemsChanged] Items não mudaram (apenas preços/metadata)');
  return false;
}

async function resolveVariantId(productId: string, variantName: string | undefined): Promise<string | null> {
  if (!variantName || !isSupabaseConfigured() || !supabase) return null;
  const { data: v } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .ilike('name', variantName.trim())
    .maybeSingle();
  return v?.id ?? null;
}

/**
 * Aplicar ou reverter stock de uma compra. Único ponto que chama ensureStockMovement para compras.
 * Chamado por createPurchase(updateStock=true) e updatePurchase(updateStock=true, items alterados).
 */
async function applyPurchaseStock(purchaseId: string, items: PurchaseItem[], orderDate: string, op: 'add' | 'subtract', supplierName?: string, invoiceNumber?: string): Promise<void> {
  // Para operacao 'subtract' (reverter compra):
  // Apenas deletar os movimentos existentes - o deleteStockMovement ja reverte o stock automaticamente
  if (op === 'subtract') {
    try {
      const movements = await stockService.getStockMovements();
      const purchaseMovements = movements.filter(m =>
        m.sourceReference?.type === 'purchase' && m.sourceReference?.id === purchaseId
      );
      for (const m of purchaseMovements) {
        // deleteStockMovement ja reverte o stock via revertStockMovementItems
        await stockService.deleteStockMovement(m.id);
      }
    } catch (e) {
      console.warn('[applyPurchaseStock] Erro ao remover movimentos antigos:', e);
    }
    return;
  }

  // Para operacao 'add' (aplicar compra):
  // Criar movimento de stock - o processStockMovementItems cuida de ajustar o stock e criar transacoes
  const stockItems: StockItem[] = [];

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) continue;
    const parsed = parseProductName(it.productName ?? '');
    const productBaseName = parsed.baseName || (it.productName ?? '').trim();
    const variant = it.variant ?? parsed.variant ?? null;
    const variantId = await resolveVariantId(it.productId, variant ?? undefined);

    stockItems.push({
      productId: it.productId,
      productName: productBaseName,
      variantId: variantId ?? undefined,
      variant: variant ?? undefined,
      quantity: Math.abs(qty),
      unit: it.unit || 'un',
      unitPrice: it.unitPrice ?? it.costPrice ?? undefined
    });
  }

  if (stockItems.length > 0) {
    const supplierInfo = supplierName ? ` - ${supplierName}` : '';
    const invoiceInfo = invoiceNumber ? ` (${invoiceNumber})` : '';
    const movementNotes = `Entrada de stock via compra${supplierInfo}${invoiceInfo}`;

    const stockMovement: StockMovement = {
      id: '',
      date: orderDate,
      items: stockItems,
      notes: movementNotes,
      sourceReference: { type: 'purchase', id: purchaseId },
      createdAt: new Date().toISOString()
    };

    await stockService.ensureStockMovement(stockMovement);
  }
}

export const purchaseService = {
  async getPurchases(): Promise<Purchase[]> {
    if (!isSupabaseConfigured() || !supabase) return [];
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .order('date', { ascending: false });
      if (error) {
        if (handleSupabaseError('getPurchases', error)) return [];
        throw error;
      }
      return (data || []).map(mapRowToPurchase);
    } catch (e: any) {
      console.error('[purchaseService] getPurchases:', e);
      return [];
    }
  },

  async getPurchasesCount(): Promise<number> {
    if (!isSupabaseConfigured() || !supabase) return 0;
    try {
      const { count, error } = await supabase
        .from('purchases')
        .select('*', { count: 'exact', head: true });
      if (error) {
        if (handleSupabaseError('getPurchasesCount', error)) return 0;
        return 0;
      }
      return count ?? 0;
    } catch (e: any) {
      console.error('[purchaseService] getPurchasesCount:', e);
      return 0;
    }
  },

  async createPurchase(purchase: Purchase, updateStock = false): Promise<{ purchase: Purchase | null }> {
    if (!isSupabaseConfigured() || !supabase) return { purchase: null };
    try {
      const row = purchaseToRow(purchase);
      const { data, error } = await supabase
        .from('purchases')
        .insert(row)
        .select()
        .single();
      if (error) {
        if (handleSupabaseError('createPurchase', error)) return { purchase: null };
        console.error('[purchaseService] createPurchase:', error);
        return { purchase: null };
      }
      const created = data ? mapRowToPurchase(data) : null;
      const orderDate = created?.date ?? created?.orderDate ?? (purchase.date ?? purchase.orderDate ?? getTodayDateString());
      if (created && updateStock && created.items?.length) {
        await applyPurchaseStock(created.id, created.items, orderDate, 'add', created.supplierName, created.invoiceNumber);
      }
      return { purchase: created };
    } catch (e: any) {
      console.error('[purchaseService] createPurchase:', e);
      return { purchase: null };
    }
  },

  async updatePurchase(id: string, updates: Partial<Purchase>, updateStock = false): Promise<boolean> {
    if (!id) return false;
    if (!isSupabaseConfigured() || !supabase) return false;
    try {
      // Buscar dados antigos para comparar e reverter stock se necessario
      const { data: oldRow } = await supabase.from('purchases').select('items, date, supplier_name, invoice_number').eq('id', id).single();

      // Verificar se os ITEMS realmente mudaram (não apenas metadata como status de pagamento)
      const itemsChanged = updates.items !== undefined && hasItemsChanged(oldRow?.items, updates.items);
      const shouldUpdateStock = updateStock && itemsChanged;

      if (shouldUpdateStock) {
        console.log('[updatePurchase] Items mudaram, a reverter stock antigo...');
        if (oldRow?.items?.length) {
          const oldItems = (oldRow.items as any[]).map((it: any) => {
            const qty = Number(it.quantity) || 0;
            const unitPrice = it.unit_price ?? it.unitPrice ?? it.cost_price ?? it.costPrice ?? 0;
            const totalPrice = it.total_price ?? it.totalPrice ?? it.total ?? (qty * Number(unitPrice));
            return {
              ...it,
              productId: it.productId ?? it.product_id,
              productName: it.productName ?? it.product_name,
              quantity: qty,
              unitPrice: Number(unitPrice),
              totalPrice: Number(totalPrice),
              variant: it.variant,
              unit: it.unit
            };
          });
          const oldDate = (oldRow.date ?? oldRow.order_date ?? '').toString().split('T')[0];
          await applyPurchaseStock(id, oldItems, oldDate, 'subtract', oldRow.supplier_name, oldRow.invoice_number);
        }
      } else if (updateStock && !itemsChanged) {
        console.log('[updatePurchase] Items não mudaram, apenas metadata - stock não será alterado');
      }

      const row: Record<string, unknown> = {};
      const d = updates.date ?? updates.orderDate;
      if (d !== undefined) row.date = typeof d === 'string' ? d.split('T')[0] : d;
      if (updates.supplierId !== undefined) row.supplier_id = updates.supplierId;
      if (updates.supplierName !== undefined) row.supplier_name = updates.supplierName;
      if (updates.supplierLocationId !== undefined) row.supplier_location_id = updates.supplierLocationId;
      if (updates.supplierLocationName !== undefined) row.supplier_location_name = updates.supplierLocationName;
      if (updates.totalAmount !== undefined) row.total_amount = updates.totalAmount;
      if (updates.notes !== undefined) row.notes = updates.notes;
      if (updates.createdBy !== undefined) row.created_by = updates.createdBy;
      if (updates.invoiceNumber !== undefined) row.invoice_number = updates.invoiceNumber;
      if (updates.paymentStatus !== undefined) row.payment_status = updates.paymentStatus;
      if (updates.amountPaid !== undefined) row.amount_paid = updates.amountPaid;
      if (updates.paymentDate !== undefined) row.payment_date = updates.paymentDate;
      if (updates.items !== undefined) {
        row.items = updates.items.map(it => ({
          id: it.id,
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          unit_price: it.unitPrice ?? it.costPrice,
          total_price: it.totalPrice ?? it.total ?? it.quantity * (it.unitPrice ?? it.costPrice ?? 0),
          variant: it.variant ?? null,
          unit: it.unit ?? null
        }));
      }
      row.updated_at = new Date().toISOString();
      if (Object.keys(row).length <= 1) return true;
      const { error } = await supabase.from('purchases').update(row).eq('id', id);
      if (error) {
        if (handleSupabaseError('updatePurchase', error)) return false;
        return false;
      }

      // Só aplicar novo stock se os items mudaram
      if (shouldUpdateStock && updates.items?.length) {
        console.log('[updatePurchase] A aplicar novo stock...');
        const orderDate = (updates.date ?? updates.orderDate ?? getTodayDateString()).toString().split('T')[0];
        const supplierName = updates.supplierName ?? oldRow?.supplier_name;
        const invoiceNumber = updates.invoiceNumber ?? oldRow?.invoice_number;
        await applyPurchaseStock(id, updates.items, orderDate, 'add', supplierName, invoiceNumber);
        console.log('[updatePurchase] Stock atualizado com sucesso');
      }

      return true;
    } catch (e: any) {
      console.error('[purchaseService] updatePurchase:', e);
      return false;
    }
  },

  async deletePurchase(id: string, revertStock = false): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) return true;
    if (!id) return true;
    try {
      if (revertStock) {
        const { data } = await supabase.from('purchases').select('items, date, supplier_name, invoice_number').eq('id', id).single();
        if (data?.items?.length) {
          const orderDate = (data.date ?? data.order_date ?? '').toString().split('T')[0];
          const items = (data.items as any[]).map((it: any) => {
            const qty = Number(it.quantity) || 0;
            const unitPrice = it.unit_price ?? it.unitPrice ?? it.cost_price ?? it.costPrice ?? 0;
            const totalPrice = it.total_price ?? it.totalPrice ?? it.total ?? (qty * Number(unitPrice));
            return {
              ...it,
              productId: it.productId ?? it.product_id,
              productName: it.productName ?? it.product_name,
              quantity: qty,
              unitPrice: Number(unitPrice),
              totalPrice: Number(totalPrice),
              variant: it.variant,
              unit: it.unit
            };
          });
          await applyPurchaseStock(id, items, orderDate, 'subtract', data.supplier_name, data.invoice_number);
        }
      }
      const { error } = await supabase.from('purchases').delete().eq('id', id);
      if (error) {
        if (handleSupabaseError('deletePurchase', error)) return true;
        return false;
      }
      return true;
    } catch (e: any) {
      console.error('[purchaseService] deletePurchase:', e);
      return false;
    }
  },

  async findDuplicatePurchases(): Promise<Purchase[][]> {
    if (!isSupabaseConfigured()) return [];
    const purchases = await this.getPurchases();
    const byKey = new Map<string, Purchase[]>();
    for (const p of purchases) {
      const key = (p.invoiceNumber ?? '').trim().toLowerCase() || `no-invoice-${p.id}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(p);
    }
    return Array.from(byKey.values()).filter(group => group.length > 1);
  },

  async removeDuplicatePurchases(): Promise<{ removed: number; errors: string[] }> {
    const errors: string[] = [];
    let removed = 0;
    if (!isSupabaseConfigured()) return { removed: 0, errors: ['Base de dados não configurada'] };
    try {
      const groups = await this.findDuplicatePurchases();
      for (const group of groups) {
        group.sort((a, b) => {
          const ta = a.updatedAt || a.createdAt || '';
          const tb = b.updatedAt || b.createdAt || '';
          return (tb || '').localeCompare(ta || '');
        });
        const toKeep = group[0];
        for (let i = 1; i < group.length; i++) {
          const id = group[i].id;
          try {
            const ok = await this.deletePurchase(id, true);
            if (ok) removed++;
          } catch (e: any) {
            errors.push(`Compra ${id}: ${e.message || e}`);
          }
        }
      }
      return { removed, errors };
    } catch (e: any) {
      errors.push(e?.message || String(e));
      return { removed, errors };
    }
  },

  async normalizePurchaseProductNames(purchaseId?: string): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;
    if (!isSupabaseConfigured() || !supabase) return { updated: 0, errors: ['Base de dados não configurada'] };
    try {
      const { productService } = await import('./productService');
      const products = await productService.getProducts();
      let purchases: Purchase[];
      if (purchaseId) {
        const { data } = await supabase.from('purchases').select('*').eq('id', purchaseId).maybeSingle();
        purchases = data ? [mapRowToPurchase(data)] : [];
      } else {
        purchases = await this.getPurchases();
      }

      for (const p of purchases) {
        let changed = false;
        const newItems = (p.items || []).map(it => {
          if (!it.productId) return it;
          const product = products.find(pr => pr.id === it.productId);
          if (!product) return it;
          const canonicalName = product.name;
          let canonicalVariant: string | undefined = it.variant;
          if (product.variants?.length) {
            const v = product.variants.find(ev => ev.name === (it.variant || '')) ||
              product.variants.find(ev => ev.isDefault) ||
              product.variants[0];
            if (v) canonicalVariant = v.name;
          } else {
            canonicalVariant = undefined;
          }
          if (it.productName !== canonicalName || it.variant !== canonicalVariant) {
            changed = true;
            return { ...it, productName: canonicalName, variant: canonicalVariant };
          }
          return it;
        });
        if (changed) {
          const row = purchaseToRow({ ...p, items: newItems });
          const { error } = await supabase.from('purchases').update({
            items: row.items,
            updated_at: new Date().toISOString()
          }).eq('id', p.id);
          if (!error) updated++;
          else errors.push(`Compra ${p.id}: ${error.message}`);
        }
      }
      return { updated, errors };
    } catch (e: any) {
      errors.push(e?.message || String(e));
      return { updated, errors };
    }
  }
};
