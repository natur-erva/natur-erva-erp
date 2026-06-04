import { useState, useEffect, useCallback } from 'react';
import { User } from '../../core/types/types';
import api from '../../core/services/apiClient';

interface UsePermissionsReturn {
  hasPermission: (permissionName: string) => boolean;
  hasAnyPermission: (permissionNames: string[]) => boolean;
  hasAllPermissions: (permissionNames: string[]) => boolean;
  isLoading: boolean;
  permissions: string[];
  refreshPermissions: () => Promise<void>;
}

// Cache de permisséµes por usué¡rio
const permissionsCache: Record<string, { permissions: string[]; timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Funçéo para limpar cache de um usué¡rio especé­fico (exportada para uso externo)
export const clearUserPermissionsCache = (userId: string) => {
  delete permissionsCache[userId];
  console.log(`Cache de permisséµes limpo para usué¡rio: ${userId}`);
};

// Função para limpar todo o cache
export const clearAllPermissionsCache = () => {
  Object.keys(permissionsCache).forEach(key => delete permissionsCache[key]);
  console.log('Cache de permissões limpo para todos os utilizadores');
};

// Lista completa de todas as 96 permissões do sistema
const getAllPermissionsList = (): string[] => {
  return [
    // Dashboard (3)
    'dashboard.view', 'dashboard.export', 'analytics.view',

    // Sales (12)
    'sales.view', 'sales.view.own', 'sales.view.all', 'sales.create', 'sales.edit',
    'sales.edit.all', 'sales.delete', 'sales.approve', 'sales.cancel', 'sales.discount',
    'sales.discount.high', 'sales.reports',

    // Purchases (6)
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
    'purchases.approve', 'purchases.reports',

    // Products (7)
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'products.manage_categories', 'products.manage_units', 'products.manage_pricing',

    // Stock (7)
    'stock.view', 'stock.adjust', 'stock.audit', 'stock.audit.approve',
    'stock.movements.view', 'stock.movements.create', 'stock.reports',

    // Customers (6)
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'customers.view_sensitive', 'customers.export',

    // Users (8)
    'users.view', 'users.create', 'users.edit', 'users.delete', 'users.deactivate',
    'users.manage_roles', 'users.reset_password', 'users.view_activity',

    // Financial (8)
    'financial.view', 'financial.edit', 'financial.approve', 'financial.reports',
    'financial.export', 'financial.accounts', 'financial.reconciliation', 'financial.taxes',

    // Accounting (6)
    'accounting.view', 'accounting.entries.create', 'accounting.entries.edit',
    'accounting.reports', 'accounting.balances', 'accounting.export',

    // Media (3)
    'media.view', 'media.upload', 'media.delete',

    // System (5)
    'system.settings', 'system.modules', 'system.backup', 'system.audit_logs',
    'system.audit_logs.export',

    // Approvals (3)
    'approvals.view', 'approvals.approve', 'approvals.reject',

    // Orders (5)
    'orders.view', 'orders.create', 'orders.edit', 'orders.delete', 'orders.update_status',

    // Shop (2)
    'shop.view', 'shop.order'
  ];
};

export const usePermissions = (user: User | null): UsePermissionsReturn => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!user) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    const userRoles = user.roles || [user.role || 'STAFF'];

    // SUPER_ADMIN — todas as permissões localmente, sem chamada à API
    if (user.isSuperAdmin || userRoles.includes('SUPER_ADMIN')) {
      const all = getAllPermissionsList();
      setPermissions(all);
      permissionsCache[user.id] = { permissions: all, timestamp: Date.now() };
      setIsLoading(false);
      return;
    }

    // ADMIN — todas menos users.delete e system.backup
    if (userRoles.includes('ADMIN')) {
      const all = getAllPermissionsList().filter(p => p !== 'users.delete' && p !== 'system.backup');
      setPermissions(all);
      permissionsCache[user.id] = { permissions: all, timestamp: Date.now() };
      setIsLoading(false);
      return;
    }

    // Verificar cache
    const cached = permissionsCache[user.id];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setPermissions(cached.permissions);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Buscar permissões do backend (sem Supabase)
      const data = await api.get<{ roles: string[]; permissions: string[] }>('/auth/my-permissions');
      const perms = data.permissions || [];
      setPermissions(perms);
      permissionsCache[user.id] = { permissions: perms, timestamp: Date.now() };
    } catch {
      // Fallback: se a API falhar, conceder admin.access a utilizadores não-CLIENTE
      const isStaff = !userRoles.includes('CLIENTE');
      const fallback = isStaff ? ['admin.access'] : [];
      setPermissions(fallback);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPermissions();

    // Ouvir eventos de atualizaçéo de roles para limpar cache
    const handleRolesUpdated = (event: CustomEvent) => {
      const updatedUserId = event.detail?.userId;
      if (updatedUserId && updatedUserId === user?.id) {
        clearUserPermissionsCache(updatedUserId);
        loadPermissions();
      } else if (!updatedUserId) {
        // Se néo especificou userId, limpar cache de todos
        clearAllPermissionsCache();
        if (user) {
          loadPermissions();
        }
      }
    };

    window.addEventListener('roles-updated' as any, handleRolesUpdated);

    return () => {
      window.removeEventListener('roles-updated' as any, handleRolesUpdated);
    };
  }, [loadPermissions, user]);

  const hasPermission = useCallback((permissionName: string): boolean => {
    if (!user) return false;
    const userRoles = user.roles || [user.role || 'STAFF'];

    if (user.isSuperAdmin || userRoles.includes('SUPER_ADMIN')) return true;

    if (userRoles.includes('ADMIN')) {
      return permissionName !== 'users.delete' && permissionName !== 'system.backup';
    }

    return permissions.includes(permissionName);
  }, [user, permissions]);

  const hasAnyPermission = useCallback((permissionNames: string[]): boolean => {
    return permissionNames.some(perm => hasPermission(perm));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((permissionNames: string[]): boolean => {
    return permissionNames.every(perm => hasPermission(perm));
  }, [hasPermission]);

  const refreshPermissions = useCallback(async () => {
    if (user) {
      delete permissionsCache[user.id];
      await loadPermissions();
    }
  }, [user, loadPermissions]);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading,
    permissions,
    refreshPermissions
  };
};



