import React, { useState, useEffect } from 'react';
import { ProductCategory, ProductUnit, VariantTemplate } from '../../../core/types/types';
import { useProducts } from '../../../core/hooks/useProducts';
import { Plus, Edit2, Trash2, Save, X, Tag, Ruler, Layers, CheckCircle } from 'lucide-react';
import { Toast } from '../../../core/components/ui/Toast';
import { ConfirmDialog } from '../../../core/components/ui/ConfirmDialog';

type ProductManagementTabType = 'categories' | 'units' | 'templates';

interface ProductManagementProps {
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  onDataChanged?: () => void; // Callback para notificar mudanças
  defaultTab?: ProductManagementTabType;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({ showToast, onDataChanged, defaultTab = 'categories' }) => {
  const [activeTab, setActiveTab] = useState<ProductManagementTabType>(defaultTab);

  // Hook do mé³dulo produtos
  const {
    categories,
    units,
    templates,
    getCategories,
    getUnits,
    getVariantTemplates,
    addCategory,
    updateCategory,
    deleteCategory,
    addUnit,
    updateUnit,
    deleteUnit,
    addVariantTemplate,
    updateVariantTemplate,
    deleteVariantTemplate,
    loading
  } = useProducts();

  // Editing states
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#3B82F6', icon: '' });

  const [editingUnit, setEditingUnit] = useState<ProductUnit | null>(null);
  const [unitForm, setUnitForm] = useState({ name: '', abbreviation: '', description: '' });

  const [editingTemplate, setEditingTemplate] = useState<VariantTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', values: [''] });

  // Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => { },
    variant: 'warning'
  });

  useEffect(() => {
    loadData();
  }, [activeTab, getCategories, getUnits, getVariantTemplates]);

  const loadData = async () => {
    try {
      if (activeTab === 'categories') {
        await getCategories();
      } else if (activeTab === 'units') {
        await getUnits();
      } else if (activeTab === 'templates') {
        await getVariantTemplates();
      }
    } catch (error) {
      showToast('Erro ao carregar dados', 'error');
    }
  };

  // Categories
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      showToast('Nome da categoria é© obrigaté³rio', 'error');
      return;
    }

    try {
      if (editingCategory) {
        const success = await updateCategory(editingCategory.id, {
          name: categoryForm.name,
          description: categoryForm.description,
          color: categoryForm.color,
          icon: categoryForm.icon,
          isActive: editingCategory.isActive
        });
        if (success) {
          showToast('Categoria atualizada com sucesso', 'success');
          setEditingCategory(null);
          setCategoryForm({ name: '', description: '', color: '#3B82F6', icon: '' });
          onDataChanged?.();
        } else {
          showToast('Erro ao atualizar categoria', 'error');
        }
      } else {
        const newCategory = await addCategory({
          name: categoryForm.name,
          description: categoryForm.description,
          color: categoryForm.color,
          icon: categoryForm.icon,
          isActive: true
        });
        if (newCategory) {
          showToast('Categoria criada com sucesso', 'success');
          setCategoryForm({ name: '', description: '', color: '#3B82F6', icon: '' });
          onDataChanged?.();
        } else {
          showToast('Erro ao criar categoria', 'error');
        }
      }
    } catch (error) {
      showToast('Erro ao salvar categoria', 'error');
    }
  };

  const handleDeleteCategory = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      message: 'Tem certeza que deseja apagar esta categoria?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const success = await deleteCategory(id);
          if (success) {
            showToast('Categoria apagada com sucesso', 'success');
            onDataChanged?.();
          } else {
            showToast('Erro ao apagar categoria', 'error');
          }
        } catch (error) {
          showToast('Erro ao apagar categoria', 'error');
        }
        setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } });
      }
    });
  };

  // Units
  const handleSaveUnit = async () => {
    if (!unitForm.name.trim() || !unitForm.abbreviation.trim()) {
      showToast('Nome e abreviaçéo são obrigaté³rios', 'error');
      return;
    }

    try {
      if (editingUnit) {
        const success = await updateUnit(editingUnit.id, {
          name: unitForm.name,
          abbreviation: unitForm.abbreviation,
          description: unitForm.description,
          isActive: editingUnit.isActive
        });
        if (success) {
          showToast('Unidade atualizada com sucesso', 'success');
          setEditingUnit(null);
          setUnitForm({ name: '', abbreviation: '', description: '' });
          onDataChanged?.();
        } else {
          showToast('Erro ao atualizar unidade', 'error');
        }
      } else {
        const newUnit = await addUnit({
          name: unitForm.name,
          abbreviation: unitForm.abbreviation,
          description: unitForm.description,
          isActive: true
        });
        if (newUnit) {
          showToast('Unidade criada com sucesso', 'success');
          setUnitForm({ name: '', abbreviation: '', description: '' });
          onDataChanged?.();
        } else {
          showToast('Erro ao criar unidade', 'error');
        }
      }
    } catch (error) {
      showToast('Erro ao salvar unidade', 'error');
    }
  };

  const handleDeleteUnit = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      message: 'Tem certeza que deseja apagar esta unidade?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const success = await deleteUnit(id);
          if (success) {
            showToast('Unidade apagada com sucesso', 'success');
            onDataChanged?.();
          } else {
            showToast('Erro ao apagar unidade', 'error');
          }
        } catch (error) {
          showToast('Erro ao apagar unidade', 'error');
        }
        setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } });
      }
    });
  };

  // Templates
  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      showToast('Nome do template é© obrigaté³rio', 'error');
      return;
    }

    const values = templateForm.values.filter(v => v.trim() !== '');
    if (values.length === 0) {
      showToast('Adicione pelo menos um valor', 'error');
      return;
    }

    try {
      if (editingTemplate) {
        const success = await updateVariantTemplate(editingTemplate.id, {
          name: templateForm.name,
          description: templateForm.description,
          values,
          isActive: editingTemplate.isActive
        });
        if (success) {
          showToast('Template atualizado com sucesso', 'success');
          setEditingTemplate(null);
          setTemplateForm({ name: '', description: '', values: [''] });
          onDataChanged?.();
        } else {
          showToast('Erro ao atualizar template', 'error');
        }
      } else {
        const newTemplate = await addVariantTemplate({
          name: templateForm.name,
          description: templateForm.description,
          values,
          isActive: true
        });
        if (newTemplate) {
          showToast('Template criado com sucesso', 'success');
          setTemplateForm({ name: '', description: '', values: [''] });
          onDataChanged?.();
        } else {
          showToast('Erro ao criar template', 'error');
        }
      }
    } catch (error) {
      showToast('Erro ao salvar template', 'error');
    }
  };

  const handleDeleteTemplate = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      message: 'Tem certeza que deseja apagar este template?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const success = await deleteVariantTemplate(id);
          if (success) {
            showToast('Template apagado com sucesso', 'success');
            onDataChanged?.();
          } else {
            showToast('Erro ao apagar template', 'error');
          }
        } catch (error) {
          showToast('Erro ao apagar template', 'error');
        }
        setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } });
      }
    });
  };

  const addTemplateValue = () => {
    setTemplateForm({ ...templateForm, values: [...templateForm.values, ''] });
  };

  const removeTemplateValue = (index: number) => {
    setTemplateForm({
      ...templateForm,
      values: templateForm.values.filter((_, i) => i !== index)
    });
  };

  const updateTemplateValue = (index: number, value: string) => {
    const newValues = [...templateForm.values];
    newValues[index] = value;
    setTemplateForm({ ...templateForm, values: newValues });
  };

  return (
    <div className="space-y-6">
      {/* Tabs removidas - navegação agora é pelo sidebar com submenus */}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: Carnes, Polpas, é“leos"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cor
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-12 h-10 rounded border border-gray-300 dark:border-gray-600"
                  />
                  <input
                    type="text"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    placeholder="#3B82F6"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descriçéo
                </label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  rows={2}
                  placeholder="Descriçéo opcional da categoria"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              {editingCategory && (
                <button
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryForm({ name: '', description: '', color: '#3B82F6', icon: '' });
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-4 h-4 inline mr-1" /> Cancelar
                </button>
              )}
              <button
                onClick={handleSaveCategory}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> {editingCategory ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Cor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Descriçéo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {categories.map(category => (
                    <tr key={category.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{category.name}</td>
                      <td className="px-4 py-3">
                        <div
                          className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600"
                          style={{ backgroundColor: category.color || '#3B82F6' }}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{category.description || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${category.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {category.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingCategory(category);
                              setCategoryForm({
                                name: category.name,
                                description: category.description || '',
                                color: category.color || '#3B82F6',
                                icon: category.icon || ''
                              });
                            }}
                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(category.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Units Tab */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          {/* Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              {editingUnit ? 'Editar Unidade' : 'Nova Unidade'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={unitForm.name}
                  onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: Quilograma, Grama, Litro"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Abreviaçéo *
                </label>
                <input
                  type="text"
                  value={unitForm.abbreviation}
                  onChange={(e) => setUnitForm({ ...unitForm, abbreviation: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: kg, g, ml, l, un"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descriçéo
                </label>
                <textarea
                  value={unitForm.description}
                  onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  rows={2}
                  placeholder="Descriçéo opcional da unidade"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              {editingUnit && (
                <button
                  onClick={() => {
                    setEditingUnit(null);
                    setUnitForm({ name: '', abbreviation: '', description: '' });
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-4 h-4 inline mr-1" /> Cancelar
                </button>
              )}
              <button
                onClick={handleSaveUnit}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> {editingUnit ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Abreviaçéo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Descriçéo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {units.map(unit => (
                    <tr key={unit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{unit.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">{unit.abbreviation}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{unit.description || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${unit.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {unit.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingUnit(unit);
                              setUnitForm({
                                name: unit.name,
                                abbreviation: unit.abbreviation,
                                description: unit.description || ''
                              });
                            }}
                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUnit(unit.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* Form */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              {editingTemplate ? 'Editar Template' : 'Novo Template'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: Peso, Tamanho, Volume"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descriçéo
                </label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  rows={2}
                  placeholder="Descriçéo opcional do template"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valores *
                </label>
                <div className="space-y-2">
                  {templateForm.values.map((value, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateTemplateValue(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                        placeholder="Ex: 500g, 1kg, 2kg"
                      />
                      {templateForm.values.length > 1 && (
                        <button
                          onClick={() => removeTemplateValue(index)}
                          className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addTemplateValue}
                    className="w-full px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-500 dark:hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    <Plus className="w-4 h-4 inline mr-1" /> Adicionar Valor
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              {editingTemplate && (
                <button
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateForm({ name: '', description: '', values: [''] });
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-4 h-4 inline mr-1" /> Cancelar
                </button>
              )}
              <button
                onClick={handleSaveTemplate}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> {editingTemplate ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Valores</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {templates.map(template => (
                    <tr key={template.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</div>
                        {template.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{template.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {template.values.map((value, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${template.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {template.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingTemplate(template);
                              setTemplateForm({
                                name: template.name,
                                description: template.description || '',
                                values: template.values.length > 0 ? template.values : ['']
                              });
                            }}
                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false, message: '', onConfirm: () => { } })}
        variant={confirmDialog.variant}
        title="Confirmar Açéo"
        confirmText="Confirmar"
        cancelText="Cancelar"
      />
    </div>
  );
};


