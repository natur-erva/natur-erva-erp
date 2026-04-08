import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError } from '../../core/services/serviceUtils';
import { User, UserRole } from '../../core/types/types';

export const userService = {
    // ============================================
    // USERS & ROLES
    // ============================================
    async getUsers(): Promise<User[]> {
        if (!isSupabaseConfigured()) return [];
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*, location_id, is_super_admin, location_ids')
                .order('name');

            if (error) {
                if (handleSupabaseError('getUsers', error)) return [];
                throw error;
            }

            return (data || []).map((profile: any) => ({
                id: profile.id,
                name: profile.name || profile.email?.split('@')[0] || 'Usué¡rio',
                email: profile.email || '',
                phone: profile.phone || undefined,
                role: (profile.role as UserRole) || UserRole.STAFF,
                avatar: profile.avatar_url,
                isActive: profile.is_active !== false,
                lastLogin: profile.last_login || undefined,
                locationId: profile.location_id || undefined,
                locationIds: profile.location_ids || [],
                isSuperAdmin: profile.is_super_admin || false
            }));
        } catch (e: any) {
            console.error('Error fetching users:', e);
            return [];
        }
    },
    async getSalesManagers(): Promise<User[]> {
        if (!isSupabaseConfigured()) return [];
        console.log('[getSalesManagers] Iniciando busca de gestores de venda...');

        try {
            // Estratégia 1: Buscar via user_roles (sistema novo)
            let userIdsWithRole: string[] = [];

            try {
                const { data: roleData, error: roleError } = await supabase
                    .from('roles')
                    .select('id, name')
                    .eq('name', 'GESTOR_VENDAS')
                    .maybeSingle();

                if (roleError) {
                    console.warn('[getSalesManagers] Erro ao buscar role:', roleError);
                } else if (roleData) {
                    console.log('[getSalesManagers] Role GESTOR_VENDAS encontrado:', roleData.id);
                    const { data: userRolesData, error: userRolesError } = await supabase
                        .from('user_roles')
                        .select('user_id')
                        .eq('role_id', roleData.id);

                    if (userRolesError) {
                        console.warn('[getSalesManagers] Erro ao buscar user_roles:', userRolesError);
                    } else if (userRolesData) {
                        userIdsWithRole = userRolesData.map((ur: any) => ur.user_id);
                        console.log(`[getSalesManagers] Encontrados ${userIdsWithRole.length} usuários via user_roles`);
                    }
                } else {
                    console.log('[getSalesManagers] Role GESTOR_VENDAS não encontrado na tabela roles');
                }
            } catch (e) {
                console.warn('[getSalesManagers] Exceção ao buscar via user_roles:', e);
            }

            // Estratégia 2: Buscar perfis
            let profilesData: any[] = [];

            if (userIdsWithRole.length > 0) {
                // Buscar perfis dos usuários encontrados via user_roles
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*, location_id, is_super_admin, location_ids')
                    .in('id', userIdsWithRole)
                    .order('name');

                if (error) {
                    console.error('[getSalesManagers] Erro ao buscar perfis via user_roles:', error);
                } else {
                    profilesData = data || [];
                    console.log(`[getSalesManagers] Encontrados ${profilesData.length} perfis via user_roles`);
                }
            }

            // Estratégia 3: Fallback - buscar pelo campo role em profiles
            if (profilesData.length === 0) {
                console.log('[getSalesManagers] Tentando fallback: buscar por campo role em profiles');
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('profiles')
                    .select('*, location_id, is_super_admin, location_ids')
                    .eq('role', 'GESTOR_VENDAS')
                    .order('name');

                if (fallbackError) {
                    console.error('[getSalesManagers] Erro no fallback:', fallbackError);
                } else {
                    profilesData = fallbackData || [];
                    console.log(`[getSalesManagers] Encontrados ${profilesData.length} perfis via campo role`);
                }
            }

            // Mapear para User[]
            const result = profilesData.map((profile: any) => ({
                id: profile.id,
                name: profile.name || profile.email?.split('@')[0] || 'Usué¡rio',
                email: profile.email || '',
                phone: profile.phone || undefined,
                role: UserRole.GESTOR_VENDAS,
                avatar: profile.avatar_url,
                isActive: profile.is_active !== false,
                lastLogin: profile.last_login || undefined,
                locationId: profile.location_id || undefined,
                locationIds: profile.location_ids || [],
                isSuperAdmin: profile.is_super_admin || false
            }));

            console.log(`[getSalesManagers] Retornando ${result.length} gestores de venda:`, result.map(u => u.name));
            return result;
        } catch (e: any) {
            console.error('[getSalesManagers] Erro geral:', e);
            return [];
        }
    },

    /**
     * Retorna utilizadores que aparecem como vendedores (created_by) em pedidos.
     * Usado no filtro de vendedor para mostrar apenas quem criou pedidos.
     */
    async getOrderVendors(): Promise<User[]> {
        if (!isSupabaseConfigured()) return [];
        try {
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders')
                .select('created_by')
                .not('created_by', 'is', null);

            if (ordersError || !ordersData?.length) return [];

            const vendorIds = [...new Set(ordersData.map((o: any) => o.created_by).filter(Boolean))] as string[];
            if (vendorIds.length === 0) return [];

            const { data: profilesData, error: profilesError } = await supabase
                .from('profiles')
                .select('id, name, role, avatar_url, is_active, last_login, location_id, is_super_admin, location_ids, phone')
                .in('id', vendorIds)
                .order('name');

            if (profilesError || !profilesData?.length) return [];

            return profilesData.map((profile: any) => ({
                id: profile.id,
                name: profile.name || 'Usuário',
                email: '',
                phone: profile.phone || undefined,
                role: (profile.role as UserRole) || UserRole.STAFF,
                avatar: profile.avatar_url,
                isActive: profile.is_active !== false,
                lastLogin: profile.last_login || undefined,
                locationId: profile.location_id || undefined,
                locationIds: profile.location_ids || [],
                isSuperAdmin: profile.is_super_admin || false
            }));
        } catch (e: any) {
            console.error('[getOrderVendors] Erro:', e);
            return [];
        }
    },

    async updateUserLocations(
        userId: string,
        locationId?: string | null,
        locationIds?: string[]
    ): Promise<boolean> {
        if (!isSupabaseConfigured() || !supabase) {
            console.error('Supabase néo configurado');
            return false;
        }

        try {
            // Verificar se usué¡rio existe
            const { data: userData, error: userError } = await supabase
                .from('profiles')
                .select('is_super_admin')
                .eq('id', userId)
                .single();

            if (userError || !userData) {
                console.error('Erro ao buscar usué¡rio:', userError);
                return false;
            }

            // Se for Super Admin, néo pode ter locais
            if (userData.is_super_admin) {
                // Forçar location_id = NULL e location_ids = []
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        location_id: null,
                        location_ids: []
                    })
                    .eq('id', userId);

                if (updateError) {
                    console.error('Erro ao atualizar locais do Super Admin:', updateError);
                    return false;
                }
                return true;
            }

            // Validar que locais existem (se fornecidos)
            const allLocationIds: string[] = [];
            if (locationId) {
                allLocationIds.push(locationId);
            }
            if (locationIds && locationIds.length > 0) {
                allLocationIds.push(...locationIds);
            }

            // Remover duplicatas
            const uniqueLocationIds = [...new Set(allLocationIds)].filter(Boolean);

            // Validar que locationId néo esté¡ em locationIds
            if (locationId && locationIds && locationIds.includes(locationId)) {
                console.error('location_id néo pode estar em location_ids');
                return false;
            }

            // Se néo for Super Admin e néo tiver nenhum local, néo permitir (a menos que seja explicitamente null)
            if (uniqueLocationIds.length === 0 && locationId !== null) {
                console.error('Usué¡rio néo-Super Admin deve ter pelo menos um local');
                return false;
            }

            // Verificar se todos os locais existem
            if (uniqueLocationIds.length > 0) {
                const { data: locationsData, error: locationsError } = await supabase
                    .from('locations')
                    .select('id')
                    .in('id', uniqueLocationIds);

                if (locationsError) {
                    console.error('Erro ao verificar locais:', locationsError);
                    return false;
                }

                const foundLocationIds = (locationsData || []).map((loc: any) => loc.id);
                const missingLocations = uniqueLocationIds.filter(id => !foundLocationIds.includes(id));

                if (missingLocations.length > 0) {
                    console.error('Locais néo encontrados:', missingLocations);
                    return false;
                }
            }

            // Preparar dados para atualizaçéo
            const updates: any = {
                updated_at: new Date().toISOString()
            };

            if (locationId !== undefined) {
                updates.location_id = locationId;
            }

            if (locationIds !== undefined) {
                updates.location_ids = locationIds;
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId);

            if (updateError) {
                console.error('Erro ao atualizar locais do usué¡rio:', updateError);
                return false;
            }

            return true;
        } catch (e: any) {
            console.error('Erro ao atualizar locais do usué¡rio:', e);
            return false;
        }
    }
};
