import React, { useState, useEffect } from 'react';
import { Product } from '../../../core/types/types';
import { Modal } from '../shared/Modal';
import { Upload, X, ImageOff, Loader2 } from 'lucide-react';
import uploadService from '../../../../services/uploadService';

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
  stock: number;
  unit: string;
  image: string;
  image2: string;
  image3: string;
  image4: string;
  showInShop: boolean;
  description: string;
  descriptionLong: string;
  benefits: string;
  howToUse: string;
  ingredients: string;
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
  stock: 0,
  unit: '',
  image: '',
  image2: '',
  image3: '',
  image4: '',
  showInShop: true,
  description: '',
  descriptionLong: '',
  benefits: '',
  howToUse: '',
  ingredients: '',
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
  const [uploadingImage, setUploadingImage] = useState<Record<string, boolean>>({});
  const [imageLoadError, setImageLoadError] = useState<Record<string, boolean>>({});
  const initializedRef = React.useRef<string | null>(null); // guarda o "id" da abertura actual

  useEffect(() => {
    // Cria uma chave única para esta abertura: id do produto ou 'new'
    const openKey = open ? (product?.id ?? 'new') : null;

    // Só reseta o formulário quando o modal abre ou muda de produto
    if (!open || openKey === initializedRef.current) return;

    initializedRef.current = openKey;
    setImageLoadError({});

    if (product) {
      setFormData({
        name: product.name || '',
        category: product.category || '',
        price: product.price ?? 0,
        costPrice: product.costPrice ?? 0,
        minStock: product.minStock ?? 5,
        stock: product.stock ?? 0,
        unit: product.unit || '',
        image: product.image || '',
        image2: product.image2 || '',
        image3: product.image3 || '',
        image4: product.image4 || '',
        showInShop: product.showInShop !== false,
        description: (product as any).description || '',
        descriptionLong: (product as any).descriptionLong || '',
        benefits: (product as any).benefits || '',
        howToUse: (product as any).howToUse || '',
        ingredients: (product as any).ingredients || '',
      });
    } else {
      const defaultCategory = categories.length > 0 ? categories[0].name : '';
      const defaultUnit = units.length > 0 ? units[0].abbreviation : 'un';
      setFormData({
        ...defaultFormData,
        category: defaultCategory,
        unit: defaultUnit,
      });
    }
  }, [open, product, categories, units]);

  // Quando o modal fecha, limpa a chave para que na próxima abertura reinicialize
  useEffect(() => {
    if (!open) {
      initializedRef.current = null;
    }
  }, [open]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, imageKey: keyof ProductFormData) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Erro ao validar imagem', 'error');
      return;
    }

    setUploadingImage(prev => ({ ...prev, [imageKey]: true }));
    setImageLoadError(prev => ({ ...prev, [imageKey]: false }));
    
    try {
      const productId = product?.id;
      const imageUrl = await uploadProductImage(file, productId);

      if (imageUrl) {
        setFormData((prev) => ({ ...prev, [imageKey]: imageUrl }));
        showToast('Imagem carregada com sucesso', 'success');
      } else {
        showToast('Erro ao fazer upload da imagem', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Erro ao fazer upload da imagem', 'error');
    } finally {
      setUploadingImage(prev => ({ ...prev, [imageKey]: false }));
      event.target.value = '';
    }
  };

  const handleRemoveImage = async (imageKey: keyof ProductFormData) => {
    const imageUrl = formData[imageKey] as string;
    if (!imageUrl) return;

    if (imageUrl.includes('supabase.co/storage')) {
      try {
        await deleteProductImage(imageUrl);
      } catch (error) {
        console.error('Erro ao remover imagem do storage:', error);
      }
    }

    setFormData((prev) => ({ ...prev, [imageKey]: '' }));
    setImageLoadError(prev => ({ ...prev, [imageKey]: false }));
    showToast('Imagem removida', 'success');
  };

  const handleImageLoadError = (imageKey: keyof ProductFormData) => {
    setImageLoadError(prev => ({ ...prev, [imageKey]: true }));
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

  const renderImageUploader = (imageKey: keyof ProductFormData, label: string) => {
    const isUploading = uploadingImage[imageKey];
    const hasError = imageLoadError[imageKey];
    const imageUrl = formData[imageKey] as string;

    return (
      <div className="flex flex-col items-center">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 w-full text-center">
          {label}
        </label>
        {imageUrl ? (
          <div className="relative inline-block">
            {hasError ? (
              <div className="w-24 h-24 bg-gray-100 dark:bg-gray-600 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 transition-colors">
                <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, imageKey)}
                    className="hidden"
                    disabled={isUploading}
                  />
                  <ImageOff className="w-6 h-6 text-gray-400 mb-1" />
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Inválida</p>
                </label>
              </div>
            ) : (
              <img
                src={uploadService.getPublicUrl(imageUrl)}
                alt="Preview"
                onError={() => handleImageLoadError(imageKey)}
                className="w-24 h-24 object-cover rounded-lg border-2 border-gray-300 dark:border-gray-600"
              />
            )}
            <button
              type="button"
              onClick={() => handleRemoveImage(imageKey)}
              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-lg transition-colors"
              title="Remover imagem"
            >
              <X className="w-3 h-3" />
            </button>
            {!hasError && (
              <label className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-brand-600 hover:bg-brand-700 text-white rounded-full p-1 cursor-pointer shadow-lg transition-colors" title="Trocar imagem">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, imageKey)}
                  className="hidden"
                  disabled={isUploading}
                />
                <Upload className="w-3 h-3" />
              </label>
            )}
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-gray-700 transition-all group">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, imageKey)}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-5 h-5 text-brand-600 animate-spin mb-1" />
                <p className="text-[10px] text-gray-500">Enviando...</p>
              </div>
            ) : (
              <>
                <Upload className="w-5 h-5 text-gray-400 group-hover:text-brand-600 transition-colors mb-1" />
                <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">Upload</p>
              </>
            )}
          </label>
        )}
      </div>
    );
  };

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
      <div className="space-y-6">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço de Custo</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.costPrice}
                  onChange={(e) => setFormData((prev) => ({ ...prev, costPrice: parseFloat(e.target.value) || 0 }))}
                  className="input-number-simple w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço de Venda</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  className="input-number-simple w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  placeholder="0.00"
                />
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stock Atual</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.stock}
                  onChange={(e) => setFormData((prev) => ({ ...prev, stock: parseFloat(e.target.value) || 0 }))}
                  className="input-number-simple w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                  placeholder="Ex: 20"
                />
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
          </div>

          <div className="flex flex-col items-center bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 w-full text-center">
              Imagens do Produto (Até 4)
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {renderImageUploader('image', 'Principal')}
              {renderImageUploader('image2', 'Imagem 2')}
              {renderImageUploader('image3', 'Imagem 3')}
              {renderImageUploader('image4', 'Imagem 4')}
            </div>
          </div>
        </div>

        {/* Conteúdo informativo do produto */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Conteúdo da Página do Produto</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição Curta</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Breve descrição que aparece junto ao preço..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição Completa</label>
            <textarea
              rows={4}
              value={formData.descriptionLong}
              onChange={(e) => setFormData((prev) => ({ ...prev, descriptionLong: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Descrição detalhada do produto (aparece no separador Descrição Completa)..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Benefícios</label>
            <textarea
              rows={4}
              value={formData.benefits}
              onChange={(e) => setFormData((prev) => ({ ...prev, benefits: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Liste os benefícios, um por linha (aparece no separador Benefícios)..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Como Usar</label>
            <textarea
              rows={4}
              value={formData.howToUse}
              onChange={(e) => setFormData((prev) => ({ ...prev, howToUse: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Instruções de uso, um passo por linha (aparece no separador Como Usar)..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ingredientes</label>
            <textarea
              rows={3}
              value={formData.ingredients}
              onChange={(e) => setFormData((prev) => ({ ...prev, ingredients: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Lista de ingredientes (aparece no separador Ingredientes)..."
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
