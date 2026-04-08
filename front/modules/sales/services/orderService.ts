import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError, calculateTier, extractLocalDate, parseProductName, normalizeVariantForMovement, clearCache, isUuid } from '../../core/services/serviceUtils';
import { Customer, Order, OrderItem, OrderStatus, Product, StockItem, StockMovement } from '../../core/types/types';
import { customerService } from '../../customers/services/customerService';
import { stockService } from '../../products/services/stockService';
import { getTodayDateString } from '../../core/utils/dateUtils';


function mapRowToOrder(row: any): Order {
    return {
        id: row.id,
        externalId: row.external_id,
        orderNumber: row.order_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        items: row.items || [],
        totalAmount: Number(row.total_amount) || 0,
        status: row.status,
        source: row.source,
        isDelivery: !!row.is_delivery,
        deliveryLocation: row.delivery_location,
        deliveryFee: Number(row.delivery_fee) || 0,
        paymentStatus: row.payment_status || 'unpaid',
        amountPaid: Number(row.amount_paid) || 0,
        paymentProof: row.payment_proof,
        paymentProofText: row.payment_proof_text,
        notes: row.notes,
        createdAt: row.created_at,
        createdBy: row.created_by,
        createdByName: row.profiles?.name || undefined,
        deliveryZoneId: row.delivery_zone_id,
        deliveryZoneName: row.delivery_zone_name,
        deliveryLatitude: row.delivery_latitude,
        deliveryLongitude: row.delivery_longitude,
        deliveryAddressFormatted: row.delivery_address_formatted
    };
}

export const orderService = {

    async getOrders(): Promise<Order[]> {
        if (!isSupabaseConfigured() || !supabase) return [];
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*, profiles:created_by(name)')
                .order('created_at', { ascending: false });
            if (error) {
                if (handleSupabaseError('getOrders', error)) return [];
                throw error;
            }
            return (data || []).map(mapRowToOrder);
        } catch (e: any) {
            console.error('Error getOrders:', e);
            return [];
        }
    },

    async getOrdersCount(): Promise<number> {
        if (!isSupabaseConfigured() || !supabase) return 0;
        try {
            const { count, error } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true });
            if (error) {
                if (handleSupabaseError('getOrdersCount', error)) return 0;
                return 0;
            }
            return count ?? 0;
        } catch (e: any) {
            console.error('Error getOrdersCount:', e);
            return 0;
        }
    },

    async getNextOrderNumber(): Promise<string> {
        if (isSupabaseConfigured() && supabase) {
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('order_number')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (error) {
                    console.error('Error fetching latest order:', error);
                    return '1';
                }

                if (!data || data.length === 0) {
                    return '1';
                }

                let maxNumber = 0;
                for (const order of data) {
                    if (order.order_number) {
                        const numericPart = order.order_number.toString().replace(/\D/g, '');
                        if (numericPart) {
                            const num = parseInt(numericPart, 10);
                            if (!isNaN(num) && num > maxNumber) {
                                maxNumber = num;
                            }
                        }
                    }
                }

                const nextNumber = maxNumber + 1;
                return nextNumber.toString();
            } catch (e: any) {
                console.error('Error getting next order number:', e);
                return '1';
            }
        }
        return '1';
    },

    async checkOrderNumberExists(orderNumber: string): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase || !orderNumber?.trim()) return false;
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('id')
                .eq('order_number', orderNumber.trim())
                .limit(1)
                .maybeSingle();
            if (error) {
                console.error('Error checking order number:', error);
                return false;
            }
            return !!data;
        } catch (e: any) {
            console.error('Error checkOrderNumberExists:', e);
            return false;
        }
    },

    async createOrder(order: Order): Promise<{ order: Order | null; customerCreated: boolean; customerUpdated: boolean }> {
        if (isSupabaseConfigured() && supabase) {
            try {
                // Adicionar location_id automaticamente se não for Super Admin
                // TODO: Access authService properly or pass user context
                // const user = await authService.getCurrentUser(); 
                // if (!user?.isSuperAdmin && user?.locationId && !order.locationId) {
                //   order.locationId = user.locationId;
                // }

                let customerId = order.customerId;
                let customerCreated = false;
                let customerUpdated = false;

                const rawPhone = order.customerPhone || '';
                let cleanPhone = rawPhone.replace(/\D/g, '');
                const hasPhone = cleanPhone.length > 5;
                const phoneToSave = hasPhone ? cleanPhone : `no_phone_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                // 1. Try to find Existing Customer
                let existingCust = null;

                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    console.warn('⚠️ Nenhuma sessão encontrada ao criar pedido.');
                }

                if (hasPhone) {
                    const { data, error: selectError } = await supabase.from('customers').select('id, total_orders, total_spent, last_order_date').eq('phone', cleanPhone).maybeSingle();
                    if (selectError) console.warn('Erro ao buscar cliente por telefone:', selectError);
                    existingCust = data;
                }

                if (!existingCust && order.customerName) {
                    const { data, error: selectError } = await supabase.from('customers').select('id, total_orders, total_spent, last_order_date').eq('name', order.customerName).maybeSingle();
                    if (selectError) console.warn('Erro ao buscar cliente por nome:', selectError);
                    existingCust = data;
                }

                if (existingCust) {
                    customerId = existingCust.id;
                    customerUpdated = true;
                    const newTotalOrders = (existingCust.total_orders || 0) + 1;
                    const newTotalSpent = (existingCust.total_spent || 0) + order.totalAmount;

                    const orderDate = new Date(order.createdAt);
                    const existingLastOrderDate = existingCust.last_order_date ? new Date(existingCust.last_order_date) : null;
                    const mostRecentDate = (!existingLastOrderDate || orderDate > existingLastOrderDate)
                        ? order.createdAt
                        : existingLastOrderDate.toISOString();

                    // Fire and forget update
                    supabase.from('customers').update({
                        total_orders: newTotalOrders,
                        total_spent: newTotalSpent,
                        tier: calculateTier(newTotalOrders, newTotalSpent),
                        last_order_date: mostRecentDate
                    }).eq('id', customerId);

                } else {
                    // Create new customer
                    customerCreated = true;
                    const newTotalOrders = 1;
                    const newTotalSpent = order.totalAmount;

                    const { data: newCust, error: custError } = await supabase.from('customers').insert({
                        name: order.customerName,
                        phone: phoneToSave,
                        total_orders: newTotalOrders,
                        total_spent: newTotalSpent,
                        tier: calculateTier(newTotalOrders, newTotalSpent),
                        last_order_date: order.createdAt,
                        address: order.deliveryLocation || 'Desconhecido'
                    }).select().single();

                    if (custError) {
                        console.error('Error creating customer:', custError.message);
                        // Handle duplicates / RLS errors logic here if needed (simplified from dataService)
                        if (custError.code === '23505') {
                            // Retry logic simplified
                            const { data: retryCust } = await supabase.from('customers').select('id').eq('phone', cleanPhone).maybeSingle();
                            if (retryCust) {
                                customerId = retryCust.id;
                                customerCreated = false;
                                customerUpdated = true;
                            } else {
                                return { order: null, customerCreated: false, customerUpdated: false };
                            }
                        } else {
                            return { order: null, customerCreated: false, customerUpdated: false };
                        }
                    } else if (newCust) {
                        customerId = newCust.id;
                        // Clear cache
                        clearCache('customers');
                    }
                }

                if (!customerId || !isUuid(customerId)) {
                    console.error(`Cannot create order: Invalid Customer ID.`);
                    return { order: null, customerCreated: false, customerUpdated: false };
                }

                let orderNumber = order.orderNumber;
                if (!orderNumber || orderNumber.trim() === '') {
                    orderNumber = await this.getNextOrderNumber();
                }

                // 2. Create Order
                const dbOrder: any = {
                    external_id: order.externalId,
                    order_number: orderNumber,
                    customer_id: customerId,
                    customer_name: order.customerName,
                    customer_phone: hasPhone ? cleanPhone : '',
                    items: order.items,
                    total_amount: order.totalAmount,
                    status: order.status,
                    location_id: order.locationId || null, // Should come from context or input
                    source: order.source,
                    is_delivery: order.isDelivery,
                    delivery_location: order.deliveryLocation,
                    delivery_fee: order.deliveryFee || 0,
                    payment_status: order.paymentStatus || 'unpaid',
                    amount_paid: order.amountPaid || 0,
                    payment_proof: order.paymentProof,
                    payment_proof_text: order.paymentProofText,
                    notes: order.notes,
                    created_at: order.createdAt || new Date().toISOString(),
                    created_by: order.createdBy || null
                };

                if (order.deliveryZoneId) dbOrder.delivery_zone_id = order.deliveryZoneId;
                if (order.deliveryZoneName) dbOrder.delivery_zone_name = order.deliveryZoneName;
                if (order.deliveryLatitude !== undefined) dbOrder.delivery_latitude = order.deliveryLatitude;
                if (order.deliveryLongitude !== undefined) dbOrder.delivery_longitude = order.deliveryLongitude;
                if (order.deliveryAddressFormatted) dbOrder.delivery_address_formatted = order.deliveryAddressFormatted;

                const { data, error } = await supabase.from('orders').insert(dbOrder).select().single();

                if (error) {
                    console.error("Supabase Orders Error:", error.message);
                    return { order: null, customerCreated, customerUpdated };
                }

                if (data) {
                    const createdOrder = {
                        ...order,
                        id: data.id,
                        customerId: customerId,
                        orderNumber: orderNumber,
                        createdBy: order.createdBy || data.created_by || undefined,
                        createdByName: order.createdByName || undefined
                    };

                    // Stock: dedução feita uma única vez em processStockMovementItems ao criar o movimento (evitar dupla aplicação)
                    if ((order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED) && order.items && order.items.length > 0) {
                        try {
                            const BASE_DATE = new Date('2026-01-18');
                            BASE_DATE.setHours(0, 0, 0, 0);
                            const orderDateStr = extractLocalDate(createdOrder.createdAt);
                            const orderDate = new Date(orderDateStr);
                            orderDate.setHours(0, 0, 0, 0);

                            if (orderDate >= BASE_DATE) {
                                // Create stock transactions
                                // Need products for costPrice. 
                                // We can fetch product variant details here or inside loop.
                                // Optimization: batch fetch or just loop.

                                // NOTA: Transações de stock são criadas automaticamente pelo stockService.ensureStockMovement
                                // através do método processStockMovementItems. Não criar manualmente aqui para evitar duplicados.

                                // Stock Movement: sempre gravar nome base + variante canónicos para alinhar com Gestão de Stock
                                const stockItems: StockItem[] = order.items
                                    .filter(item => item.quantity > 0)
                                    .map(item => {
                                        const parsed = parseProductName(item.productName || '');
                                        const baseName = parsed.baseName || (item.productName || '').trim();
                                        const variant = normalizeVariantForMovement(item.variantName || parsed.variant || undefined);
                                        return {
                                            productId: item.productId,
                                            productName: baseName,
                                            variant,
                                            quantity: -Math.abs(item.quantity),
                                            unit: item.unit || 'un'
                                        };
                                    });

                                if (stockItems.length > 0) {
                                    const customerInfo = order.customerName ? ` (${order.customerName})` : '';
                                    const stockMovement: StockMovement = {
                                        id: '',
                                        date: getTodayDateString(), // Usar data actual (entrega), não data de criação
                                        items: stockItems,
                                        notes: `Saída de stock via pedido ${orderNumber || data.id}${customerInfo}`,
                                        sourceReference: { type: 'order', id: data.id },
                                        createdAt: new Date().toISOString()
                                    };
                                    await stockService.ensureStockMovement(stockMovement);
                                }
                            }
                        } catch (stockError: any) {
                            console.error('[CreateOrder] Erro ao deduzir stock:', stockError);
                        }
                    }

                    // TODO: Delivery Tracking Creation (omitted)

                    return {
                        order: createdOrder,
                        customerCreated,
                        customerUpdated
                    };
                }
            } catch (e: any) {
                console.error("Unexpected error in createOrder:", e.message);
                return { order: null, customerCreated: false, customerUpdated: false };
            }
        }
        return { order, customerCreated: false, customerUpdated: false };
    },
    async updateOrder(orderId: string, updates: Partial<Order>): Promise<boolean> {
        // Check if existing order is fetched first to know current status
        if (isSupabaseConfigured() && supabase) {
            const { data: existingOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();
            if (!existingOrder) return false;

            const dbUpdates: any = {};
            if (updates.status !== undefined) dbUpdates.status = updates.status;
            if (updates.totalAmount !== undefined) dbUpdates.total_amount = updates.totalAmount;
            if (updates.items !== undefined) dbUpdates.items = updates.items;
            if (updates.createdAt !== undefined) dbUpdates.created_at = updates.createdAt;
            if (updates.customerName !== undefined) dbUpdates.customer_name = updates.customerName;
            if (updates.customerPhone !== undefined) dbUpdates.customer_phone = updates.customerPhone;
            if (updates.isDelivery !== undefined) dbUpdates.is_delivery = updates.isDelivery;
            if (updates.deliveryLocation !== undefined) dbUpdates.delivery_location = updates.deliveryLocation;
            if (updates.deliveryFee !== undefined) dbUpdates.delivery_fee = updates.deliveryFee;
            if (updates.paymentStatus !== undefined) dbUpdates.payment_status = updates.paymentStatus;
            if (updates.amountPaid !== undefined) dbUpdates.amount_paid = updates.amountPaid;
            if (updates.paymentProof !== undefined) dbUpdates.payment_proof = updates.paymentProof;
            if (updates.paymentProofText !== undefined) dbUpdates.payment_proof_text = updates.paymentProofText;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
            if (updates.deliveryZoneId !== undefined) dbUpdates.delivery_zone_id = updates.deliveryZoneId;
            if (updates.deliveryZoneName !== undefined) dbUpdates.delivery_zone_name = updates.deliveryZoneName;
            if (updates.deliveryLatitude !== undefined) dbUpdates.delivery_latitude = updates.deliveryLatitude;
            if (updates.deliveryLongitude !== undefined) dbUpdates.delivery_longitude = updates.deliveryLongitude;
            if (updates.deliveryAddressFormatted !== undefined) dbUpdates.delivery_address_formatted = updates.deliveryAddressFormatted;
            if (updates.createdBy !== undefined) dbUpdates.created_by = updates.createdBy;

            const wasDelivered = existingOrder.status === OrderStatus.DELIVERED || existingOrder.status === OrderStatus.COMPLETED;
            const willBeDelivered = updates.status === undefined
                ? wasDelivered
                : (updates.status === OrderStatus.DELIVERED || updates.status === OrderStatus.COMPLETED);

            const isChangingToDelivered = willBeDelivered && !wasDelivered;
            const isChangingFromDelivered = wasDelivered && !willBeDelivered;
            const isItemsChanging = updates.items !== undefined && wasDelivered && willBeDelivered;

            const orderNumber = existingOrder.order_number || orderId;
            // Usar data actual (entrega) quando muda para Entregue, senão usa data do pedido
            const orderDateStr = isChangingToDelivered 
                ? getTodayDateString() 
                : extractLocalDate(updates.createdAt || existingOrder.created_at);
            const customerName = updates.customerName ?? existingOrder.customer_name;

            try {
                // Caso 1: Mudando DE Entregue para outro status - restaurar stock
                if (isChangingFromDelivered) {
                    // Buscar e remover movimentos relacionados - o deleteStockMovement já reverte o stock e remove transações
                    const movements = await stockService.getStockMovements();
                    const orderMovements = movements.filter(m =>
                        m.sourceReference?.type === 'order' && m.sourceReference?.id === orderId
                    );
                    for (const m of orderMovements) {
                        await stockService.deleteStockMovement(m.id);
                    }
                    console.log(`[updateOrder] Stock restaurado para pedido ${orderNumber} (status mudou de Entregue)`);
                }

                // Caso 2: Mudando PARA Entregue - deduzir stock
                if (isChangingToDelivered) {
                    const orderItems = (updates.items || existingOrder.items || []) as OrderItem[];
                    if (orderItems.length > 0) {
                        // Deduzir stock e criar registos (via ensureStockMovement chamado dentro de _createStockRecordsForOrder)
                        await this._createStockRecordsForOrder(orderId, orderNumber, orderDateStr, orderItems, customerName);
                    }
                }

                // Caso 3: Items mudaram em pedido que ja estava Entregue - ajustar diferenca
                if (isItemsChanging) {
                    const newItems = (updates.items || []) as OrderItem[];

                    // Remover transacoes e movimentos antigos - stockService.deleteStockMovement reverte o stock automaticamente
                    // await supabase.from('stock_transactions').delete().eq('source_id', orderId).eq('source_type', 'order'); // Já tratado por deleteStockMovement

                    const movements = await stockService.getStockMovements();
                    const orderMovements = movements.filter(m =>
                        m.sourceReference?.type === 'order' && m.sourceReference?.id === orderId
                    );
                    for (const m of orderMovements) {
                        await stockService.deleteStockMovement(m.id);
                    }

                    // Criar novos registos de stock (deduz e cria transações)
                    await this._createStockRecordsForOrder(orderId, orderNumber, orderDateStr, newItems, customerName);
                    console.log(`[updateOrder] Stock atualizado para pedido ${orderNumber} (items alterados)`);
                }
            } catch (stockError: any) {
                console.error('[updateOrder] Erro ao processar stock:', stockError);
            }

            const { error } = await supabase.from('orders').update(dbUpdates).eq('id', orderId);
            if (error) return false;

            return true;
        }
        return false;
    },

    /**
     * Helper para criar transacoes e movimentos de stock para um pedido.
     * Chamado ao criar pedido já entregue e ao marcar pedido como entregue (updateOrder).
     * NOTA: A filtragem por data do stock inicial é feita no stockIntegrityService.
     * Se a dedução de stock (adjustVariantStock) tiver sido feita antes e ensureStockMovement falhar,
     * fica "movimento em falta" e discrepância; a correção pode ser feita via Validação de Integridade
     * (Corrigir movimentos em falta / Corrigir discrepâncias). Opcional futuro: rollback da dedução ou retry.
     */
    async _createStockRecordsForOrder(
        orderId: string,
        orderNumber: string,
        orderDateStr: string,
        orderItems: OrderItem[],
        customerName?: string
    ): Promise<void> {

        // NOTA: Transações de stock são criadas automaticamente pelo stockService.ensureStockMovement
        // através do método processStockMovementItems. Não criar manualmente aqui para evitar duplicados.

        // Criar movimento de stock
        const stockItems: StockItem[] = orderItems
            .filter(item => item.quantity > 0)
            .map(item => {
                const parsed = parseProductName(item.productName || '');
                const baseName = parsed.baseName || (item.productName || '').trim();
                const variant = normalizeVariantForMovement(item.variantName || parsed.variant || undefined);
                return {
                    productId: item.productId,
                    productName: baseName,
                    variant,
                    quantity: -Math.abs(item.quantity),
                    unit: item.unit || 'un'
                };
            });

        if (stockItems.length > 0) {
            const customerInfo = customerName ? ` (${customerName})` : '';
            const stockMovement: StockMovement = {
                id: '',
                date: orderDateStr,
                items: stockItems,
                notes: `Saída de stock via pedido ${orderNumber}${customerInfo}`,
                sourceReference: { type: 'order', id: orderId },
                createdAt: new Date().toISOString()
            };
            await stockService.ensureStockMovement(stockMovement);
        }
    },
    async deleteOrder(orderId: string): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase) return false;

        // Get order to check status and restore stock if needed
        const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (order && (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED)) {
            try {
                const movements = await stockService.getStockMovements();
                const orderMovements = movements.filter(m =>
                    m.sourceReference?.type === 'order' && m.sourceReference?.id === orderId
                );
                for (const m of orderMovements) {
                    await stockService.deleteStockMovement(m.id);
                }
            } catch (e) {
                console.warn('[deleteOrder] Erro ao remover movimentos:', e);
            }
        }

        const { error } = await supabase.from('orders').delete().eq('id', orderId);
        return !error;
    },

    async deleteOrders(orderIds: string[]): Promise<{ success: boolean; deleted: number; errors: string[] }> {
        const errors: string[] = [];
        let deleted = 0;
        for (const id of orderIds) {
            try {
                const ok = await this.deleteOrder(id);
                if (ok) deleted++;
                else errors.push(`Pedido ${id.substring(0, 8)}... não foi apagado.`);
            } catch (e: any) {
                errors.push(e?.message || `Erro ao apagar pedido ${id.substring(0, 8)}...`);
            }
        }
        return { success: errors.length === 0, deleted, errors };
    },

    async findDuplicateOrders(): Promise<Order[][]> {
        if (!isSupabaseConfigured()) return [];
        const orders = await this.getOrders();
        const byKey = new Map<string, Order[]>();
        for (const o of orders) {
            const orderNum = (o.orderNumber ?? '').trim();
            const datePart = (o.createdAt ?? '').toString().split('T')[0];
            const key = orderNum ? `${orderNum}-${datePart}` : `no-number-${o.id}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(o);
        }
        return Array.from(byKey.values()).filter(group => group.length > 1);
    },

    async removeDuplicateOrders(): Promise<{ removed: number; errors: string[] }> {
        const errors: string[] = [];
        let removed = 0;
        if (!isSupabaseConfigured()) return { removed: 0, errors: ['Base de dados não configurada'] };
        try {
            const groups = await this.findDuplicateOrders();
            for (const group of groups) {
                group.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
                const toKeep = group[0];
                for (let i = 1; i < group.length; i++) {
                    const id = group[i].id;
                    try {
                        const ok = await this.deleteOrder(id);
                        if (ok) removed++;
                    } catch (e: any) {
                        errors.push(`Pedido ${id}: ${e.message || e}`);
                    }
                }
            }
            return { removed, errors };
        } catch (e: any) {
            errors.push(e?.message || String(e));
            return { removed, errors };
        }
    },

    async normalizeOrderProductNames(orderId?: string): Promise<{ updated: number; errors: string[] }> {
        const errors: string[] = [];
        let updated = 0;
        if (!isSupabaseConfigured() || !supabase) return { updated: 0, errors: ['Base de dados não configurada'] };
        try {
            const { productService } = await import('../../products/services/productService');
            const products = await productService.getProducts();
            let orders: Order[];
            if (orderId) {
                const { data } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
                orders = data ? [mapRowToOrder(data)] : [];
            } else {
                orders = await this.getOrders();
            }
            for (const o of orders) {
                const items = (o.items || []) as OrderItem[];
                let changed = false;
                const newItems = items.map(it => {
                    if (!it.productId) return it;
                    const product = products.find(pr => pr.id === it.productId);
                    if (!product) return it;
                    const canonicalName = product.name;
                    let canonicalVariantName: string | undefined = it.variantName;
                    if (product.variants?.length) {
                        const v = product.variants.find(ev => ev.id === it.variantId) ||
                            product.variants.find(ev => ev.name === (it.variantName || '')) ||
                            product.variants.find(ev => ev.isDefault) ||
                            product.variants[0];
                        if (v) canonicalVariantName = v.name;
                    } else {
                        canonicalVariantName = undefined;
                    }
                    if (it.productName !== canonicalName || it.variantName !== canonicalVariantName) {
                        changed = true;
                        return { ...it, productName: canonicalName, variantName: canonicalVariantName };
                    }
                    return it;
                });
                if (changed) {
                    const { error } = await supabase.from('orders').update({
                        items: newItems,
                        updated_at: new Date().toISOString()
                    }).eq('id', o.id);
                    if (!error) updated++;
                    else errors.push(`Pedido ${o.id}: ${error.message}`);
                }
            }
            return { updated, errors };
        } catch (e: any) {
            errors.push(e?.message || String(e));
            return { updated, errors };
        }
    }
};
