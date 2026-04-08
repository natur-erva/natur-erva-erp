import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { handleSupabaseError } from '../../core/services/serviceUtils';
import { Supplier } from '../../core/types/types';

function mapRowToSupplier(row: any): Supplier {
  return {
    id: row.id,
    name: row.name ?? '',
    contact: row.contact ?? row.contact_person ?? undefined,
    contactPerson: row.contact_person ?? row.contact ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function supplierToRow(s: Supplier): Record<string, unknown> {
  const contactVal = s.contactPerson ?? s.contact ?? null;
  return {
    name: s.name,
    contact_person: contactVal,
    phone: s.phone ?? null,
    email: s.email ?? null,
    address: s.address ?? null,
    notes: s.notes ?? null,
    is_active: s.isActive !== false,
    updated_at: new Date().toISOString()
  };
}

export const supplierService = {
  async getSuppliers(): Promise<Supplier[]> {
    if (!isSupabaseConfigured() || !supabase) return [];
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });
      if (error) {
        if (handleSupabaseError('getSuppliers', error)) return [];
        throw error;
      }
      return (data || []).map(mapRowToSupplier);
    } catch (e: any) {
      console.error('[supplierService] getSuppliers:', e);
      return [];
    }
  },

  async getSuppliersCount(): Promise<number> {
    if (!isSupabaseConfigured() || !supabase) return 0;
    try {
      const { count, error } = await supabase
        .from('suppliers')
        .select('*', { count: 'exact', head: true });
      if (error) {
        if (handleSupabaseError('getSuppliersCount', error)) return 0;
        return 0;
      }
      return count ?? 0;
    } catch (e: any) {
      console.error('[supplierService] getSuppliersCount:', e);
      return 0;
    }
  },

  async createSupplier(supplier: Supplier): Promise<{ supplier: Supplier | null; error?: string }> {
    if (!isSupabaseConfigured() || !supabase) return { supplier: null, error: 'Não conectado' };
    try {
      const row = supplierToRow(supplier);
      const { data, error } = await supabase
        .from('suppliers')
        .insert(row)
        .select()
        .single();
      if (error) {
        if (handleSupabaseError('createSupplier', error)) return { supplier: null, error: error.message };
        return { supplier: null, error: error.message };
      }
      return { supplier: data ? mapRowToSupplier(data) : null };
    } catch (e: any) {
      console.error('[supplierService] createSupplier:', e);
      return { supplier: null, error: e?.message ?? 'Erro ao criar fornecedor' };
    }
  },

  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<boolean> {
    if (!id || !isSupabaseConfigured() || !supabase) return false;
    try {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.contactPerson !== undefined || updates.contact !== undefined) {
        const v = updates.contactPerson ?? updates.contact;
        row.contact_person = v ?? null;
      }
      if (updates.phone !== undefined) row.phone = updates.phone;
      if (updates.email !== undefined) row.email = updates.email;
      if (updates.address !== undefined) row.address = updates.address;
      if (updates.notes !== undefined) row.notes = updates.notes;
      if (updates.isActive !== undefined) row.is_active = updates.isActive;
      row.updated_at = new Date().toISOString();
      const { error } = await supabase.from('suppliers').update(row).eq('id', id);
      if (error) {
        if (handleSupabaseError('updateSupplier', error)) return false;
        return false;
      }
      return true;
    } catch (e: any) {
      console.error('[supplierService] updateSupplier:', e);
      return false;
    }
  },

  async deleteSupplier(id: string): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) return true;
    if (!id) return true;
    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) {
        if (handleSupabaseError('deleteSupplier', error)) return true;
        return false;
      }
      return true;
    } catch (e: any) {
      console.error('[supplierService] deleteSupplier:', e);
      return false;
    }
  }
};
