import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { 
  DeliveryZone
} from '../../core/types/types';

// Helper to handle Supabase errors gracefully
const handleSupabaseError = (context: string, error: any) => {
  if (error?.code === '42P01') {
    console.warn(`[${context}] Tabela não encontrada no Supabase. Execute o SQL de migration.`);
    return true;
  }
  if (error?.code === '42703') {
    console.warn(`[${context}] Coluna em falta no banco de dados. Atualize o Schema.`, error.message);
    return true;
  }
  console.error(`[${context}] Erro:`, error.message || error);
  return false;
};

export const deliveryService = {
  // ============================================
  // ZONAS DE ENTREGA
  // ============================================

  /**
   * Buscar todas as zonas de entrega ativas
   */
  async getDeliveryZones(): Promise<DeliveryZone[]> {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn('Supabase não configurado. Não é possível carregar zonas de entrega.');
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) {
        // Erro específico de RLS (PGRST301 ou 406)
        if (error.code === 'PGRST301' || error.message?.includes('406') || error.message?.includes('permission denied') || error.message?.includes('row-level security')) {
          console.error('❌ Erro de permissão RLS ao buscar zonas de entrega:', error.message);
          console.error('💡 Execute o script SQL: sql/fixes/FIX_DELIVERY_ZONES_PUBLIC_ACCESS.sql');
          console.error('💡 Isso permitirá que usuários não autenticados vejam as zonas de entrega.');
          return [];
        }
        if (handleSupabaseError('getDeliveryZones', error)) return [];
        throw error;
      }
      
      const zones = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        isActive: item.is_active,
        displayOrder: item.display_order || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));
      
      if (zones.length === 0) {
        console.warn('⚠️ Nenhuma zona de entrega ativa encontrada no banco de dados.');
      }
      
      return zones;
    } catch (e: any) {
      console.error('❌ Erro ao buscar zonas de entrega:', e);
      return [];
    }
  },

  /**
   * Buscar zona por nome
   */
  async getDeliveryZoneByName(name: string): Promise<DeliveryZone | null> {
    if (!isSupabaseConfigured() || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('name', name)
        .eq('is_active', true)
        .single();
      
      if (error) {
        if (handleSupabaseError('getDeliveryZoneByName', error)) return null;
        return null;
      }
      
      if (!data) return null;
      
      return {
        id: data.id,
        name: data.name,
        price: Number(data.price),
        isActive: data.is_active,
        displayOrder: data.display_order || 0,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (e: any) {
      console.error('Error fetching delivery zone by name:', e);
      return null;
    }
  },

  /**
   * Buscar zona por ID
   */
  async getDeliveryZoneById(id: string): Promise<DeliveryZone | null> {
    if (!isSupabaseConfigured() || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        if (handleSupabaseError('getDeliveryZoneById', error)) return null;
        return null;
      }
      
      if (!data) return null;
      
      return {
        id: data.id,
        name: data.name,
        price: Number(data.price),
        isActive: data.is_active,
        displayOrder: data.display_order || 0,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (e: any) {
      console.error('Error fetching delivery zone by id:', e);
      return null;
    }
  },

  /**
   * Calcular taxa de entrega baseada no nome da zona
   */
  async calculateDeliveryFee(zoneName: string): Promise<number> {
    if (!zoneName) return 0;
    
    const zone = await this.getDeliveryZoneByName(zoneName);
    return zone ? zone.price : 0;
  },

  /**
   * Calcular taxa de entrega baseada no ID da zona
   */
  async calculateDeliveryFeeById(zoneId: string): Promise<number> {
    if (!zoneId) return 0;
    
    const zone = await this.getDeliveryZoneById(zoneId);
    return zone ? zone.price : 0;
  }
};
