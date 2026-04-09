import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Product, ProductVariant } from '../../../core/types/types';
import { ShoppingCart, Package, Bell, X, Star } from 'lucide-react';
import { getVariantImage } from '../../../core/utils/productUtils';

export const ProductCardSkeleton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
    return (
        <div className={`backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 ${isMobile ? 'rounded-xl' : 'rounded-2xl'} shadow-lg overflow-hidden border border-white/20 dark:border-gray-700/50`}>
            <div className={`relative w-full ${isMobile ? 'h-48' : 'h-72 sm:h-80'} bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 animate-pulse`} />
            <div className={`${isMobile ? 'p-2' : 'p-2 sm:p-3'} space-y-2`}>
                <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${isMobile ? 'w-3/4' : 'w-full'}`} />
                <div className={`h-5 bg-gray-300 dark:bg-gray-600 rounded animate-pulse ${isMobile ? 'w-1/2' : 'w-1/3'}`} />
                {isMobile && (
                    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                )}
            </div>
        </div>
    );
};

const ProductCardComponent: React.FC<{
    product: Product;
    onAddToCart: (product: Product, variant?: ProductVariant) => void;
    onNotify?: () => void;
    index?: number;
    isMobile?: boolean;
    showFeaturedBadge?: boolean;
}> = ({ product, onAddToCart, onNotify, index = 0, isMobile = false, showFeaturedBadge = false }) => {
    // Filtrar apenas variações com stock para seleção (memoizado)
    const availableVariants = useMemo(() =>
        product.variants?.filter(v => v.stock > 0) || [],
        [product.variants]
    );

    const defaultVariant = useMemo(() =>
        product.variants?.find(v => v.isDefault && v.stock > 0) || availableVariants[0] || product.variants?.[0],
        [product.variants, availableVariants]
    );

    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(defaultVariant);
    const [showVariantModal, setShowVariantModal] = useState(false);
    const [modalSelectedVariant, setModalSelectedVariant] = useState<ProductVariant | undefined>(defaultVariant);
    const hasVariants = product.variants && product.variants.length > 0;
    const hasTrackedViewRef = useRef(false);

    // Atualizar variação selecionada quando o produto mudar
    useEffect(() => {
        // Sempre usar uma variação com stock disponível
        const variantWithStock = availableVariants.length > 0
            ? availableVariants[0]
            : product.variants?.[0];
        setSelectedVariant(variantWithStock || defaultVariant);
    }, [product.id, availableVariants, defaultVariant]);

    // Rastrear visualização do produto usando Intersection Observer
    useEffect(() => {
        if (hasTrackedViewRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !hasTrackedViewRef.current) {
                        hasTrackedViewRef.current = true;
                        // @ts-ignore
                        if (window.__trackProductView) {
                            // @ts-ignore
                            window.__trackProductView(product.id, product.name);
                        }
                    }
                });
            },
            { threshold: 0.5 }
        );

        const cardElement = document.querySelector(`[data-product-id="${product.id}"]`);
        if (cardElement) {
            observer.observe(cardElement);
        }

        return () => {
            if (cardElement) {
                observer.unobserve(cardElement);
            }
        };
    }, [product.id, product.name]);

    const handleAddToCart = () => {
        if (hasVariants && availableVariants.length > 1) {
            setModalSelectedVariant(availableVariants[0]);
            setShowVariantModal(true);
        } else {
            onAddToCart(product, selectedVariant);
        }
    };

    const handleConfirmAddFromModal = () => {
        if (modalSelectedVariant) {
            onAddToCart(product, modalSelectedVariant);
            setShowVariantModal(false);
        }
    };

    const handleNotify = () => {
        if (onNotify) {
            onNotify();
        }
    };

    const currentPrice = selectedVariant?.price || product.price;
    const currentStock = selectedVariant?.stock ?? product.variants?.[0]?.stock ?? 0;
    const currentUnit = selectedVariant?.unit || product.unit;
    const hasStock = currentStock > 0;
    const displayName = selectedVariant?.name ? `${product.name} - ${selectedVariant.name}` : product.name;

    return (
        <div
            data-product-id={product.id}
            className={`backdrop-blur-xl bg-white/80 dark:bg-gray-800/80 ${isMobile ? 'rounded-xl' : 'rounded-2xl'} shadow-lg overflow-hidden border border-white/20 dark:border-gray-700/50 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group`}
            style={{ animationDelay: `${index * 50}ms` }}
        >
            {/* Imagem do Produto */}
            <Link to={`/loja/produto/${product.slug}`} className="block relative w-full overflow-hidden group">
                <div className={`relative w-full ${isMobile ? 'h-48' : 'h-72 sm:h-80'} bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800`}>
                    {(() => {
                        const imageUrl = getVariantImage(selectedVariant, product);
                        return imageUrl && !imageUrl.includes('placeholder') ? (
                            <img
                                src={imageUrl}
                                alt={displayName}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                loading="lazy"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=400&fit=crop';
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800">
                                <Package className="w-16 h-16 text-green-600 dark:text-green-400 opacity-50" />
                            </div>
                        );
                    })()}
                    {showFeaturedBadge && (
                        <div className="absolute top-2 left-2 z-10">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/95 text-white text-[10px] font-semibold shadow-lg">
                                <Star className="w-3 h-3 fill-current" />
                                Destaque
                            </span>
                        </div>
                    )}
                    {!hasStock && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white font-bold text-xs px-2 py-0.5 bg-red-500/80 rounded">
                                Sem Stock
                            </span>
                        </div>
                    )}
                </div>
            </Link>

            {/* Conteúdo */}
            <div className={`${isMobile ? 'p-2' : 'p-2 sm:p-3'} space-y-1.5`}>
                {/* Nome e Preço */}
                <div>
                    <Link to={`/loja/produto/${product.slug}`} className="block hover:text-green-600 transition-colors">
                        <h3 className={`${isMobile ? 'text-xs' : 'text-sm sm:text-base'} font-semibold text-gray-900 dark:text-white line-clamp-2`}>
                            {product.name}
                        </h3>
                    </Link>
                    <div className="flex items-baseline gap-1">
                        <span className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold text-green-600 dark:text-green-400`}>
                            {currentPrice.toFixed(2)} MT
                        </span>
                        {currentUnit && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                / {currentUnit}
                            </span>
                        )}
                    </div>
                </div>

                {/* Botão de Ação */}
                {hasStock ? (
                    <button
                        onClick={handleAddToCart}
                        className={`${isMobile ? 'w-full text-[11px] py-1.5' : 'w-full text-sm py-2'} bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors`}
                    >
                        <ShoppingCart className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} />
                        <span>Adicionar</span>
                    </button>
                ) : (
                    <button
                        onClick={handleNotify}
                        className={`${isMobile ? 'w-full text-[11px] py-1.5' : 'w-full text-sm py-2'} bg-gray-400 dark:bg-gray-600 text-white font-medium rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed opacity-75`}
                        disabled
                    >
                        <Bell className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} />
                        <span>Notificar</span>
                    </button>
                )}
            </div>

            {/* Modal de escolha de variante - Portal para sair do card (overflow-hidden) */}
            {showVariantModal && typeof document !== 'undefined' && createPortal(
                <>
                    <div
                        className="fixed inset-0 min-h-screen min-w-full z-[100] modal-overlay"
                        onClick={() => setShowVariantModal(false)}
                        aria-hidden="true"
                    />
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div
                            className="relative w-full max-w-sm max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-xl flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Escolher variante</h3>
                                <button
                                    onClick={() => setShowVariantModal(false)}
                                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    aria-label="Fechar"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto">
                                <div className="flex gap-4 mb-4">
                                    <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                                        {(() => {
                                            const imgUrl = getVariantImage(modalSelectedVariant, product);
                                            return imgUrl && !imgUrl.includes('placeholder') ? (
                                                <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Package className="w-8 h-8 text-gray-400" />
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-gray-900 dark:text-white truncate">{product.name}</h4>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Selecione a opção desejada:</p>
                                <div className="space-y-2">
                                    {availableVariants.map((v) => (
                                        <button
                                            key={v.id}
                                            onClick={() => setModalSelectedVariant(v)}
                                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors border-2 ${
                                                modalSelectedVariant?.id === v.id
                                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-white'
                                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <span className="font-medium">{v.name}</span>
                                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                                {v.price.toFixed(2)} MT {v.unit ? `/ ${v.unit}` : ''}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                                <button
                                    onClick={() => setShowVariantModal(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmAddFromModal}
                                    disabled={!modalSelectedVariant}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <ShoppingCart className="h-4 w-4" />
                                    Adicionar ao carrinho
                                </button>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

// Memoizar ProductCard para evitar re-renders desnecessários
export const ProductCard = memo(ProductCardComponent, (prevProps, nextProps) => {
  // Comparação customizada - só re-renderizar se produto ou callbacks mudarem
  const prevStock = prevProps.product.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? 0;
  const nextStock = nextProps.product.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? 0;
  return (
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.price === nextProps.product.price &&
    prevStock === nextStock &&
    prevProps.isMobile === nextProps.isMobile &&
    prevProps.showFeaturedBadge === nextProps.showFeaturedBadge
  );
});
