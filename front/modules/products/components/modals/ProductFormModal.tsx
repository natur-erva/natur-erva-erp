import React, { useState, useEffect } from 'react';
import { Product } from '../../../core/types/types';
import { Modal } from '../shared/Modal';
import { Upload, X } from 'lucide-react';

export interface ProductCategoryOption {
  id: string;
  name: string;
}

export interface ProductUnitOption {
  id: string;
  name: string;
  abbreviation: string;
}

export interface ProductFormData {
  name: string;
  category: string;
  price: number;
  costPrice: number;
  minStock: number;
  unit: string;
  image: string;
  showInShop: boolean;
}

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  categories: ProductCategoryOption[];
  units: ProductUnitOption[];
  onSave: (data: ProductFormData) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  uploadProductImage: (file: File, productId?: string) => Promise<string | null>;
  deleteProductImage: (imageUrl: string) => Promise<void | boolean>;
  validateImageFile: (file: File) => { valid: boolean; error?: string };
}

const defaultFormData: ProductFormData = {
  name: '',
  category: '',
  price: 0,
  costPrice: 0,
  minStock: 5,
  unit: '',
  image: '',
  showInShop: true,
};

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  open,
  onClose,
  product,
  categories,
  units,
  onSave,
  showToast,
  uploadProductImage,
  deleteProductImage,
  validateImageFile,
}) => {
  const [formData, setFormData] = useState<ProductFormData>(defaultFormData);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setFormData({
        name: product.name || '',
        category: product.category || '',
        price: product.price ?? 0,
        costPrice: product.costPrice ?? 0,
        minStock: product.minStock ?? 5,
        unit: product.unit || '',
        image: product.image || '',
        showInShop: product.showInShop !== false,
      });
      setImagePreview(product.image || null);
    } else {
      const defaultCategory = categories.length > 0 ? categories[0].name : '';
      const defaultUnit = units.length > 0 ? units[0].abbreviation : 'un';
      setFormData({
        ...defaultFormData,
        category: defaultCategory,
        unit: defaultUnit,
      });
      setImagePreview(null);
    }
  }, [open, product, categories, units]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Erro ao validar imagem', 'error');
      return;
    }

    setUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);

      const productId = product?.id;
      const imageUrl = await uploadProductImage(file, productId);

      if (imageUrl) {
        setFormData((prev) => ({ ...prev, image: imageUrl }));
        showToast('Imagem carregada com sucesso', 'success');
      } else {
        showToast('Erro ao fazer upload da imagem', 'error');
        setImagePreview(null);
      }
    } catch (error: any) {
      showToast(error.message || 'Erro ao fazer upload da imagem', 'error');
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (!formData.image) return;

    if (formData.image.includes('supabase.co/storage')) {
      try {
        await deleteProductImage(formData.image);
      } catch (error) {
        console.error('Erro ao remover imagem do storage:', error);
      }
    }

    setFormData((prev) => ({ ...prev, image: '' }));
    setImagePreview(null);
    showToast('Imagem removida', 'success');
  };

  const handleSubmit = () => {
    if (!formData.name?.trim()) {
      showToast('Nome do produto é obrigatório', 'error');
      return;
    }
    onSave(formData);
  };

  const defaultCategory = categories.length > 0 ? categories[0].name : '';
  const defaultUnit = units.length > 0 ? units[0].abbreviation : 'un';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Editar Produto' : 'Novo Produto'}
      maxWidth="4xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!formData.name?.trim()}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {product ? 'Salvar Alterações' : 'Criar Produto'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Informações do Produto</h3>

        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-6 md:gap-8 items-start">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Produto *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                placeholder="Ex: Amendoim Pilado"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
              <select
                value={formData.category || defaultCategory}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidade</label>
              <select
                value={formData.unit || defaultUnit}
                onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.abbreviation}>
                    {unit.abbreviation} - {unit.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showInShop"
                checked={formData.showInShop}
                onChange={(e) => setFormData((prev) => ({ ...prev, showInShop: e.target.checked }))}
                className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
              />
              <label htmlFor="showInShop" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Mostrar na Loja Online
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock Mínimo</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.minStock}
                onChange={(e) => setFormData((prev) => ({ ...prev, minStock: parseFloat(e.target.value) || 0 }))}
                className="input-number-simple w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                placeholder="Ex: 5"
              />
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 w-full md:text-center">Imagem do Produto</label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-40 h-40 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center w-40 h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-brand-500 transition-colors shrink-0">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                />
                <Upload className="w-8 h-8 text-gray-400" />
              </label>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
