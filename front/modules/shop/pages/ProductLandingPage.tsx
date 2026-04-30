import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShoppingCart, Heart, Star, Truck, Shield,
  RotateCcw, Check, Loader2, Package,
} from 'lucide-react';
import { Product, ProductVariant } from '../../core/types/types';
import { productService } from '../../products/services/productService';
import { getVariantImage } from '../../core/utils/productUtils';
import { useShopContext } from '../../../contexts/ShopContext';
import { Logo } from '../../core/components/ui/Logo';
import {
  getProductRating,
  getProductReviews,
  ProductReview,
  RatingStats,
} from '../../products/services/reviewService';

export const ProductLandingPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(undefined);
    const [quantity, setQuantity] = useState(1);
    const [selectedTab, setSelectedTab] = useState<'description' | 'benefits' | 'usage'>('description');
    const [selectedImage, setSelectedImage] = useState('');
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [ratingStats, setRatingStats] = useState<RatingStats | null>(null);
    const [wishlist, setWishlist] = useState(false);

    const shopContext = useShopContext();

    useEffect(() => {
        const loadProduct = async () => {
            if (!slug) return;
            setLoading(true);
            try {
                const p = await productService.getProductBySlug(slug);
                if (p) {
                    setProduct(p);
                    const defaultV = p.variants?.find(v => v.isDefault) || p.variants?.[0];
                    setSelectedVariant(defaultV);
                    setSelectedImage(getVariantImage(defaultV, p));
                    const [stats, reviewList, allProducts] = await Promise.all([
                        getProductRating(p.id),
                        getProductReviews(p.id),
                        productService.getProducts(),
                    ]);
                    setRatingStats(stats);
                    setReviews(reviewList.slice(0, 5));
                    const related = allProducts
                        .filter(pr => pr.id !== p.id && pr.category === p.category && pr.showInShop)
                        .slice(0, 4);
                    setRelatedProducts(related);
                }
            } catch {
                console.error('Erro ao carregar produto');
            } finally {
                setLoading(false);
            }
        };

        loadProduct();
    }, [slug]);

    const handleAddToCart = useCallback(() => {
        if (!product) return;
        console.log('Adicionando ao carrinho:', product.name, selectedVariant?.name);
        if (shopContext?.onCartClick) {
            shopContext.onCartClick();
        }
    }, [product, selectedVariant, shopContext]);

    const displayPrice = (selectedVariant?.price ?? product?.price ?? 0).toFixed(2);

    const galleryImages: string[] = product
        ? [
              getVariantImage(selectedVariant, product),
              ...(product.variants?.map(v => v.image).filter((img): img is string => Boolean(img)) ?? []),
          ].filter((img, i, arr) => Boolean(img) && arr.indexOf(img) === i)
        : [];

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 animate-spin text-green-600" />
            </div>
        );
    }

    if (!product) return null;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Product Section */}
            <section className="max-w-7xl mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Gallery */}
                    <div>
                        <div className="bg-white rounded-xl overflow-hidden shadow-md mb-4 aspect-square flex items-center justify-center">
                            <img
                                src={selectedImage || galleryImages[0] || 'https://via.placeholder.com/600?text=Sem+Imagem'}
                                alt={product.name}
                                className="w-full h-full object-contain p-6"
                            />
                        </div>
                        {galleryImages.length > 1 && (
                            <div className="flex gap-3 flex-wrap">
                                {galleryImages.slice(0, 4).map((img, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedImage(img)}
                                        className={`w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 ${
                                            selectedImage === img ? 'border-green-500' : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <img src={img} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div>
                        <span className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm mb-3">
                            {product.category || 'Natural'}
                        </span>
                        <h1 className="text-4xl text-gray-800 mb-3 leading-tight">{product.name}</h1>

                        {/* Stars */}
                        <div className="flex items-center gap-3 mb-5">
                            <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star
                                        key={star}
                                        className={`w-5 h-5 ${star <= Math.round(ratingStats?.average ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                    />
                                ))}
                            </div>
                            <span className="text-gray-500 text-sm">
                                {ratingStats && ratingStats.total > 0
                                    ? `${ratingStats.average.toFixed(1)} (${ratingStats.total} avaliações)`
                                    : 'Sem avaliações ainda'}
                            </span>
                        </div>

                        {/* Price */}
                        <div className="flex items-baseline gap-2 mb-5">
                            <span className="text-5xl text-green-700 font-semibold">{displayPrice}</span>
                            <span className="text-2xl text-gray-400">MT</span>
                        </div>

                        <p className="text-gray-600 leading-relaxed mb-6">{product.description}</p>

                        {/* Variants */}
                        {product.variants && product.variants.length > 0 && (
                            <div className="mb-6">
                                <p className="text-gray-700 mb-2 font-medium">Variante:</p>
                                <div className="flex flex-wrap gap-2">
                                    {product.variants.map(v => (
                                        <button
                                            key={v.id}
                                            onClick={() => {
                                                setSelectedVariant(v);
                                                setSelectedImage(getVariantImage(v, product));
                                            }}
                                            className={`px-4 py-2 rounded-lg border-2 text-sm transition-colors ${
                                                selectedVariant?.id === v.id
                                                    ? 'border-green-500 bg-green-50 text-green-700'
                                                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                            }`}
                                        >
                                            {v.name}{v.price ? ` — ${v.price.toFixed(2)} MT` : ''}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quantity + Add to Cart */}
                        <div className="border-t border-b border-gray-200 py-6 mb-6">
                            <div className="flex items-center gap-4 mb-4">
                                <span className="text-gray-700 font-medium">Quantidade:</span>
                                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        className="px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700 font-bold"
                                    >
                                        -
                                    </button>
                                    <span className="px-6 py-2 border-x border-gray-300 text-gray-800">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(q => q + 1)}
                                        className="px-4 py-2 hover:bg-gray-100 transition-colors text-gray-700 font-bold"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleAddToCart}
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-4 rounded-lg flex items-center justify-center gap-2 transition-colors font-medium"
                                >
                                    <ShoppingCart className="w-5 h-5" />
                                    Adicionar ao Carrinho
                                </button>
                                <button
                                    onClick={() => setWishlist(w => !w)}
                                    className={`border-2 p-4 rounded-lg transition-colors ${
                                        wishlist
                                            ? 'border-red-400 bg-red-50 text-red-500'
                                            : 'border-green-600 text-green-600 hover:bg-green-50'
                                    }`}
                                >
                                    <Heart className={`w-5 h-5 ${wishlist ? 'fill-current' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Benefit boxes */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <Truck className="w-6 h-6 text-green-600 mx-auto mb-1" />
                                <p className="text-xs font-medium text-gray-700">Entrega Rápida</p>
                                <p className="text-xs text-gray-500">Todo o país</p>
                            </div>
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <Shield className="w-6 h-6 text-green-600 mx-auto mb-1" />
                                <p className="text-xs font-medium text-gray-700">100% Natural</p>
                                <p className="text-xs text-gray-500">Certificado</p>
                            </div>
                            <div className="text-center p-4 bg-green-50 rounded-lg">
                                <RotateCcw className="w-6 h-6 text-green-600 mx-auto mb-1" />
                                <p className="text-xs font-medium text-gray-700">Garantia</p>
                                <p className="text-xs text-gray-500">30 dias</p>
                            </div>
                        </div>

                        {/* Product info checklist */}
                        <div className="bg-gray-50 rounded-lg p-5">
                            <h3 className="text-base font-semibold text-gray-800 mb-3">Informações do Produto</h3>
                            <ul className="space-y-2">
                                {([
                                    '100% natural e sem aditivos artificiais',
                                    'Selecionado e testado com rigor de qualidade',
                                    'Produção sustentável e responsável',
                                    `Categoria: ${product.category || 'Natural'}`,
                                    product.variants && product.variants.length > 0
                                        ? `${product.variants.length} variantes disponíveis`
                                        : null,
                                ] as (string | null)[])
                                    .filter((item): item is string => item !== null)
                                    .map((item, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-gray-600 text-sm">{item}</span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tabs Section */}
            <section className="max-w-7xl mx-auto px-4 py-10">
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="border-b border-gray-200 flex">
                        {(
                            [
                                { key: 'description', label: 'Descrição Completa' },
                                { key: 'benefits', label: 'Benefícios' },
                                { key: 'usage', label: 'Como Usar' },
                            ] as const
                        ).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setSelectedTab(key)}
                                className={`px-7 py-4 text-sm transition-colors ${
                                    selectedTab === key
                                        ? 'border-b-2 border-green-600 text-green-600 font-medium'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="p-8">
                        {selectedTab === 'description' && (
                            <p className="text-gray-600 leading-relaxed">
                                {product.descriptionLong || product.description || 'Sem descrição disponível.'}
                            </p>
                        )}
                        {selectedTab === 'benefits' && (
                            <div className="grid md:grid-cols-2 gap-4">
                                {[
                                    '100% orgânico e natural',
                                    'Sem conservantes ou aditivos artificiais',
                                    'Rico em nutrientes e compostos ativos',
                                    'Auxilia no bem-estar geral',
                                    'Produção certificada e rastreável',
                                    'Adequado para uso diário',
                                ].map((b, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                        <span className="text-gray-600 text-sm">{b}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {selectedTab === 'usage' && (
                            <ol className="space-y-4">
                                {[
                                    'Consulte a embalagem para a dosagem recomendada.',
                                    'Utilize com água ou conforme indicação do produto.',
                                    'Para melhores resultados, use de forma regular.',
                                    'Guarde em local seco, fresco e fora do alcance de crianças.',
                                ].map((step, i) => (
                                    <li key={i} className="flex gap-4 items-start">
                                        <span className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                            {i + 1}
                                        </span>
                                        <p className="text-gray-600 pt-1 text-sm leading-relaxed">{step}</p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </section>

            {/* Reviews Section */}
            <section className="max-w-7xl mx-auto px-4 py-10">
                <div className="bg-white rounded-lg shadow-sm p-8">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-6">Avaliações de Clientes</h2>
                    {ratingStats && ratingStats.total > 0 ? (
                        <>
                            <div className="flex flex-col sm:flex-row items-start gap-8 mb-8 pb-8 border-b border-gray-100">
                                <div className="text-center flex-shrink-0">
                                    <div className="text-5xl font-bold text-gray-800 mb-1">{ratingStats.average.toFixed(1)}</div>
                                    <div className="flex justify-center mb-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <Star key={star} className={`w-4 h-4 ${star <= Math.round(ratingStats.average) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                        ))}
                                    </div>
                                    <p className="text-gray-500 text-xs">{ratingStats.total} avaliações</p>
                                </div>
                                <div className="flex-1 w-full">
                                    {[5, 4, 3, 2, 1].map(star => {
                                        const count = reviews.filter(r => r.rating === star).length;
                                        const pct = ratingStats.total > 0 ? Math.round((count / ratingStats.total) * 100) : 0;
                                        return (
                                            <div key={star} className="flex items-center gap-3 mb-1.5">
                                                <span className="text-xs text-gray-500 w-6">{star}★</span>
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-xs text-gray-400 w-5">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-6">
                                {reviews.map((review, i) => (
                                    <div key={review.id || i} className="border-b border-gray-100 pb-5 last:border-0">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
                                                    {(review.user_name?.[0] ?? '?').toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-800 text-sm">{review.user_name}</p>
                                                    <div className="flex">
                                                        {[1, 2, 3, 4, 5].map(star => (
                                                            <Star key={star} className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString('pt-PT')}</span>
                                        </div>
                                        <p className="text-gray-600 text-sm leading-relaxed pl-13">{review.comment}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-10">
                            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-400">Ainda não há avaliações para este produto.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Related Products */}
            {relatedProducts.length > 0 && (
                <section className="max-w-7xl mx-auto px-4 py-10">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-6">Produtos Relacionados</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {relatedProducts.map(p => (
                            <Link key={p.id} to={`/loja/produto/${p.slug}`} className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 group">
                                <div className="relative h-48 overflow-hidden bg-gray-50">
                                    <img
                                        src={p.image || 'https://via.placeholder.com/400?text=Sem+Imagem'}
                                        alt={p.name}
                                        className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                                    />
                                    {p.category && (
                                        <span className="absolute top-3 right-3 bg-green-600 text-white px-2 py-0.5 rounded-full text-xs">{p.category}</span>
                                    )}
                                </div>
                                <div className="p-4">
                                    <h3 className="font-semibold text-gray-800 mb-1 line-clamp-1">{p.name}</h3>
                                    <p className="text-gray-500 text-xs mb-3 line-clamp-2">{p.description}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-green-700 font-semibold">{(p.price || 0).toFixed(2)} MT</span>
                                        <span className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">
                                            <ShoppingCart className="w-3.5 h-3.5" />
                                            Ver
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};
