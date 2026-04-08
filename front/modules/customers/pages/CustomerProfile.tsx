import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, UserRole, LoyaltyTier } from '../../core/types/types';
import { customerProfileService } from '../services/customerProfileService';
import { dataService } from '../../core/services/dataService';
import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';
import { useMobile } from '../../core/hooks/useMobile';
import { Toast } from '../../core/components/ui/Toast';
import {
  User as UserIcon,
  Award,
  TrendingUp,
  Target,
  Share2,
  Star,
  Gift,
  BarChart3,
  Copy,
  Check,
  Download,
  ExternalLink,
  ArrowLeft,
  Package,
  Search,
  Moon,
  Sun,
  Settings,
  LogOut
} from 'lucide-react';
import { Logo } from '../../core/components/ui/Logo';
import { PointsHistory } from '../components/profile/PointsHistory';
import { InsightsChart } from '../components/profile/InsightsChart';
import { AchievementsGrid } from '../components/profile/AchievementsGrid';
import { AffiliateDashboard } from '../components/profile/AffiliateDashboard';
import { ActionCard } from '../components/profile/ActionCard';
import { GoalProgress } from '../components/profile/GoalProgress';
import { PointsChart } from '../components/profile/PointsChart';
import { StatsCard } from '../components/profile/StatsCard';
import { TierBadge } from '../components/profile/TierBadge';
import { LoadingSkeleton } from '../components/profile/LoadingSkeleton';
import { EmptyState } from '../components/profile/EmptyState';
import { ToastContainer } from '../../core/components/ui/Toast';
import { CompleteProfileModal } from '../components/profile/CompleteProfileModal';
import { ShareProductModal } from '../components/profile/ShareProductModal';
import { ReviewProductModal } from '../components/profile/ReviewProductModal';
import { Avatar } from '../../core/components/ui/Avatar';

interface CustomerProfileProps {
  user: User;
  onBack?: () => void;
  onLogout?: () => void;
  showToast?: (message: string, type: Toast['type'], duration?: number) => void;
}

const BASE_PATH = '/';

export const CustomerProfile: React.FC<CustomerProfileProps> = ({
  user,
  onBack,
  onLogout,
  showToast
}) => {
  const navigate = useNavigate();
  const isMobile = useMobile(768);
  const [activeTab, setActiveTab] = useState<'overview' | 'points' | 'insights' | 'achievements' | 'affiliate' | 'goals'>('overview');
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);
  const [points, setPoints] = useState(0);
  const [actions, setActions] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [affiliateData, setAffiliateData] = useState<any>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showCompleteProfileModal, setShowCompleteProfileModal] = useState(false);
  const [showShareProductModal, setShowShareProductModal] = useState(false);
  const [showReviewProductModal, setShowReviewProductModal] = useState(false);

  // Função local de toast se não for fornecida
  const localShowToast = useCallback((message: string, type: Toast['type'] = 'info', duration?: number) => {
    if (showToast) {
      showToast(message, type, duration);
    } else {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts(prev => [...prev, { id, message, type, duration }]);
    }
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    loadProfileData();
  }, [user]);

  const loadProfileData = async () => {
    setLoading(true);
    try {
      // Buscar dados do cliente
      const customers = await dataService.getCustomers();
      let foundCustomer = customers.find(
        c => c.id === user.customerId ||
          c.phone === user.phone ||
          (user.email && c.email === user.email)
      );

      // Se não encontrou cliente, tentar criar um baseado nos dados do usuário
      if (!foundCustomer && (user.phone || user.email)) {
        try {
          // Criar cliente automaticamente
          console.log('Criando cliente automaticamente para o usuário...');

          const newCustomer = await dataService.addCustomer({
            name: user.name,
            phone: user.phone || '',
            email: user.email,
            address: '',
            notes: `Cliente criado automaticamente a partir do perfil do usuário (${user.email || user.phone})`
          });

          if (newCustomer) {
            foundCustomer = newCustomer;

            // Vincular cliente ao perfil do usué¡rio
            if (supabase && isSupabaseConfigured()) {
              const { error: updateError } = await supabase
                .from('profiles')
                .update({ customer_id: newCustomer.id })
                .eq('id', user.id);

              if (updateError) {
                console.warn('Erro ao vincular cliente ao perfil:', updateError);
              } else {
                console.log('âœ… Cliente criado e vinculado ao perfil com sucesso!');
                // Atualizar o user.customerId localmente
                user.customerId = newCustomer.id;
              }
            }
          }
        } catch (error) {
          console.warn('Erro ao criar cliente automaticamente:', error);
          // Continuar sem cliente - seré¡ mostrada mensagem apropriada
        }
      }

      if (foundCustomer) {
        setCustomer(foundCustomer);
        setPoints(foundCustomer.loyaltyPoints || 0);

        // Carregar dados adicionais
        const [actionsData, insightsData, achievementsData, goalsData, affiliate] = await Promise.all([
          customerProfileService.getCustomerActions(foundCustomer.id),
          customerProfileService.getCustomerInsights(foundCustomer.id),
          customerProfileService.getCustomerAchievements(foundCustomer.id),
          customerProfileService.getCustomerGoals(foundCustomer.id, 'active'),
          customerProfileService.getAffiliateData(foundCustomer.id)
        ]);

        setActions(actionsData);
        setInsights(insightsData);
        setAchievements(achievementsData);
        setGoals(goalsData);
        setAffiliateData(affiliate);
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyAffiliateLink = () => {
    if (affiliateData?.affiliateLink) {
      navigator.clipboard.writeText(affiliateData.affiliateLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleCompleteProfile = () => {
    if (customer?.email && customer?.address) {
      localShowToast('Seu perfil já está completo!', 'info');
      return;
    }
    setShowCompleteProfileModal(true);
  };

  const handleShareProduct = () => {
    setShowShareProductModal(true);
  };

  const handleReviewProduct = () => {
    setShowReviewProductModal(true);
  };

  // Função para verificar se ação foi completada
  const checkActionCompleted = useCallback((actionType: string): boolean => {
    return actions.some(
      action => action.actionType === actionType &&
        action.customerId === customer?.id
    );
  }, [actions, customer?.id]);

  const availableActions = useMemo(() => [
    {
      id: 'complete_profile',
      type: 'completar_perfil',
      title: 'Completar Perfil',
      description: 'Adicione suas Informações pessoais',
      points: 50,
      completed: checkActionCompleted('completar_perfil') || (customer?.email && customer?.address)
    },
    {
      id: 'share_product',
      type: 'partilhar_produto',
      title: 'Partilhar Produto',
      description: 'Partilhe um produto nas redes sociais',
      points: 10,
      completed: checkActionCompleted('partilhar_produto')
    },
    {
      id: 'review_product',
      type: 'avaliar_produto',
      title: 'Avaliar Produto',
      description: 'Avalie um produto que comprou',
      points: 20,
      completed: checkActionCompleted('avaliar_produto')
    }
  ], [checkActionCompleted, customer]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className={`max-w-7xl mx-auto ${isMobile ? 'px-2 py-4' : 'px-4 sm:px-6 lg:px-8 py-8'}`}>
          <LoadingSkeleton type="stats" count={4} />
          <div className={isMobile ? 'mt-4' : 'mt-8'}>
            <LoadingSkeleton type="card" count={3} />
          </div>
        </div>
      </div>
    );
  }

  // Se não encontrou cliente vinculado, mostrar mensagem
  if (!customer && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow-sm">
          <div className={`max-w-7xl mx-auto ${isMobile ? 'px-2 py-4' : 'px-4 sm:px-6 lg:px-8 py-6'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {onBack && (
                  <button
                    onClick={onBack}
                    className={`${isMobile ? 'p-1.5' : 'p-2'} rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700`}
                  >
                    <ArrowLeft className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
                  </button>
                )}
                <div className={`flex items-center ${isMobile ? 'space-x-2' : 'space-x-4'}`}>
                  <Avatar
                    src={user.avatar}
                    alt={user.name}
                    name={user.name}
                    size={isMobile ? 'md' : 'lg'}
                    className="bg-gradient-to-br from-green-500 via-green-600 to-green-700"
                  />
                  <div>
                    <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>{user.name}</h1>
                    <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-600 dark:text-gray-400`}>{user.email || user.phone}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className={`max-w-7xl mx-auto ${isMobile ? 'px-2 py-4' : 'px-4 sm:px-6 lg:px-8 py-8'}`}>
          <div className={`bg-white dark:bg-gray-800 rounded-lg shadow ${isMobile ? 'p-4' : 'p-8'} text-center`}>
            <UserIcon className={`${isMobile ? 'w-12 h-12' : 'w-16 h-16'} text-gray-400 mx-auto ${isMobile ? 'mb-3' : 'mb-4'}`} />
            <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-gray-900 dark:text-white ${isMobile ? 'mb-2' : 'mb-2'}`}>
              Perfil néo vinculado a um cliente
            </h2>
            <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-600 dark:text-gray-400 ${isMobile ? 'mb-4' : 'mb-6'}`}>
              Para acessar todas as funcionalidades do perfil (pontos, conquistas, afiliados), é necessário vincular sua conta a um cliente no sistema.
            </p>
            <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
              <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>
                Entre em contato com o administrador para vincular sua conta ou criar um cliente.
              </p>
              <div className={`flex items-center justify-center ${isMobile ? 'flex-col space-y-2' : 'space-x-4'}`}>
                {onBack && (
                  <button
                    onClick={onBack}
                    className={`${isMobile ? 'w-full px-4 py-2 text-sm' : 'px-6 py-2'} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors`}
                  >
                    Voltar para Loja
                  </button>
                )}
                {user.role !== UserRole.CLIENTE && (
                  <button
                    onClick={() => navigate('/admin')}
                    className={`${isMobile ? 'w-full px-4 py-2 text-sm' : 'px-6 py-2'} bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors`}
                  >
                    Ir para Painel Admin
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calcular tier baseado em pontos
  const getTier = (pts: number): LoyaltyTier => {
    if (pts >= 10000) return LoyaltyTier.OURO;
    if (pts >= 5000) return LoyaltyTier.PRATA;
    return LoyaltyTier.BRONZE;
  };

  const currentTier = getTier(points);
  const nextTierPoints = currentTier === LoyaltyTier.BRONZE ? 5000 : currentTier === LoyaltyTier.PRATA ? 10000 : Infinity;
  const progressToNextTier = currentTier === LoyaltyTier.OURO ? 100 : ((points / nextTierPoints) * 100);

  return (
    <>
      {/* Toast Container - apenas se néo tiver showToast externo */}
      {!showToast && <ToastContainer toasts={toasts} removeToast={removeToast} />}

      {/* Content - O header e footer são fornecidos pelo Shop */}
      <div className="w-full">
        {/* Header Premium com Glassmorphism */}
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg shadow-xl border-b border-gray-200/50 dark:border-gray-700/50 rounded-lg mb-6">
          <div className={`${isMobile ? 'px-2 py-4' : 'px-4 sm:px-6 lg:px-8 py-8'}`}>
            {isMobile ? (
              /* Layout Mobile - Compacto e Vertical */
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  {onBack && (
                    <button
                      onClick={onBack}
                      className={`${isMobile ? 'p-2' : 'p-3'} rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all`}
                    >
                      <ArrowLeft className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-gray-700 dark:text-gray-300`} />
                    </button>
                  )}
                  {/* Avatar Compacto */}
                  <div className="relative">
                    <div className="shadow-lg ring-2 ring-white dark:ring-gray-800">
                      <Avatar
                        src={user.avatar}
                        alt={user.name}
                        name={user.name}
                        size="lg"
                        className={`${isMobile ? 'w-16 h-16 text-xl rounded-xl' : 'w-24 h-24 text-3xl rounded-2xl'} bg-gradient-to-br from-green-500 via-green-600 to-green-700`}
                      />
                    </div>
                    <div className="absolute -bottom-1 -right-1">
                      <TierBadge tier={currentTier} size={isMobile ? "xs" : "sm"} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h1 className={`${isMobile ? 'text-lg' : 'text-3xl'} font-bold text-gray-900 dark:text-white truncate`}>{user.name}</h1>
                    </div>
                    <p className={`${isMobile ? 'text-xs' : 'text-base'} text-gray-600 dark:text-gray-400 truncate`}>{user.email || user.phone}</p>
                  </div>
                </div>
                {/* Progresso Compacto */}
                {currentTier !== LoyaltyTier.OURO && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">
                        {points.toLocaleString()} / {nextTierPoints.toLocaleString()} pontos
                      </span>
                    </div>
                    <div className={`${isMobile ? 'h-1.5' : 'h-2'} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}>
                      <div
                        className={`${isMobile ? 'h-1.5' : 'h-2'} bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500`}
                        style={{ width: `${Math.min(progressToNextTier, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {/* Saldo de Pontos - Full Width no Mobile */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 shadow-xl text-white">
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium opacity-90 mb-1`}>Saldo de Pontos</p>
                  <p className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold mb-1`}>{points.toLocaleString()}</p>
                  <div className="flex items-center space-x-1 text-xs opacity-90">
                    <Gift className="w-3 h-3" />
                    <span>Nível {currentTier === LoyaltyTier.BRONZE ? 'Bronze' : currentTier === LoyaltyTier.PRATA ? 'Prata' : 'Ouro'}</span>
                  </div>
                </div>
                {/* Botéo de Logout - Mobile */}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Sair"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-xs font-medium">Sair</span>
                  </button>
                )}
              </div>
            ) : (
              /* Layout Desktop - Original */
              <div className="flex items-center justify-between flex-wrap gap-6">
                <div className="flex items-center space-x-6">
                  {onBack && (
                    <button
                      onClick={onBack}
                      className="p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all hover:scale-105"
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    </button>
                  )}
                  {/* Avatar Grande com Gradiente */}
                  <div className="relative">
                    <div className="shadow-lg ring-4 ring-white dark:ring-gray-800">
                      <Avatar
                        src={user.avatar}
                        alt={user.name}
                        name={user.name}
                        size="lg"
                        className="w-24 h-24 text-3xl rounded-2xl bg-gradient-to-br from-green-500 via-green-600 to-green-700"
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2">
                      <TierBadge tier={currentTier} size="sm" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-3 mb-2">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
                      <TierBadge tier={currentTier} size="md" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">{user.email || user.phone}</p>
                    {currentTier !== LoyaltyTier.OURO && (
                      <div className="mt-2">
                        <div className="flex items-center space-x-2 text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            {points.toLocaleString()} / {nextTierPoints.toLocaleString()} pontos
                          </span>
                          <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                              style={{ width: `${Math.min(progressToNextTier, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Botéo de Logout */}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Sair"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="text-sm font-medium">Sair</span>
                  </button>
                )}
                {/* Saldo de Pontos Destacado */}
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 shadow-xl text-white min-w-[200px]">
                  <p className="text-sm font-medium opacity-90 mb-1">Saldo de Pontos</p>
                  <p className="text-4xl font-bold mb-2">{points.toLocaleString()}</p>
                  <div className="flex items-center space-x-1 text-sm opacity-90">
                    <Gift className="w-4 h-4" />
                    <span>Nível {currentTier === LoyaltyTier.BRONZE ? 'Bronze' : currentTier === LoyaltyTier.PRATA ? 'Prata' : 'Ouro'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs Navigation com Animaçéµes */}
        <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50 sticky top-0 z-40 rounded-lg mb-6">
          <div className={`${isMobile ? 'px-2' : 'px-4 sm:px-6 lg:px-8'}`}>
            <div className="flex space-x-1 overflow-x-auto scrollbar-hide">
              {[
                { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
                { id: 'points', label: 'Pontos', icon: Gift },
                { id: 'insights', label: 'Insights', icon: TrendingUp },
                { id: 'achievements', label: 'Conquistas', icon: Award },
                { id: 'affiliate', label: 'Afiliados', icon: Share2 },
                { id: 'goals', label: 'Metas', icon: Target }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`relative flex items-center space-x-2 ${isMobile ? 'py-3 px-3 text-xs' : 'py-4 px-6 text-sm'} font-semibold whitespace-nowrap transition-all duration-300 ${isActive
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                  >
                    <Icon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} transition-transform ${isActive ? 'scale-110' : ''}`} />
                    <span>{tab.label}</span>
                    {isActive && (
                      <div className={`absolute bottom-0 left-0 right-0 ${isMobile ? 'h-0.5' : 'h-1'} bg-gradient-to-r from-green-500 to-green-600 rounded-t-full`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className={`${isMobile ? 'space-y-4' : 'space-y-8'}`}>
          {activeTab === 'overview' && (
            <div className={`${isMobile ? 'space-y-4' : 'space-y-8'} animate-fadeIn`}>
              {/* Stats Cards com Gradientes - 2 colunas no mobile */}
              <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'}`}>
                <StatsCard
                  label="Total Gasto"
                  value={`${customer?.totalSpent?.toFixed(2) || '0.00'} MT`}
                  icon={TrendingUp}
                  gradient="green"
                />
                <StatsCard
                  label="Total de Pedidos"
                  value={customer?.totalOrders || 0}
                  icon={Package}
                  gradient="blue"
                />
                <StatsCard
                  label="Conquistas"
                  value={achievements.length}
                  icon={Award}
                  gradient="yellow"
                />
                <StatsCard
                  label="Pontos Acumulados"
                  value={points.toLocaleString()}
                  icon={Gift}
                  gradient="purple"
                />
              </div>

              {/* Gré¡fico de Evoluçéo de Pontos */}
              <PointsChart actions={actions} currentPoints={points} />

              {/* Ações Disponíveis */}
              <div className={`bg-white dark:bg-gray-800 ${isMobile ? 'rounded-xl shadow-lg p-4' : 'rounded-2xl shadow-xl p-8'} border border-gray-100 dark:border-gray-700`}>
                <div className={`flex items-center space-x-3 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                  <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gradient-to-br from-green-500 to-green-600 ${isMobile ? 'rounded-lg' : 'rounded-xl'}`}>
                    <Target className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                  </div>
                  <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>Ações Disponíveis</h2>
                </div>
                <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}`}>
                  {availableActions.map(action => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onComplete={loadProfileData}
                      customerId={customer?.id}
                      showToast={localShowToast}
                      onCompleteProfile={handleCompleteProfile}
                      onShareProduct={handleShareProduct}
                      onReviewProduct={handleReviewProduct}
                    />
                  ))}
                </div>
              </div>

              {/* Metas Ativas */}
              {goals.length > 0 && (
                <div className={`bg-white dark:bg-gray-800 ${isMobile ? 'rounded-xl shadow-lg p-4' : 'rounded-2xl shadow-xl p-8'} border border-gray-100 dark:border-gray-700`}>
                  <div className={`flex items-center space-x-3 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                    <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gradient-to-br from-blue-500 to-blue-600 ${isMobile ? 'rounded-lg' : 'rounded-xl'}`}>
                      <Target className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                    </div>
                    <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>Metas Ativas</h2>
                  </div>
                  <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 gap-6'}`}>
                    {goals.slice(0, 3).map(goal => (
                      <GoalProgress key={goal.id} goal={goal} />
                    ))}
                  </div>
                </div>
              )}

              {/* éšltimas Açéµes */}
              <div className={`bg-white dark:bg-gray-800 ${isMobile ? 'rounded-xl shadow-lg p-4' : 'rounded-2xl shadow-xl p-8'} border border-gray-100 dark:border-gray-700`}>
                <div className={`flex items-center space-x-3 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                  <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gradient-to-br from-purple-500 to-purple-600 ${isMobile ? 'rounded-lg' : 'rounded-xl'}`}>
                    <Gift className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                  </div>
                  <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>Últimas Ações</h2>
                </div>
                {actions.length > 0 ? (
                  <PointsHistory actions={actions.slice(0, 5)} />
                ) : (
                  <EmptyState
                    icon={Gift}
                    title="Nenhuma açéo registrada"
                    description="Complete ações para ganhar pontos e aparecer aqui!"
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'points' && (
            <div className={`${isMobile ? 'space-y-4' : 'space-y-8'} animate-fadeIn`}>
              <PointsChart actions={actions} currentPoints={points} />
              <div className={`bg-white dark:bg-gray-800 ${isMobile ? 'rounded-xl shadow-lg p-4' : 'rounded-2xl shadow-xl p-8'} border border-gray-100 dark:border-gray-700`}>
                <div className={`flex items-center space-x-3 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                  <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gradient-to-br from-green-500 to-green-600 ${isMobile ? 'rounded-lg' : 'rounded-xl'}`}>
                    <Gift className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                  </div>
                  <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>Histórico Completo de Pontos</h2>
                </div>
                {actions.length > 0 ? (
                  <PointsHistory actions={actions} />
                ) : (
                  <EmptyState
                    icon={Gift}
                    title="Nenhum ponto registrado"
                    description="Complete ações para começar a ganhar pontos!"
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'insights' && (
            <div className={isMobile ? 'space-y-4' : 'space-y-6'}>
              <InsightsChart insights={insights} customer={customer} />
            </div>
          )}

          {activeTab === 'achievements' && (
            <div className={`${isMobile ? 'space-y-4' : 'space-y-8'} animate-fadeIn`}>
              <div className={`bg-white dark:bg-gray-800 ${isMobile ? 'rounded-xl shadow-lg p-4' : 'rounded-2xl shadow-xl p-8'} border border-gray-100 dark:border-gray-700`}>
                <div className={`flex items-center justify-between ${isMobile ? 'mb-4' : 'mb-6'}`}>
                  <div className="flex items-center space-x-3">
                    <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gradient-to-br from-yellow-500 to-yellow-600 ${isMobile ? 'rounded-lg' : 'rounded-xl'}`}>
                      <Award className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                    </div>
                    <div>
                      <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>Conquistas</h2>
                      <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400`}>
                        {achievements.length} conquista{achievements.length !== 1 ? 's' : ''} desbloqueada{achievements.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                {achievements.length > 0 ? (
                  <AchievementsGrid achievements={achievements} />
                ) : (
                  <EmptyState
                    icon={Award}
                    title="Nenhuma conquista ainda"
                    description="Complete ações e metas para desbloquear conquistas!"
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'affiliate' && (
            affiliateData ? (
              <AffiliateDashboard
                affiliateData={affiliateData}
                onCopyLink={copyAffiliateLink}
                linkCopied={linkCopied}
              />
            ) : (
              <EmptyState
                icon={Share2}
                title="Programa de Afiliados"
                description="O programa de afiliados ainda não está disponível para a sua conta. Contacte-nos para mais informações."
              />
            )
          )}

          {activeTab === 'goals' && (
            <div className={`${isMobile ? 'space-y-4' : 'space-y-8'} animate-fadeIn`}>
              <div className={`bg-white dark:bg-gray-800 ${isMobile ? 'rounded-xl shadow-lg p-4' : 'rounded-2xl shadow-xl p-8'} border border-gray-100 dark:border-gray-700`}>
                <div className={`flex items-center space-x-3 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                  <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gradient-to-br from-blue-500 to-blue-600 ${isMobile ? 'rounded-lg' : 'rounded-xl'}`}>
                    <Target className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'} text-white`} />
                  </div>
                  <div>
                    <h2 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold text-gray-900 dark:text-white`}>Metas</h2>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400`}>
                      Complete metas para ganhar pontos e recompensas
                    </p>
                  </div>
                </div>
                {goals.length > 0 ? (
                  <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-1 md:grid-cols-2 gap-6'}`}>
                    {goals.map(goal => (
                      <GoalProgress key={goal.id} goal={goal} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Target}
                    title="Nenhuma meta ativa"
                    description="Novas metas seréo adicionadas em breve!"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modais */}
        {showCompleteProfileModal && customer && (
          <CompleteProfileModal
            customer={customer}
            onClose={() => setShowCompleteProfileModal(false)}
            onSuccess={loadProfileData}
            showToast={localShowToast}
          />
        )}

        {showShareProductModal && customer && (
          <ShareProductModal
            customerId={customer.id}
            onClose={() => setShowShareProductModal(false)}
            onSuccess={loadProfileData}
            showToast={localShowToast}
          />
        )}

        {showReviewProductModal && customer && (
          <ReviewProductModal
            customerId={customer.id}
            onClose={() => setShowReviewProductModal(false)}
            onSuccess={loadProfileData}
            showToast={localShowToast}
          />
        )}
      </div>
    </>
  );
};



