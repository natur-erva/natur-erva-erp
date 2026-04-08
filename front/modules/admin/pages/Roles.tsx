import React, { useState, useEffect } from 'react';
import { Role, Permission } from '../../core/types/types';
import { supabase, isSupabaseConfigured, getAdminClient } from '../../core/services/supabaseClient';
import { Search, Plus, Edit, Trash2, Shield, Check, X } from 'lucide-react';
import { normalizeForSearch } from '../../core/services/serviceUtils';

export const Roles: React.FC<{
  currentUser?: any;
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
}> = ({ currentUser, showToast }) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [tablesMissing, setTablesMissing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadRoles(), loadPermissions()]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn('Supabase não configurado');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('roles')
        .select(`
          *,
          role_permissions(
            permission_id,
            permissions(*)
          )
        `)
        .order('display_name');

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('Tabela roles não existe. Execute o SQL sql/migrations/CREATE_PERMISSIONS_SYSTEM.sql no Supabase.');
          setTablesMissing(true);
          setRoles([]);
          return;
        }
        console.error('Erro ao buscar roles:', error);
        throw error;
      }

      const rolesWithPermissions = (data || []).map((role: any) => ({
        id: role.id,
        name: role.name,
        displayName: role.display_name,
        description: role.description,
        isSystemRole: role.is_system_role,
        permissions: role.role_permissions?.map((rp: any) => rp.permissions).filter(Boolean) || []
      }));

      setRoles(rolesWithPermissions);
      setTablesMissing(false);
    } catch (error: any) {
      console.error('Erro ao carregar roles:', error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setTablesMissing(true);
      } else {
        showToast(error.message || 'Erro ao carregar roles', 'error');
      }
      setRoles([]);
    }
  };

  const loadPermissions = async () => {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn('Supabase não configurado');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category, name');

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('Tabela permissions não existe.');
          setTablesMissing(true);
          setPermissions([]);
          return;
        }
        console.error('Erro ao buscar permissões:', error);
        throw error;
      }

      const permissionsList = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category
      }));

      setPermissions(permissionsList);
      setTablesMissing(false);
    } catch (error: any) {
      console.error('Erro ao carregar permissões:', error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setTablesMissing(true);
      } else {
        showToast(error.message || 'Erro ao carregar permissões', 'error');
        setPermissions([]);
      }
    }
  };

  const handleCreateRole = async (roleData: {
    name: string;
    displayName: string;
    description?: string;
    permissionIds: string[];
  }) => {
    if (!isSupabaseConfigured() || !supabase) {
      showToast('Supabase não configurado', 'error');
      return;
    }

    // Validações
    if (!roleData.name.trim()) {
      showToast('Nome do role é obrigatãorio', 'error');
      return;
    }

    if (!roleData.displayName.trim()) {
      showToast('Nome de exibição é obrigatãorio', 'error');
      return;
    }

    try {
      const adminClient = getAdminClient();
      const clientToUse = adminClient || supabase;

      const { data: newRole, error: roleError } = await clientToUse
        .from('roles')
        .insert({
          name: roleData.name.toUpperCase().replace(/\s+/g, '_'),
          display_name: roleData.displayName.trim(),
          description: roleData.description?.trim() || null,
          is_system_role: false
        })
        .select()
        .single();

      if (roleError) {
        if (roleError.message?.includes('duplicate') || roleError.message?.includes('unique')) {
          showToast('Já existe um role com este nome', 'error');
          return;
        }
        throw roleError;
      }
      if (!newRole) throw new Error('Erro ao criar role');

      // Associar permissões
      if (roleData.permissionIds.length > 0) {
        const rolePermissions = roleData.permissionIds.map(permissionId => ({
          role_id: newRole.id,
          permission_id: permissionId
        }));

        const { error: permError } = await clientToUse
          .from('role_permissions')
          .insert(rolePermissions);

        if (permError) {
          console.error('Erro ao associar permissões:', permError);
          if (permError.message?.includes('row-level security') || permError.message?.includes('policy')) {
            if (!adminClient) {
              showToast('Role criado, mas erro ao associar permissões. Configure a Service Role Key.', 'warning', 8000);
            } else {
              showToast('Role criado, mas erro ao associar permissões. Execute o SQL sql/fixes/FIX_USER_ROLES_RLS_V2.sql.', 'warning', 8000);
            }
          } else {
            throw permError;
          }
        }
      }

      showToast('Role criado com sucesso', 'success');
      setShowRoleModal(false);
      
      // Disparar evento para limpar cache de permissões (novo role criado)
      window.dispatchEvent(new CustomEvent('roles-updated'));
      
      loadData();
    } catch (error: any) {
      console.error('Erro ao criar role:', error);
      showToast(error.message || 'Erro ao criar role', 'error');
    }
  };

  const handleUpdateRole = async (roleId: string, updates: {
    displayName?: string;
    description?: string;
    permissionIds?: string[];
  }) => {
    if (!isSupabaseConfigured() || !supabase) {
      showToast('Supabase não configurado', 'error');
      return;
    }

    try {
      const adminClient = getAdminClient();
      const clientToUse = adminClient || supabase;

      const roleUpdates: any = {};
      if (updates.displayName !== undefined) roleUpdates.display_name = updates.displayName.trim();
      if (updates.description !== undefined) roleUpdates.description = updates.description?.trim() || null;

      if (Object.keys(roleUpdates).length > 0) {
        const { error: roleError } = await clientToUse
          .from('roles')
          .update(roleUpdates)
          .eq('id', roleId);

        if (roleError) throw roleError;
      }

      // Atualizar permissões
      if (updates.permissionIds !== undefined) {
        // Remover permissões antigas
        const { error: deleteError } = await clientToUse
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId);

        if (deleteError) {
          console.warn('Erro ao remover permissões antigas:', deleteError);
          if (!adminClient && (deleteError.message?.includes('row-level security') || deleteError.message?.includes('policy'))) {
            showToast('Erro ao atualizar permissões. Configure a Service Role Key.', 'error');
            return;
          }
        }

        // Adicionar novas permissões
        if (updates.permissionIds.length > 0) {
          const rolePermissions = updates.permissionIds.map(permissionId => ({
            role_id: roleId,
            permission_id: permissionId
          }));

          const { error: permError } = await clientToUse
            .from('role_permissions')
            .insert(rolePermissions);

          if (permError) {
            if (permError.message?.includes('row-level security') || permError.message?.includes('policy')) {
              if (!adminClient) {
                showToast('Erro ao atualizar permissões. Configure a Service Role Key.', 'error');
              } else {
                showToast('Erro ao atualizar permissões. Execute o SQL sql/fixes/FIX_USER_ROLES_RLS_V2.sql.', 'error');
              }
            }
            throw permError;
          }
        }
      }

      showToast('Role atualizado com sucesso', 'success');
      setShowRoleModal(false);
      setEditingRole(null);
      
      // Disparar evento para limpar cache de permissões de todos os usuários
      // (pois as permissões do role mudaram)
      window.dispatchEvent(new CustomEvent('roles-updated'));
      
      loadData();
    } catch (error: any) {
      console.error('Erro ao atualizar role:', error);
      showToast(error.message || 'Erro ao atualizar role', 'error');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    // Verificar se o role está sendo usado
    const roleToDelete = roles.find(r => r.id === roleId);
    if (roleToDelete?.isSystemRole) {
      showToast('Roles do sistema não podem ser apagados', 'error');
      return;
    }

    if (!confirm('Tem certeza que deseja apagar este role? Esta açéo não pode ser desfeita e pode afetar usuários que possuem este role.')) return;

    if (!isSupabaseConfigured() || !supabase) {
      showToast('Supabase não configurado', 'error');
      return;
    }

    try {
      const adminClient = getAdminClient();
      const clientToUse = adminClient || supabase;

      // Primeiro, remover todas as associações de permissões
      await clientToUse
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId);

      // Depois, remover associações de usuários
      await clientToUse
        .from('user_roles')
        .delete()
        .eq('role_id', roleId);

      // Por fim, remover o role
      const { error } = await clientToUse
        .from('roles')
        .delete()
        .eq('id', roleId);

      if (error) {
        if (error.message?.includes('row-level security') || error.message?.includes('policy')) {
          if (!adminClient) {
            showToast('Erro ao apagar role. Configure a Service Role Key.', 'error');
          } else {
            showToast('Erro ao apagar role. Execute o SQL sql/fixes/FIX_USER_ROLES_RLS_V2.sql.', 'error');
          }
        }
        throw error;
      }

      showToast('Role apagado com sucesso', 'success');
      
      // Disparar evento para limpar cache de permissões (role deletado)
      window.dispatchEvent(new CustomEvent('roles-updated'));
      
      loadData();
    } catch (error: any) {
      console.error('Erro ao apagar role:', error);
      showToast(error.message || 'Erro ao apagar role', 'error');
    }
  };

  const norm = normalizeForSearch(searchTerm);
  const filteredRoles = roles.filter(role =>
    normalizeForSearch(role.displayName).includes(norm) ||
    normalizeForSearch(role.name).includes(norm) ||
    (role.description && normalizeForSearch(role.description).includes(norm))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tablesMissing && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <Shield className="h-5 w-5 text-yellow-400 dark:text-yellow-500" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Tabelas de Permissões Néo Encontradas
              </h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                <p>As tabelas <code className="bg-yellow-100 dark:bg-yellow-900/50 px-1 rounded">public.roles</code> e <code className="bg-yellow-100 dark:bg-yellow-900/50 px-1 rounded">public.permissions</code> não existem no banco de dados.</p>
                <p className="mt-2 font-semibold">Para resolver:</p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Acesse o Supabase Dashboard</li>
                  <li>Vá para SQL Editor</li>
                  <li>Execute o arquivo <code className="bg-yellow-100 dark:bg-yellow-900/50 px-1 rounded">sql/migrations/CREATE_PERMISSIONS_SYSTEM.sql</code></li>
                  <li>Recarregue esta página</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Roles e Permissões</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Gerir roles do sistema e suas permissões</p>
        </div>
        <button
          onClick={() => {
            setEditingRole(null);
            setShowRoleModal(true);
          }}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Novo Role</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Pesquisar roles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {filteredRoles.length === 0 ? (
          <div className="p-12 text-center">
            <div className="flex flex-col items-center justify-center">
              <Shield className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                {searchTerm ? 'Nenhum role encontrado com essa pesquisa' : 'Nenhum role cadastrado no sistema'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => {
                    setEditingRole(null);
                    setShowRoleModal(true);
                  }}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  <span>Criar Primeiro Role</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredRoles.map((role) => (
              <div key={role.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg shadow p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{role.displayName}</h3>
                  <div className="flex items-center space-x-2">
                    {role.isSystemRole && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">Sistema</span>
                    )}
                    {!role.isSystemRole && (
                      <>
                        <button
                          onClick={() => {
                            setEditingRole(role);
                            setShowRoleModal(true);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                          title="Editar role"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRole(role.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                          title="Apagar role"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{role.description || 'Sem descrição'}</p>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Permissões ({role.permissions?.length || 0}):</p>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions && role.permissions.length > 0 ? (
                      <>
                        {role.permissions.slice(0, 5).map((perm) => (
                          <span
                            key={perm.id}
                            className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded"
                          >
                            {perm.name}
                          </span>
                        ))}
                        {role.permissions.length > 5 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">+{role.permissions.length - 5} mais</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Nenhuma permissão atribuída</span>
                    )}
                  </div>
                </div>
                {!role.isSystemRole && (
                  <button
                    onClick={() => {
                      setEditingRole(role);
                      setShowRoleModal(true);
                    }}
                    className="mt-3 w-full text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                  >
                    Gerir Permissões
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Role */}
      {showRoleModal && (
        <RoleModal
          role={editingRole}
          permissions={permissions}
          onSave={editingRole ? handleUpdateRole : handleCreateRole}
          onClose={() => {
            setShowRoleModal(false);
            setEditingRole(null);
          }}
        />
      )}
    </div>
  );
};

// Modal de Role
const RoleModal: React.FC<{
  role: Role | null;
  permissions: Permission[];
  onSave: (roleId: string, data: any) => void | ((data: any) => void);
  onClose: () => void;
}> = ({ role, permissions, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: role?.name || '',
    displayName: role?.displayName || '',
    description: role?.description || '',
    permissionIds: role?.permissions?.map(p => p.id) || []
  });

  // Agrupar permissões por categoria
  const permissionsByCategory = permissions.reduce((acc, perm) => {
    const category = perm.category || 'Outros';
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (role) {
      (onSave as (roleId: string, data: any) => void)(role.id, formData);
    } else {
      (onSave as (data: any) => void)(formData);
    }
  };

  const togglePermission = (permissionId: string) => {
    if (formData.permissionIds.includes(permissionId)) {
      setFormData({
        ...formData,
        permissionIds: formData.permissionIds.filter(id => id !== permissionId)
      });
    } else {
      setFormData({
        ...formData,
        permissionIds: [...formData.permissionIds, permissionId]
      });
    }
  };

  const selectAllInCategory = (category: string) => {
    const categoryPerms = permissionsByCategory[category] || [];
    const categoryIds = categoryPerms.map(p => p.id);
    const allSelected = categoryIds.every(id => formData.permissionIds.includes(id));
    
    if (allSelected) {
      setFormData({
        ...formData,
        permissionIds: formData.permissionIds.filter(id => !categoryIds.includes(id))
      });
    } else {
      const newIds = [...new Set([...formData.permissionIds, ...categoryIds])];
      setFormData({
        ...formData,
        permissionIds: newIds
      });
    }
  };

  return (
    <div className="fixed inset-0 min-h-screen min-w-full modal-overlay flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{role ? 'Editar Role' : 'Novo Role'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!role && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Role *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: GESTOR_FINANCEIRO"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Será convertido para maiúsculas automaticamente</p>
            </div>
          )}
          {role && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Role</label>
              <input
                type="text"
                value={formData.name}
                disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded-lg bg-gray-100 dark:bg-gray-900"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Nome do role não pode ser alterado</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome de Exibiçéo *</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="Ex: Gestor Financeiro"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descriçéo</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva o propãosito deste role..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Permissões</label>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 max-h-96 overflow-y-auto space-y-4 bg-gray-50 dark:bg-gray-900">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="border-b border-gray-200 dark:border-gray-700 pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">{category}</h4>
                    <button
                      type="button"
                      onClick={() => selectAllInCategory(category)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      {(perms as Permission[]).every(p => formData.permissionIds.includes(p.id)) ? 'Desmarcar Todas' : 'Selecionar Todas'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(perms as Permission[]).map((perm) => (
                      <label key={perm.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={formData.permissionIds.includes(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                          className="rounded"
                        />
                        <div className="flex-1">
                          <span className="text-sm text-gray-900 dark:text-white">{perm.name}</span>
                          {perm.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{perm.description}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {permissions.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma permissão disponível</p>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {formData.permissionIds.length} permissão(ões) selecionada(s)
            </p>
          </div>
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {role ? 'Atualizar' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


