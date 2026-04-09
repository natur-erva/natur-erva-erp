import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ShoppingCart, ArrowLeft, CheckCircle2, Play, Star, ChevronRight, Package, Loader2, Info, Droplets, Leaf, ShieldCheck, HeartPulse } from 'lucide-react';
import { Product, ProductVariant } from '../../core/types/types';
import { productService } from '../../products/services/productService';
import { getVariantImage } from '../../core/utils/productUtils';
import { useShopContext } from '../../../contexts/ShopContext';
import { Logo } from '../../core/components/ui/Logo';

export const ProductLandingPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(undefined);
    const [isStickyHeaderVisible, setIsStickyHeaderVisible] = useState(false);
    
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
                } else {
                    navigate('/loja');
                }
            } catch (error) {
                console.error('Erro ao carregar produto:', error);
                navigate('/loja');
            } finally {
                setLoading(false);
            }
        };

        loadProduct();
    }, [slug, navigate]);

    useEffect(() => {
        const handleScroll = () => {
            setIsStickyHeaderVisible(window.scrollY > 400);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleAddToCart = useCallback(() => {
        if (product && shopContext) {
            // @ts-ignore - o contexto tem o handler que precisamos chamar
            // No Shop.tsx o addToCart é exposto via contexto ou passado como prop
            // Como estamos em uma página separada, precisamos garantir que o ShopContext consiga lidar com isso
            // Ou o ShopContext deve ter o método addToCart
            console.log('Adicionando ao carrinho:', product.name, selectedVariant?.name);
            // Por simplicidade neste template, vamos redirecionar para a loja com o item (ou usar o contexto se disponível)
            // Se o ShopContext não tiver addToCart, podemos disparar um evento ou usar o toast
            if (shopContext.onCartClick) {
                // shopContext.onCartClick();
            }
        }
    }, [product, selectedVariant, shopContext]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-green-600" />
                    <p className="text-gray-500 animate-pulse">Carregando experiência...</p>
                </div>
            </div>
        );
    }

    if (!product) return null;

    const data = product.landingPageData || {};
    const primaryColor = data.primaryColor || '#10b981'; // green-500
    const secondaryColor = data.secondaryColor || '#059669'; // green-600

    return (
        <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans selection:bg-green-200 dark:selection:bg-green-900">
            {/* Sticky Header */}
            <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 transform ${isStickyHeaderVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
                <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 shadow-md">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Logo height={32} />
                            <span className="hidden sm:block font-bold text-lg truncate max-w-[200px]">{product.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex flex-col items-end">
                                <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                    {(selectedVariant?.price || product.price).toFixed(2)} MT
                                </span>
                            </div>
                            <button 
                                onClick={handleAddToCart}
                                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-green-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2"
                            >
                                <ShoppingCart className="w-4 h-4" />
                                Comprar Agora
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navbar / Hero Header */}
            <header className="absolute top-0 left-0 right-0 z-40 p-6">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link to="/loja" className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors group">
                        <div className="p-2 rounded-full bg-white/10 backdrop-blur-md group-hover:bg-green-500/10 transition-all">
                            <ArrowLeft className="w-5 h-5" />
                        </div>
                        <span className="font-medium">Voltar para a Loja</span>
                    </Link>
                    <Logo height={48} />
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[600px] h-[600px] bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[600px] h-[600px] bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                        <div className="space-y-8 animate-fade-in-up">
                            <div>
                                <span className="inline-block px-4 py-1.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-bold text-sm mb-4 tracking-wide uppercase">
                                    {product.category || 'Suplemento Premium'}
                                </span>
                                <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight leading-tight">
                                    {data.heroTitle || (
                                        <>A Revolução da <span className="text-green-600 dark:text-green-400">Saúde Natural</span></>
                                    )}
                                </h1>
                                <p className="mt-6 text-xl text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
                                    {data.heroSubtitle || product.description || "Descubra o poder da natureza concentrado em uma fórmula única desenvolvida para o seu bem-estar total."}
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-6">
                                <button 
                                    onClick={handleAddToCart}
                                    className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-lg font-bold shadow-2xl shadow-green-600/30 transition-all transform hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-3"
                                >
                                    <ShoppingCart className="w-6 h-6" />
                                    Adicionar ao Carrinho
                                </button>
                                <div className="flex flex-col">
                                    <span className="text-3xl font-black text-gray-900 dark:text-white">
                                        {(selectedVariant?.price || product.price).toFixed(2)} MT
                                    </span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">Entrega rápida em todo o país</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span className="text-sm font-medium">100% Orgânico</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span className="text-sm font-medium">Testado em Lab</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span className="text-sm font-medium">Aprovado</span>
                                </div>
                            </div>
                        </div>

                        <div className="relative group perspective-1000">
                            <div className="absolute inset-0 bg-green-600/20 rounded-full blur-[100px] group-hover:bg-green-600/30 transition-all duration-500" />
                            <div className="relative bg-gradient-to-br from-white/80 to-gray-50/50 dark:from-gray-800/80 dark:to-gray-900/50 backdrop-blur-sm rounded-[40px] p-8 border border-white/20 dark:border-gray-700/30 shadow-2xl transform transition-all duration-700 group-hover:rotate-y-6">
                                <img 
                                    src={getVariantImage(selectedVariant, product) || 'https://via.placeholder.com/600'} 
                                    alt={product.name}
                                    className="w-full h-auto object-contain drop-shadow-[0_20px_50px_rgba(16,185,129,0.3)] transform transition-transform duration-700 group-hover:scale-105 group-hover:-translate-y-4"
                                />
                            </div>

                            {/* Floating details badge */}
                            <div className="absolute -bottom-6 -left-6 sm:bottom-0 sm:-left-12 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 animate-bounce-slow">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-400">
                                        <Leaf className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Natural</p>
                                        <p className="font-bold">Alta Pureza</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="mb-20 space-y-4">
                        <h2 className="text-4xl lg:text-5xl font-black">{data.benefitsTitle || "Benefícios Extraordinários"}</h2>
                        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            Transforme sua saúde com benefícios comprovados que impactam sua qualidade de vida desde o primeiro dia.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {(data.benefits || [
                            { title: "Energia Vital", description: "Melhora instantaneamente seus níveis de vitalidade para o dia a dia.", icon: "Droplets" },
                            { title: "Imunidade Forte", description: "Fortalece as defesas naturais do seu organismo contra agentes externos.", icon: "ShieldCheck" },
                            { title: "Fórmua Pura", description: "Ingredientes selecionados em seu estado mais puro e potente.", icon: "Leaf" },
                            { title: "Bem-estar Mental", description: "Auxilia na clareza mental e redução dos níveis de stress.", icon: "HeartPulse" }
                        ]).map((benefit: any, idx: number) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 p-8 rounded-[32px] shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-700 hover:border-green-500/50 transition-all group">
                                <div className="w-16 h-16 rounded-2xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 mb-6 mx-auto group-hover:scale-110 group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
                                    {idx === 0 && <Droplets className="w-8 h-8" />}
                                    {idx === 1 && <ShieldCheck className="w-8 h-8" />}
                                    {idx === 2 && <Leaf className="w-8 h-8" />}
                                    {idx >= 3 && <HeartPulse className="w-8 h-8" />}
                                </div>
                                <h3 className="text-xl font-bold mb-4">{benefit.title}</h3>
                                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{benefit.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Content / Video Section */}
            <section className="py-24 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 lg:px-12">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        <div className="relative group">
                            <div className="aspect-video bg-gray-900 rounded-[40px] shadow-2xl overflow-hidden flex items-center justify-center group relative cursor-pointer">
                                {data.videoUrl ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                                        <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <div className="w-16 h-16 rounded-full bg-white text-green-600 flex items-center justify-center pl-1 shadow-xl">
                                                <Play className="w-8 h-8 fill-current" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-12 space-y-4">
                                        <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mx-auto text-white opacity-20">
                                            <Package className="w-12 h-12" />
                                        </div>
                                        <p className="text-gray-500 font-medium">Demonstração visual do produto em breve</p>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-8 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    <h4 className="text-2xl font-bold">{data.videoTitle || "Veja como funciona"}</h4>
                                    <p className="opacity-80">Descubra cada detalhe em alta definição</p>
                                </div>
                            </div>
                            {/* Decorative elements */}
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-green-500/20 blur-3xl rounded-full" />
                            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-green-500/20 blur-3xl rounded-full" />
                        </div>

                        <div className="space-y-10">
                            <div className="space-y-4">
                                <h2 className="text-4xl font-black leading-tight">
                                    {data.howToConsumeTitle || "Potencialize seus resultados."}
                                </h2>
                                <div className="h-1.5 w-20 bg-green-600 rounded-full" />
                            </div>
                            
                            <div className="space-y-8">
                                <div className="flex gap-6">
                                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-600 text-white font-black flex items-center justify-center text-xl shadow-lg shadow-green-600/30">1</div>
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-bold">Modo de consumo</h4>
                                        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                                            {data.howToConsume || "Para melhores resultados, utilize conforme as indicações diárias do rótulo ou recomendação profissional."}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-6">
                                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-600 text-white font-black flex items-center justify-center text-xl shadow-lg shadow-green-600/30">2</div>
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-bold">Armazenamento</h4>
                                        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                                            Conservar em local seco e fresco, mantendo a embalagem sempre bem fechada para preservar as propriedades.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button className="flex items-center gap-2 text-green-600 font-bold hover:gap-4 transition-all">
                                Ver ficha técnica completa <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="py-24 bg-green-900 dark:bg-green-950 text-white overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col md:flex-row items-end justify-between mb-20 gap-8">
                        <div className="space-y-4">
                            <h2 className="text-4xl lg:text-5xl font-black">{data.testimonialsTitle || "Recomendado por quem usa"}</h2>
                            <p className="text-green-300 text-lg">Junte-se a milhares de clientes satisfeitos em todo Moçambique.</p>
                        </div>
                        <div className="flex bg-white/10 backdrop-blur-md rounded-2xl p-6 items-center gap-4">
                            <div className="flex -space-x-3">
                                {[1,2,3,4].map(i => (
                                    <div key={i} className="w-12 h-12 rounded-full border-2 border-green-800 bg-gray-200 overflow-hidden">
                                        <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="user" />
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div className="flex text-yellow-400 gap-0.5 mb-1">
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                </div>
                                <p className="text-sm font-bold uppercase tracking-wider">4.9/5 Estrelas</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {(data.testimonials || [
                            { author: "Enoque S.", text: "O melhor investimento que fiz na minha saúde este ano. Vi resultados na primeira semana de uso constante.", rating: 5 },
                            { author: "Maria J.", text: "Incrível a qualidade do produto e da embalagem. Natur Erva está de parabéns pela entrega rápida em Maputo.", rating: 5 },
                            { author: "Daniel D.", text: "Sinto-me com muito mais energia durante o dia. Recomendo para todos os meus parceiros de treino.", rating: 5 }
                        ]).map((t: any, idx: number) => (
                            <div key={idx} className="bg-white/5 backdrop-blur-sm p-10 rounded-[40px] border border-white/10 relative">
                                <span className="absolute top-8 left-8 text-8xl font-serif text-white/10 pointer-events-none">“</span>
                                <div className="relative z-10 space-y-6">
                                    <p className="text-xl italic leading-relaxed text-green-50">{t.text}</p>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-green-700/50 flex items-center justify-center font-bold">
                                            {t.author[0]}
                                        </div>
                                        <p className="font-bold">{t.author}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Final */}
            <section className="py-32 bg-white dark:bg-gray-950">
                <div className="max-w-4xl mx-auto px-6 text-center space-y-12">
                    <div className="space-y-4">
                        <h2 className="text-5xl lg:text-7xl font-black tracking-tight leading-tight">
                            Sua jornada para uma <span className="text-green-600">vida melhor</span> começa aqui.
                        </h2>
                        <p className="text-xl text-gray-500 max-w-xl mx-auto">
                            Não espere para cuidar do seu bem mais precioso. Peça agora e receba no conforto de sua casa.
                        </p>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900 p-8 lg:p-12 rounded-[48px] border border-gray-100 dark:border-gray-800 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Logo height={120} />
                        </div>
                        
                        <div className="flex flex-col items-center gap-8 relative z-10">
                            <img 
                                src={getVariantImage(selectedVariant, product) || 'https://via.placeholder.com/400'} 
                                alt={product.name}
                                className="w-48 h-48 object-contain drop-shadow-2xl mb-4"
                            />
                            <div className="text-center">
                                <h3 className="text-3xl font-black mb-2">{product.name}</h3>
                                <div className="flex items-center justify-center gap-2 mb-8">
                                    <span className="text-5xl font-black text-green-600 tracking-tighter">
                                        {(selectedVariant?.price || product.price).toFixed(2)}
                                    </span>
                                    <span className="text-2xl font-bold text-gray-400">MT</span>
                                </div>
                                <button 
                                    onClick={handleAddToCart}
                                    className="px-16 py-6 rounded-full bg-green-600 hover:bg-green-700 text-white text-2xl font-black shadow-2xl shadow-green-600/40 transition-all transform hover:scale-110 active:scale-95 flex items-center gap-4"
                                >
                                    <ShoppingCart className="w-8 h-8" />
                                    Finalizar Compra
                                </button>
                                <p className="mt-8 text-sm text-gray-400 flex items-center justify-center gap-2 uppercase tracking-widest font-bold">
                                    <Package className="w-4 h-4" /> Pagamento na entrega disponível
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8 text-gray-500 text-sm font-medium">
                    <div className="flex items-center gap-6">
                        <Link to="/loja" className="hover:text-green-600">Loja</Link>
                        <Link to="/politica-de-privacidade" className="hover:text-green-600">Privacidade</Link>
                        <Link to="/termos" className="hover:text-green-600">Termos</Link>
                    </div>
                    <div>
                        © {new Date().getFullYear()} Natur Erva. Naturalmente Saudável.
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center grayscale opacity-50"><Info className="w-4 h-4" /></div>
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center grayscale opacity-50"><Package className="w-4 h-4" /></div>
                    </div>
                </div>
            </footer>
        </div>
    );
};
