
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { Customer, LoyaltyTier, Order } from '../../core/types/types';
import { getOrSetCache, handleSupabaseError, isUuid, normalizeBaseName } from '../../core/services/serviceUtils';

export const customerService = {
    async getCustomers(): Promise<Customer[]> {
        return getOrSetCache('customers', async () => {
            if (isSupabaseConfigured() && supabase) {
                try {
                    const { data, error } = await supabase
                        .from('customers')
                        .select('*')
                        .order('name');

                    if (error) {
                        handleSupabaseError('GetCustomers', error);
                        return [];
                    }

                    return (data || []).map((c: any) => ({
                        id: c.id,
                        name: c.name,
                        phone: c.phone,
                        email: c.email,
                        address: c.address,
                        totalOrders: c.total_orders,
                        totalSpent: c.total_spent,
                        tier: c.tier,
                        lastOrderDate: c.last_order_date
                    })) as Customer[];
                } catch (error: any) {
                    console.error('[getCustomers] Erro:', error);
                    handleSupabaseError('GetCustomers', error);
                    return [];
                }
            }
            return Promise.resolve([]);
        });
    },
    async getCustomersCount(): Promise<number> {
        if (!isSupabaseConfigured() || !supabase) return 0;
        try {
            const { count, error } = await supabase
                .from('customers')
                .select('*', { count: 'exact', head: true });
            if (error) {
                handleSupabaseError('GetCustomersCount', error);
                return 0;
            }
            return count ?? 0;
        } catch (error: any) {
            console.error('[getCustomersCount] Erro:', error);
            return 0;
        }
    },
    async addCustomer(customer: Omit<Customer, 'id' | 'totalOrders' | 'totalSpent' | 'tier' | 'lastOrderDate'>): Promise<Customer | null> {
        if (isSupabaseConfigured() && supabase) {
            const cleanPhone = (customer.phone || '').replace(/\D/g, '');
            const phoneToSave = cleanPhone.length > 5
                ? cleanPhone
                : `no_phone_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

            const dbCustomer = {
                name: customer.name,
                phone: phoneToSave,
                email: customer.email || null,
                address: customer.address || null,
                total_orders: 0,
                total_spent: 0,
                tier: LoyaltyTier.BRONZE,
                last_order_date: null
            };

            const { data, error } = await supabase
                .from('customers')
                .insert(dbCustomer)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    console.error('Cliente com este telefone já existe');
                    return null;
                }
                console.error('Error creating customer:', error.message);
                return null;
            }

            if (data) {
                return {
                    id: data.id,
                    name: data.name,
                    phone: data.phone,
                    email: data.email,
                    address: data.address,
                    totalOrders: data.total_orders,
                    totalSpent: data.total_spent,
                    tier: data.tier,
                    lastOrderDate: data.last_order_date
                };
            }
        }
        return null;
    },
    async updateCustomer(customerId: string, updates: Partial<Customer>): Promise<boolean> {
        if (!isUuid(customerId)) return false;
        if (isSupabaseConfigured() && supabase) {
            const dbUpdates: any = {};

            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.phone !== undefined) {
                const cleanPhone = updates.phone.replace(/\D/g, '');
                dbUpdates.phone = cleanPhone.length > 5 ? cleanPhone : dbUpdates.phone;
            }
            if (updates.email !== undefined) dbUpdates.email = updates.email;
            if (updates.address !== undefined) dbUpdates.address = updates.address;
            if (updates.tier !== undefined) dbUpdates.tier = updates.tier;
            if (updates.lastOrderDate !== undefined) {
                if (updates.lastOrderDate === '' || !updates.lastOrderDate) {
                    dbUpdates.last_order_date = null;
                } else {
                    const date = new Date(updates.lastOrderDate);
                    if (isNaN(date.getTime())) {
                        console.error('Invalid date format:', updates.lastOrderDate);
                        dbUpdates.last_order_date = null;
                    } else {
                        dbUpdates.last_order_date = date.toISOString();
                    }
                }
            }
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

            const { error } = await supabase
                .from('customers')
                .update(dbUpdates)
                .eq('id', customerId);

            if (error) {
                console.error('Error updating customer:', error.message);
                return false;
            }
            return true;
        }
        return false;
    },
    async deleteCustomer(customerId: string): Promise<boolean> {
        if (!isUuid(customerId)) return true;
        if (isSupabaseConfigured() && supabase) {
            const { error } = await supabase.from('customers').delete().eq('id', customerId);
            if (error) {
                console.error('Error deleting customer:', error.message);
                return false;
            }
        }
        return true;
    },
    async deleteCustomers(customerIds: string[]): Promise<boolean> {
        const validUuids = customerIds.filter(id => isUuid(id));
        if (isSupabaseConfigured() && supabase && validUuids.length > 0) {
            const { error } = await supabase.from('customers').delete().in('id', validUuids);
            if (error) {
                console.error('Error deleting customers:', error.message);
                return false;
            }
        }
        return true;
    },
    async recalculateAllLastOrderDates(): Promise<{ updated: number; errors: string[] }> {
        if (!isSupabaseConfigured() || !supabase) {
            return { updated: 0, errors: ['Supabase não conectado'] };
        }

        try {
            // Direct supabase access to avoid circular dependency
            const { data: ordersData } = await supabase.from('orders').select('customer_id, created_at');
            const allCustomers = await this.getCustomers();
            let updated = 0;
            const errors: string[] = [];

            // Map orders to local format for logic
            const allOrders = (ordersData || []).map((o: any) => ({
                customerId: o.customer_id,
                createdAt: o.created_at
            }));

            for (const customer of allCustomers) {
                try {
                    const customerOrders = allOrders.filter((o: any) => o.customerId === customer.id);
                    if (customerOrders.length > 0) {
                        const mostRecentOrder = customerOrders.reduce((latest: any, order: any) => {
                            const orderDate = new Date(order.createdAt);
                            const latestDate = new Date(latest.createdAt);
                            return orderDate > latestDate ? order : latest;
                        });

                        const mostRecentDate = new Date(mostRecentOrder.createdAt);
                        const currentLastOrderDate = customer.lastOrderDate ? new Date(customer.lastOrderDate) : null;

                        const mostRecentDateOnly = new Date(mostRecentDate.getFullYear(), mostRecentDate.getMonth(), mostRecentDate.getDate());
                        const currentDateOnly = currentLastOrderDate
                            ? new Date(currentLastOrderDate.getFullYear(), currentLastOrderDate.getMonth(), currentLastOrderDate.getDate())
                            : null;

                        if (!currentDateOnly || mostRecentDateOnly.getTime() !== currentDateOnly.getTime()) {
                            const success = await this.updateCustomer(customer.id, {
                                lastOrderDate: mostRecentOrder.createdAt
                            });
                            if (success) updated++;
                            else errors.push(`Erro ao atualizar ${customer.name}`);
                        }
                    } else {
                        if (customer.lastOrderDate) {
                            const success = await this.updateCustomer(customer.id, {
                                lastOrderDate: ''
                            });
                            if (success) updated++;
                        }
                    }
                } catch (error: any) {
                    errors.push(`Erro ao processar ${customer.name}: ${error.message}`);
                }
            }

            return { updated, errors };
        } catch (error: any) {
            return { updated: 0, errors: [`Erro geral: ${error.message}`] };
        }
    },
    async mergeCustomers(primaryCustomerId: string, duplicateCustomerId: string): Promise<{ success: boolean; ordersTransferred: number; error?: string }> {
        if (!isSupabaseConfigured() || !supabase) {
            return { success: false, ordersTransferred: 0, error: 'Supabase não conectado' };
        }

        if (!isUuid(primaryCustomerId) || !isUuid(duplicateCustomerId)) {
            return { success: false, ordersTransferred: 0, error: 'IDs de clientes inválidos' };
        }

        if (primaryCustomerId === duplicateCustomerId) {
            return { success: false, ordersTransferred: 0, error: 'Não é possível mesclar o mesmo cliente' };
        }

        try {
            const { data: customers, error: customersError } = await supabase
                .from('customers')
                .select('*')
                .in('id', [primaryCustomerId, duplicateCustomerId]);

            if (customersError || !customers || customers.length !== 2) {
                return { success: false, ordersTransferred: 0, error: 'Erro ao buscar clientes' };
            }

            const primaryCustomer = customers.find(c => c.id === primaryCustomerId);
            const duplicateCustomer = customers.find(c => c.id === duplicateCustomerId);

            if (!primaryCustomer || !duplicateCustomer) {
                return { success: false, ordersTransferred: 0, error: 'Cliente não encontrado' };
            }

            const { data: duplicateOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('customer_id', duplicateCustomerId);

            if (ordersError) {
                return { success: false, ordersTransferred: 0, error: `Erro ao buscar pedidos: ${ordersError.message}` };
            }

            const ordersToTransfer = duplicateOrders || [];
            let ordersTransferred = 0;

            if (ordersToTransfer.length > 0) {
                const { error: updateOrdersError } = await supabase
                    .from('orders')
                    .update({
                        customer_id: primaryCustomerId,
                        customer_name: primaryCustomer.name,
                        customer_phone: primaryCustomer.phone
                    })
                    .eq('customer_id', duplicateCustomerId);

                if (updateOrdersError) {
                    return { success: false, ordersTransferred: 0, error: `Erro ao transferir pedidos: ${updateOrdersError.message}` };
                }
                ordersTransferred = ordersToTransfer.length;
            }

            // Recalculate directly via Supabase aggregation to avoid loading all orders
            const { data: primaryOrders } = await supabase
                .from('orders')
                .select('total_amount, created_at')
                .eq('customer_id', primaryCustomerId);

            const newTotalOrders = (primaryOrders || []).length;
            const newTotalSpent = (primaryOrders || []).reduce((sum: number, o: any) => sum + Number(o.total_amount), 0);

            let mostRecentDate: string | null = null;
            if (primaryOrders && primaryOrders.length > 0) {
                primaryOrders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                mostRecentDate = primaryOrders[0].created_at;
            }

            const calculateTier = (orders: number, spent: number): string => {
                if (orders > 15 || spent > 20000) return LoyaltyTier.GOLD;
                if (orders > 5 || spent > 5000) return LoyaltyTier.SILVER;
                return LoyaltyTier.BRONZE;
            };

            const newTier = calculateTier(newTotalOrders, newTotalSpent);

            const { error: updateError } = await supabase
                .from('customers')
                .update({
                    total_orders: newTotalOrders,
                    total_spent: newTotalSpent,
                    tier: newTier,
                    last_order_date: mostRecentDate
                })
                .eq('id', primaryCustomerId);

            if (updateError) {
                return { success: false, ordersTransferred, error: `Erro ao atualizar cliente principal: ${updateError.message}` };
            }

            if (duplicateCustomer.notes && duplicateCustomer.notes.trim()) {
                const existingNotes = primaryCustomer.notes || '';
                const mergedNotes = existingNotes
                    ? `${existingNotes}\n\n--- Mesclado de ${duplicateCustomer.name} ---\n${duplicateCustomer.notes}`
                    : duplicateCustomer.notes;

                await supabase
                    .from('customers')
                    .update({ notes: mergedNotes })
                    .eq('id', primaryCustomerId);
            }

            const { error: deleteError } = await supabase
                .from('customers')
                .delete()
                .eq('id', duplicateCustomerId);

            if (deleteError) {
                return { success: false, ordersTransferred, error: `Erro ao deletar cliente duplicado: ${deleteError.message}` };
            }

            return { success: true, ordersTransferred };
        } catch (error: any) {
            return { success: false, ordersTransferred: 0, error: error.message || 'Erro desconhecido' };
        }
    },
    findCustomerByNameOrPhone(name: string, phone: string, customers: Customer[]): Customer | null {
        const normalizedName = normalizeBaseName(name);
        const cleanPhone = phone.replace(/\D/g, '');

        return customers.find(c => {
            // Match por telefone (se tiver pelo menos 8 dígitos para evitar falsos positivos curtos)
            if (cleanPhone.length >= 8 && c.phone) {
                const cPhone = c.phone.replace(/\D/g, '');
                if (cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone)) {
                    return true;
                }
            }

            // Match por nome
            const cName = normalizeBaseName(c.name);
            return cName === normalizedName || cName.includes(normalizedName) || normalizedName.includes(cName);
        }) || null;
    }
};
