/**
 * userService.ts — Via API REST (sem Supabase)
 */
import api from './apiClient';
import { User } from '../types/types';

export const userService = {
  async getUsers(): Promise<User[]> {
    try {
      return await api.get<User[]>('/users');
    } catch { return []; }
  },

  async getSalesManagers(): Promise<User[]> {
    try {
      return await api.get<User[]>('/users/sales-managers');
    } catch { return []; }
  },

  async getOrderVendors(): Promise<User[]> {
    try {
      return await api.get<User[]>('/users/order-vendors');
    } catch { return []; }
  },

  async updateUser(userId: string, updates: Partial<User> & { password?: string, role_ids?: string[] }): Promise<boolean> {
    try {
      await api.put(`/users/${userId}`, updates);
      return true;
    } catch { return false; }
  },

  async updateUserLocations(
    userId: string,
    locationId?: string | null,
    locationIds?: string[]
  ): Promise<boolean> {
    return this.updateUser(userId, { locationId: locationId || undefined, locationIds });
  },

  async createUser(params: Partial<User> & { password?: string, role_ids?: string[] }): Promise<User | null> {
    try {
      return await api.post<User>('/users', params);
    } catch { return null; }
  },

  async deleteUser(userId: string): Promise<boolean> {
    try {
      await api.delete(`/users/${userId}`);
      return true;
    } catch { return false; }
  },

  async getRoles(): Promise<any[]> {
    try {
      return await api.get<any[]>('/roles');
    } catch { return []; }
  },

  async getPermissions(): Promise<any[]> {
    try {
      return await api.get<any[]>('/roles/permissions');
    } catch { return []; }
  }
};

export default userService;
