import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, X, Settings, Loader2, Check, Image as ImageIcon, ArrowRight } from 'lucide-react';
import api from '../../core/services/apiClient';
import uploadService from '../../../services/uploadService';
import { Product } from '../../core/types/types';

interface BannerConfig {
  id: number | null;
  imageUrl: string | null;
  title: string;
  subtitle: string;
  buttonText: string;
  productSlug: string | null;
  productId: string | null;
  isActive: boolean;
}

interface ShopBannerProps {
  isAdmin?: boolean;
  products?: Product[];
  uploadImage?: (file: File) => Promise<string | null>;
}

const DEFAULT_BANNER: BannerConfig = {
  id: null,
  imageUrl: null,
  title: 'Saúde Natural & Bem-Estar',
  subtitle: 'Descubra o poder da natureza com produtos 100% naturais e selecionados',
  buttonText: 'Explorar Produtos',
  productSlug: null,
  productId: null,
  isActive: true,
};

export const ShopBanner: React.FC<ShopBannerProps> = ({ isAdmin = false, products = [], uploadImage }) => {
  const navigate = useNavigate();
  const [banner, setBanner] = useState<BannerConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BannerConfig>(DEFAULT_BANNER);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar banner do backend
  useEffect(() => {
    api.get<BannerConfig>('/banners/active').then(data => {
      setBanner(data || DEFAULT_BANNER);
      setDraft(data || DEFAULT_BANNER);
    }).catch(() => {
      setBanner(DEFAULT_BANNER);
      setDraft(DEFAULT_BANNER);
    });
  }, []);

  const handleOpenEdit = () => {
    setDraft(banner ? { ...banner } : DEFAULT_BANNER);
    setEditing(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadImage) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) setDraft(prev => ({ ...prev, imageUrl: url }));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setDraft(prev => ({ ...prev, imageUrl: null }));
  };

  const handleProductChange = (productId: string) => {
    if (!productId) {
      setDraft(prev => ({ ...prev, productId: null, productSlug: null }));
      return;
    }
    const product = products.find(p => p.id === productId);
    setDraft(prev => ({
      ...prev,
      productId: product?.id || null,
      productSlug: product?.slug || null,
      title: prev.title === DEFAULT_BANNER.title ? (product?.name || prev.title) : prev.title,
      buttonText: prev.buttonText === 'Explorar Produtos' ? `Ver ${product?.name || 'Produto'}` : prev.buttonText,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/banners', {
        imageUrl: draft.imageUrl,
        title: draft.title,
        subtitle: draft.subtitle,
        buttonText: draft.buttonText,
        productSlug: draft.productSlug,
        productId: draft.productId,
      });
      setBanner({ ...draft });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setEditing(false);
      }, 1500);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleBannerClick = () => {
    if (banner?.productSlug) {
      navigate(`/loja/produto/${banner.productSlug}`);
    } else {
      document.getElementById('produtos-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const imageUrl = banner?.imageUrl ? uploadService.getPublicUrl(banner.imageUrl) : null;
  const draftImageUrl = draft.imageUrl ? uploadService.getPublicUrl(draft.imageUrl) : null;

  // Skeleton enquanto carrega do backend
  if (!banner) {
    return (
      <section className="relative h-96 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 animate-pulse" />
      </section>
    );
  }

  return (
    <>
      {/* Banner visível na loja */}
      <section className="relative h-96 overflow-hidden group">
        {/* Imagem de fundo */}
        <div className="absolute inset-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={banner.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <img
              src="https://images.unsplash.com/photo-1761746604770-abc00f8e55b8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1200"
              alt="Ervas naturais"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-green-900/80 to-green-700/50" />
        </div>

        {/* Conteúdo */}
        <div className="relative h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="text-white max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">{banner.title}</h2>
            <p className="text-xl mb-6 text-green-50">{banner.subtitle}</p>
            <button
              onClick={handleBannerClick}
              className="inline-flex items-center gap-2 bg-white text-green-700 font-semibold px-8 py-3 rounded-lg hover:bg-green-50 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              {banner.buttonText}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Botão de edição para admins — aparece ao hover */}
          {isAdmin && (
            <button
              onClick={handleOpenEdit}
              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm text-green-700 hover:bg-white rounded-xl px-4 py-2 flex items-center gap-2 shadow-lg font-medium text-sm"
              title="Editar Banner"
            >
              <Settings className="w-4 h-4" />
              Editar Banner
            </button>
          )}
        </div>
      </section>

      {/* Modal de edição — apenas para admins */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-green-600" />
                Editar Banner da Loja
              </h2>
              <button
                onClick={() => setEditing(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Preview da imagem */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Imagem do Banner
                </label>
                <div className="relative rounded-xl overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 h-48 flex items-center justify-center">
                  {draftImageUrl ? (
                    <>
                      <img
                        src={draftImageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <div className="flex gap-2">
                          <label className="cursor-pointer bg-white text-gray-800 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-gray-100">
                            <Upload className="w-4 h-4" />
                            Trocar
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                          </label>
                          <button
                            onClick={handleRemoveImage}
                            className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-red-700"
                          >
                            <X className="w-4 h-4" />
                            Remover
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-3 text-gray-500 hover:text-green-600 transition-colors">
                      {uploading ? (
                        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                      ) : (
                        <>
                          <ImageIcon className="w-10 h-10" />
                          <span className="text-sm font-medium">Clique para carregar a imagem do banner</span>
                          <span className="text-xs text-gray-400">Recomendado: 1200 × 400px, formato JPG ou PNG</span>
                        </>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
              </div>

              {/* Produto em destaque */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Produto em Destaque
                  <span className="text-gray-400 font-normal ml-2">(opcional — ao clicar direciona para o produto)</span>
                </label>
                <select
                  value={draft.productId || ''}
                  onChange={e => handleProductChange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-800"
                >
                  <option value="">— Sem produto (botão vai para a lista) —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Título */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Título do Banner</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Ex: Produto em Destaque — Chá de Camomila"
                />
              </div>

              {/* Subtítulo */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Subtítulo / Descrição</label>
                <textarea
                  value={draft.subtitle}
                  onChange={e => setDraft(prev => ({ ...prev, subtitle: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  placeholder="Ex: Relaxe e cuide da sua saúde com o nosso produto natural mais vendido"
                />
              </div>

              {/* Texto do botão */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Texto do Botão</label>
                <input
                  type="text"
                  value={draft.buttonText}
                  onChange={e => setDraft(prev => ({ ...prev, buttonText: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Ex: Ver Produto, Comprar Agora, Explorar..."
                />
              </div>

              {/* Preview simplificado */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Pré-visualização</label>
                <div className="relative rounded-xl overflow-hidden h-32 bg-gradient-to-r from-green-900/90 to-green-700/70">
                  {draftImageUrl && (
                    <img src={draftImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-60" />
                  )}
                  <div className="relative h-full flex flex-col justify-center px-6">
                    <p className="text-white font-bold text-lg leading-tight">{draft.title || 'Título do Banner'}</p>
                    <p className="text-green-100 text-sm mt-1 truncate">{draft.subtitle}</p>
                    <button className="mt-2 self-start bg-white text-green-700 text-xs font-semibold px-4 py-1.5 rounded-lg">
                      {draft.buttonText || 'Ver Produto'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setEditing(false)}
                className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.title}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-all flex items-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> A guardar...</>
                ) : saved ? (
                  <><Check className="w-4 h-4" /> Guardado!</>
                ) : (
                  'Guardar Banner'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
