import { useState, useEffect, useCallback } from 'react';
import { User } from '../../core/types/types';
import { authService } from '../../auth/services/authService';
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';

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
    if (!user || !isSupabaseConfigured()) {
      setPermissions([]);
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
      // Verificar roles do usuário (user.roles é um array de strings)
      const userRoles = user.roles || [];

      // Se for SUPER_ADMIN, retornar todas as permissões (sem exceções)
      if (userRoles.includes('SUPER_ADMIN')) {
        const allPermissions = getAllPermissionsList();
        setPermissions(allPermissions);
        permissionsCache[user.id] = { permissions: allPermissions, timestamp: Date.now() };
        setIsLoading(false);
        return;
      }

      // Se for ADMIN, retornar todas as permissões exceto users.delete e system.backup
      if (userRoles.includes('ADMIN')) {
        const allPermissions = getAllPermissionsList();
        const adminPermissions = allPermissions.filter(
          p => p !== 'users.delete' && p !== 'system.backup'
        );
        setPermissions(adminPermissions);
        permissionsCache[user.id] = { permissions: adminPermissions, timestamp: Date.now() };
        setIsLoading(false);
        return;
      }

      // Buscar permisséµes do usué¡rio via RPC ou consulta direta
      const userPermissions: string[] = [];

      // Buscar roles do usué¡rio
      if (supabase) {
        const { data: userRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('role_id, roles(name)')
          .eq('user_id', user.id);

        if (!rolesError && userRoles && userRoles.length > 0) {
          const roleIds = userRoles.map((ur: any) => ur.role_id);

          // Buscar permisséµes dos roles
          const { data: rolePermissions, error: permError } = await supabase
            .from('role_permissions')
            .select('permission_id, permissions(name)')
            .in('role_id', roleIds);

          if (!permError && rolePermissions) {
            rolePermissions.forEach((rp: any) => {
              if (rp.permissions?.name && !userPermissions.includes(rp.permissions.name)) {
                userPermissions.push(rp.permissions.name);
              }
            });
          }
        }
      }

      setPermissions(userPermissions);
      permissionsCache[user.id] = { permissions: userPermissions, timestamp: Date.now() };
    } catch (error) {
      console.error('Erro ao carregar permisséµes:', error);
      setPermissions([]);
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

    const userRoles = user.roles || [];

    // SUPER_ADMIN sempre tem todas as permissões
    if (userRoles.includes('SUPER_ADMIN')) {
      return true;
    }

    // ADMIN tem todas exceto users.delete e system.backup
    if (userRoles.includes('ADMIN')) {
      if (permissionName === 'users.delete' || permissionName === 'system.backup') {
        return false;
      }
      return true;
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



