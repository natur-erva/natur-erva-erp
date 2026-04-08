import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Customer, LoyaltyTier, Order, User, CustomerInsight, CustomerAction, CustomerFeedback, ActionType, ActionStatus } from '../../core/types/types';
import { Award, TrendingUp, Users, DollarSign, BarChart3, RefreshCw, Filter, X, ChevronRight, AlertTriangle, Phone, MessageSquare, Mail, MapPin, Calendar, Plus, CheckCircle, Clock, Star, FileText, CheckSquare, Square, Eye, TrendingDown, Activity, Download, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, Table, XCircle, FileSpreadsheet, AlertCircle, Info } from 'lucide-react';
import { dataService } from '../../core/services/dataService';
import { Toast } from '../../core/components/ui/Toast';
import { CustomerDetailModal } from '../../core/components/modals/CustomerDetailModal';
import { useMobile } from '../../core/hooks/useMobile';
import { PageShell } from '../../core/components/layout/PageShell';
import { FilterBar, SearchInput, ViewModeToggle, SelectFilter, ItemsPerPageSelect, Pagination } from '../../core/components/filters';
import { PeriodFilter, PeriodOption } from '../../core/components/forms/PeriodFilter';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { addPDFHeader, addPDFFooter, getBrandColors, calculateColumnWidths, addPDFTableHeader, addPDFTableRow, addPDFSummarySection } from '../../core/services/reportService';
import { createWorkbook, addWorksheet, addRowsFromJson, writeWorkbookToFile } from '../../core/services/excelService';
import { normalizeForSearch } from '../../core/services/serviceUtils';
import { getTodayDateString } from '../../core/utils/dateUtils';

interface LoyaltyProps {
  customers: Customer[];
  orders: Order[];
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  currentUser: User | null;
}

export const Loyalty: React.FC<LoyaltyProps> = ({ customers, orders, showToast, currentUser }) => {
  // Hook para detectar mobile
  const isMobile = useMobile(768);

  const [selectedTier, setSelectedTier] = useState<LoyaltyTier | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Novos estados para funcionalidades de fidelizaçéo
  // Nota: aba 'actions' foi movida para página separada CommercialActions.tsx
  // customerActions é© usado apenas para filtros e contadores na aba insights
  const [insights, setInsights] = useState<CustomerInsight[]>([]);
  const [customerActions, setCustomerActions] = useState<CustomerAction[]>([]);
  const [customerFeedbacks, setCustomerFeedbacks] = useState<CustomerFeedback[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [selectedInsights, setSelectedInsights] = useState<Set<string>>(new Set());
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedActionCustomer, setSelectedActionCustomer] = useState<Customer | null>(null);
  const [selectedActionForFeedback, setSelectedActionForFeedback] = useState<CustomerAction | null>(null);
  const [showCustomerDetailModal, setShowCustomerDetailModal] = useState(false);
  const [selectedCustomerForDetail, setSelectedCustomerForDetail] = useState<CustomerInsight | null>(null);

  // Estados para filtros de período e visão geral
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [overviewSortBy, setOverviewSortBy] = useState<'name' | 'spent' | 'orders' | 'tier' | 'lastOrder'>('spent');
  const [overviewSortOrder, setOverviewSortOrder] = useState<'asc' | 'desc'>('desc');
  const [overviewCurrentPage, setOverviewCurrentPage] = useState(1);
  const [overviewItemsPerPage, setOverviewItemsPerPage] = useState(20);
  const [selectedCustomersForBulk, setSelectedCustomersForBulk] = useState<Set<string>>(new Set());
  // Estados removidos - agora gerenciados pelo CustomerDetailModal
  const [editingCustomerNotes, setEditingCustomerNotes] = useState(false);
  const [customerNotesEdit, setCustomerNotesEdit] = useState('');
  const [overviewViewMode, setOverviewViewMode] = useState<'card' | 'table'>('table');
  const [showInactiveOnly, setShowInactiveOnly] = useState(false); // Toggle para mostrar apenas inativos

  // Estados para filtros e paginaçéo (Insights)
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [filterTier, setFilterTier] = useState<'all' | LoyaltyTier>('all');
  const [filterDaysSince, setFilterDaysSince] = useState<'all' | '30' | '60' | '90' | '180'>('all');
  const [filterMinSpent, setFilterMinSpent] = useState<string>('');
  const [filterHasNotes, setFilterHasNotes] = useState<'all' | 'yes' | 'no'>('all');
  const [filterHasActions, setFilterHasActions] = useState<'all' | 'yes' | 'no'>('all'); // Novo filtro: Sem ações
  const [searchInsights, setSearchInsights] = useState<string>('');
  const [sortBy, setSortBy] = useState<'risk' | 'days' | 'spent' | 'orders' | 'name'>('spent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [showFilters, setShowFilters] = useState(false);
  const [insightsViewMode, setInsightsViewMode] = useState<'grid' | 'list'>(isMobile ? 'grid' : 'list');

  // Nota: Estados de filtros e paginaçéo de açéµes foram removidos - agora gerenciados em CommercialActions.tsx

  // Calcular estatísticas por tier
  const tierStats = useMemo(() => {
    const stats = {
      [LoyaltyTier.BRONZE]: { count: 0, totalSpent: 0, totalOrders: 0, customers: [] as Customer[] },
      [LoyaltyTier.SILVER]: { count: 0, totalSpent: 0, totalOrders: 0, customers: [] as Customer[] },
      [LoyaltyTier.GOLD]: { count: 0, totalSpent: 0, totalOrders: 0, customers: [] as Customer[] },
    };

    customers.forEach(customer => {
      const tier = customer.tier;
      if (stats[tier]) {
        stats[tier].count++;
        stats[tier].totalSpent += customer.totalSpent;
        stats[tier].totalOrders += customer.totalOrders;
        stats[tier].customers.push(customer);
      }
    });

    return stats;
  }, [customers]);

  // Clientes filtrados com filtros avançados
  const filteredCustomers = useMemo(() => {
    let filtered = [...customers];

    // Filtro por tier
    if (selectedTier !== 'all') {
      filtered = filtered.filter(c => c.tier === selectedTier);
    }

    // Filtro por pesquisa
    if (searchTerm) {
      const norm = normalizeForSearch(searchTerm);
      filtered = filtered.filter(c =>
        normalizeForSearch(c.name).includes(norm) ||
        normalizeForSearch(c.phone || '').includes(norm) ||
        (c.email && normalizeForSearch(c.email).includes(norm))
      );
    }

    // Filtro por peré­odo (baseado na éºltima compra)
    if (periodFilter !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (periodFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 3);
          break;
        case 'year':
          startDate = new Date(now);
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case 'custom':
          if (customStartDate) {
            startDate = new Date(customStartDate);
          } else {
            startDate = new Date(0); // Desde sempre
          }
          break;
        default:
          startDate = new Date(0);
      }

      const endDate = periodFilter === 'custom' && customEndDate ? new Date(customEndDate + 'T23:59:59') : now;

      filtered = filtered.filter(c => {
        if (!c.lastOrderDate) return false;
        const lastOrder = new Date(c.lastOrderDate);
        return lastOrder >= startDate && lastOrder <= endDate;
      });
    }

    // Ordenaçéo
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (overviewSortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'spent':
          comparison = b.totalSpent - a.totalSpent;
          break;
        case 'orders':
          comparison = b.totalOrders - a.totalOrders;
          break;
        case 'tier':
          const tierOrder = { [LoyaltyTier.GOLD]: 3, [LoyaltyTier.SILVER]: 2, [LoyaltyTier.BRONZE]: 1 };
          comparison = tierOrder[b.tier] - tierOrder[a.tier];
          break;
        case 'lastOrder':
          const aDate = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0;
          const bDate = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0;
          comparison = bDate - aDate;
          break;
      }

      return overviewSortOrder === 'asc' ? -comparison : comparison;
    });

    return filtered;
  }, [customers, selectedTier, searchTerm, periodFilter, customStartDate, customEndDate, overviewSortBy, overviewSortOrder]);

  // Paginaçéo para visão geral
  const overviewTotalPages = Math.ceil(filteredCustomers.length / overviewItemsPerPage);
  const overviewStartIndex = (overviewCurrentPage - 1) * overviewItemsPerPage;
  const overviewEndIndex = overviewStartIndex + overviewItemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(overviewStartIndex, overviewEndIndex);

  const formatMoney = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0,00 MT';
    }
    const formatted = value.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' });
    return formatted.replace(/MZN/gi, 'MT').replace(/MTn/gi, 'MT');
  };

  const getTierColor = (tier: LoyaltyTier) => {
    switch (tier) {
      case LoyaltyTier.GOLD:
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-800 dark:text-yellow-300',
          border: 'border-yellow-200 dark:border-yellow-900',
          badge: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-900',
          card: 'bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-yellow-200 dark:border-yellow-900'
        };
      case LoyaltyTier.SILVER:
        return {
          bg: 'bg-gray-100 dark:bg-gray-700',
          text: 'text-gray-800 dark:text-gray-300',
          border: 'border-gray-200 dark:border-gray-600',
          badge: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
          card: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-gray-200 dark:border-gray-600'
        };
      case LoyaltyTier.BRONZE:
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/30',
          text: 'text-orange-800 dark:text-orange-300',
          border: 'border-orange-100 dark:border-orange-900',
          badge: 'bg-orange-50 text-orange-800 border-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900',
          card: 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-900'
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-800',
          text: 'text-gray-600 dark:text-gray-400',
          border: 'border-gray-200 dark:border-gray-700',
          badge: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
          card: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        };
    }
  };

  const getTierIcon = (tier: LoyaltyTier) => {
    switch (tier) {
      case LoyaltyTier.GOLD:
        return '🥇';
      case LoyaltyTier.SILVER:
        return '🥈';
      case LoyaltyTier.BRONZE:
        return '🥉';
      default:
        return 'â­';
    }
  };

  const handleRecalculateTiers = async () => {
    setIsRecalculating(true);
    try {
      let updated = 0;
      const errors: string[] = [];

      for (const customer of customers) {
        const customerOrders = orders.filter(o => o.customerId === customer.id);
        const totalOrders = customerOrders.length;
        const totalSpent = customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);

        // Calcular tier correto
        let newTier: LoyaltyTier;
        if (totalOrders > 15 || totalSpent > 20000) {
          newTier = LoyaltyTier.GOLD;
        } else if (totalOrders > 5 || totalSpent > 5000) {
          newTier = LoyaltyTier.SILVER;
        } else {
          newTier = LoyaltyTier.BRONZE;
        }

        // Atualizar se mudou
        if (customer.tier !== newTier) {
          const success = await dataService.updateCustomer(customer.id, { tier: newTier });
          if (success) {
            updated++;
          } else {
            errors.push(customer.name);
          }
        }
      }

      if (updated > 0 || errors.length > 0) {
        showToast(
          `${updated} cliente(s) atualizado(s).${errors.length > 0 ? ` ${errors.length} erro(s).` : ''}`,
          errors.length > 0 ? 'warning' : 'success'
        );
        // Recarregar página para atualizar dados
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showToast('Todos os clientes jé¡ estéo com a classificaçéo correta', 'info');
      }
    } catch (error: any) {
      showToast('Erro ao recalcular tiers: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Carregar insights, ações e metas apenas quando necessário
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // Carregar insights e ações/feedbacks em paralelo (ações são usadas para contadores na aba insights)
      setLoadingInsights(true);
      const promises: Promise<void>[] = [];

      // Carregar insights
      promises.push(
        dataService.getCustomerInsights(30)
          .then(data => {
            if (isMounted) setInsights(data);
          })
          .catch(error => {
            showToast('Erro ao carregar insights: ' + (error.message || 'Erro desconhecido'), 'error');
          })
          .finally(() => {
            if (isMounted) setLoadingInsights(false);
          })
      );

      // Carregar ações e feedbacks em paralelo (para contadores)
      promises.push(
        dataService.getCustomerActions()
          .then(data => {
            if (isMounted) setCustomerActions(data || []);
          })
          .catch(error => {
            console.error('Erro ao carregar ações:', error);
            // Não mostrar toast pois ações são opcionais para insights
          })
      );

      setLoadingFeedbacks(true);
      promises.push(
        dataService.getCustomerFeedbacks()
          .then(data => {
            if (isMounted) setCustomerFeedbacks(data);
          })
          .catch(error => {
            // Erros de rede ou tabela néo encontrada são tratados silenciosamente pela funçéo
            if (error?.message && !error.message.includes('NetworkError') && !error.message.includes('fetch')) {
              console.error('Erro ao carregar feedbacks:', error);
            }
          })
          .finally(() => {
            if (isMounted) setLoadingFeedbacks(false);
          })
      );

      await Promise.all(promises);
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, showToast]); // Removido activeTab das dependéªncias

  const loadInsights = async () => {
    setLoadingInsights(true);
    try {
      const data = await dataService.getCustomerInsights(30);
      setInsights(data);
    } catch (error: any) {
      showToast('Erro ao carregar insights: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
      setLoadingInsights(false);
    }
  };


  const loadFeedbacks = async () => {
    setLoadingFeedbacks(true);
    try {
      const data = await dataService.getCustomerFeedbacks();
      setCustomerFeedbacks(data);
    } catch (error: any) {
      // Erros de rede ou tabela néo encontrada são tratados silenciosamente pela funçéo
      // Apenas logar outros erros inesperados
      if (error?.message && !error.message.includes('NetworkError') && !error.message.includes('fetch')) {
        console.error('Erro ao carregar feedbacks:', error);
      }
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  // Estaté­sticas diné¢micas baseadas nos clientes filtrados
  const filteredStats = useMemo(() => {
    const filtered = filteredCustomers;
    const totalCustomers = filtered.length;
    const totalSpent = filtered.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalOrders = filtered.reduce((sum, c) => sum + c.totalOrders, 0);
    const averageTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;

    return {
      totalCustomers,
      totalSpent,
      totalOrders,
      averageTicket
    };
  }, [filteredCustomers]);

  // Função para carregar ações (usada apenas para filtros e contadores na aba insights)
  const loadActions = async () => {
    try {
      const data = await dataService.getCustomerActions();
      setCustomerActions(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar açéµes:', error);
      // Néo mostrar toast pois açéµes são opcionais para insights
    }
  };

  // Filtrar e ordenar insights
  const filteredInsights = useMemo(() => {
    let filtered = [...insights];

    // Filtro por risco
    if (filterRisk !== 'all') {
      filtered = filtered.filter(i => i.riskLevel === filterRisk);
    }

    // Filtro por tier
    if (filterTier !== 'all') {
      filtered = filtered.filter(i => i.tier === filterTier);
    }

    // Filtro por dias sem compra
    if (filterDaysSince !== 'all') {
      const days = parseInt(filterDaysSince);
      filtered = filtered.filter(i => {
        if (i.daysSinceLastOrder === Infinity) return false;
        return i.daysSinceLastOrder >= days;
      });
    }

    // Filtro por valor mé­nimo gasto
    if (filterMinSpent) {
      const minValue = parseFloat(filterMinSpent.replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (!isNaN(minValue)) {
        filtered = filtered.filter(i => i.totalSpent >= minValue);
      }
    }

    // Filtro por notas
    if (filterHasNotes !== 'all') {
      filtered = filtered.filter(i => {
        const customer = customers.find(c => c.id === i.customerId);
        if (!customer) return false;
        const hasNotes = customer.notes && customer.notes.trim().length > 0;
        return filterHasNotes === 'yes' ? hasNotes : !hasNotes;
      });
    }

    // Filtro por ações (novo)
    if (filterHasActions !== 'all') {
      filtered = filtered.filter(i => {
        const actionCount = customerActions.filter(a => a.customerId === i.customerId).length;
        return filterHasActions === 'yes' ? actionCount > 0 : actionCount === 0;
      });
    }

    // Filtro por pesquisa (nome ou telefone)
    if (searchInsights.trim()) {
      const norm = normalizeForSearch(searchInsights);
      filtered = filtered.filter(i => {
        const customer = customers.find(c => c.id === i.customerId);
        if (!customer) return false;

        const nameMatch = normalizeForSearch(customer.name).includes(norm);
        const phoneMatch = normalizeForSearch(customer.phone || '').includes(norm);
        const insightNameMatch = normalizeForSearch(i.customerName || '').includes(norm);

        return nameMatch || phoneMatch || insightNameMatch;
      });
    }

    // Ordenaçéo
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'risk':
          const riskOrder = { high: 3, medium: 2, low: 1 };
          comparison = riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
          break;
        case 'days':
          const aDays = a.daysSinceLastOrder === Infinity ? 999999 : a.daysSinceLastOrder;
          const bDays = b.daysSinceLastOrder === Infinity ? 999999 : b.daysSinceLastOrder;
          comparison = bDays - aDays;
          break;
        case 'spent':
          comparison = b.totalSpent - a.totalSpent;
          break;
        case 'orders':
          comparison = b.totalOrders - a.totalOrders;
          break;
        case 'name':
          comparison = a.customerName.localeCompare(b.customerName);
          break;
      }
      return sortOrder === 'asc' ? -comparison : comparison;
    });

    return filtered;
  }, [insights, customers, customerActions, filterRisk, filterTier, filterDaysSince, filterMinSpent, filterHasNotes, filterHasActions, searchInsights, sortBy, sortOrder]);

  // Funçéo para ordenaçéo
  const handleSort = (field: 'risk' | 'days' | 'spent' | 'orders' | 'name') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Componente para ícone de ordenação
  const SortIcon = ({ field }: { field: 'risk' | 'days' | 'spent' | 'orders' | 'name' }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 ml-1 inline" /> : <ArrowUp className="w-3 h-3 ml-1 inline" />;
  };

  // Paginaçéo
  const totalPages = Math.ceil(filteredInsights.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedInsights = filteredInsights.slice(startIndex, endIndex);

  // Resetar página quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [filterRisk, filterTier, filterDaysSince, filterMinSpent, filterHasNotes, filterHasActions, searchInsights, sortBy, sortOrder]);

  // Sincronizar busca unificada com busca específica da aba

  // Funçéo para exportar insights para Excel
  const exportInsightsToExcel = async () => {
    try {
      if (filteredInsights.length === 0) {
        showToast('Néo hé¡ insights para exportar', 'warning');
        return;
      }

      // Preparar dados para exportação
      const exportData = filteredInsights.map(insight => {
        const customer = customers.find(c => c.id === insight.customerId);
        const customerActionCount = customerActions.filter(a => a.customerId === insight.customerId).length;
        const pendingActions = customerActions.filter(a => a.customerId === insight.customerId && a.status === ActionStatus.PENDING).length;

        let daysSinceText = '';
        if (insight.daysSinceLastOrder === Infinity) {
          daysSinceText = 'Nunca fez pedidos';
        } else {
          const days = insight.daysSinceLastOrder;
          if (days < 7) daysSinceText = `Hé¡ ${days} dia${days === 1 ? '' : 's'} sem compras`;
          else if (days < 30) daysSinceText = `Hé¡ ${Math.floor(days / 7)} semana${Math.floor(days / 7) === 1 ? '' : 's'} sem compras`;
          else if (days < 365) daysSinceText = `Há ${Math.floor(days / 30)} mês${Math.floor(days / 30) === 1 ? '' : 'es'} sem compras`;
          else daysSinceText = `Hé¡ mais de ${Math.floor(days / 365)} ano${Math.floor(days / 365) === 1 ? '' : 's'} sem compras`;
        }

        return {
          'Cliente': insight.customerName,
          'Telefone': customer?.phone || '',
          'Tier': insight.tier,
          'Risco': insight.riskLevel === 'high' ? 'Alto Risco' : insight.riskLevel === 'medium' ? 'Médio Risco' : 'Baixo Risco',
          'Dias sem Pedido': insight.daysSinceLastOrder === Infinity ? 'Nunca' : insight.daysSinceLastOrder.toString(),
          'Último Pedido': insight.lastOrderDate ? new Date(insight.lastOrderDate).toLocaleDateString('pt-PT') : '',
          'Total Gasto': insight.totalSpent || 0,
          'Pedidos': insight.totalOrders || 0,
          'Ações': customerActionCount,
          'Ações Pendentes': pendingActions,
          'Açéo Sugerida': insight.suggestedAction
        };
      });

      const wb = createWorkbook();
      const ws = addWorksheet(wb, 'Insights');
      addRowsFromJson(ws, exportData as Record<string, unknown>[]);
      [25, 15, 12, 15, 15, 15, 15, 12, 12, 15, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      const filename = `insights_fidelizacao_${getTodayDateString()}.xlsx`;
      await writeWorkbookToFile(wb, filename);
      showToast(`Exportaçéo para Excel conclué­da: ${filteredInsights.length} insights`, 'success');
    } catch (error: any) {
      console.error('Erro ao exportar para Excel:', error);
      showToast('Erro ao exportar para Excel', 'error');
    }
  };

  // Funçéo para exportar insights para PDF
  const exportInsightsToPDF = async () => {
    try {
      if (filteredInsights.length === 0) {
        showToast('Néo hé¡ insights para exportar', 'warning');
        return;
      }

      showToast('Gerando PDF...', 'info');

      const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape para mais espaço
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      // Preparar Informações de filtros
      const filters: Array<{ label: string; value: string }> = [];
      if (searchInsights.trim()) {
        filters.push({ label: 'Pesquisa', value: searchInsights });
      }
      if (filterRisk !== 'all') {
        filters.push({ label: 'Risco', value: filterRisk === 'high' ? 'Alto' : filterRisk === 'medium' ? 'Médio' : 'Baixo' });
      }
      if (filterTier !== 'all') {
        filters.push({ label: 'Tier', value: filterTier });
      }
      if (filterDaysSince !== 'all') {
        filters.push({ label: 'Tempo', value: `+${filterDaysSince}d` });
      }
      if (filterHasActions !== 'all') {
        filters.push({ label: 'Ações', value: filterHasActions === 'yes' ? 'Com ações' : 'Sem ações' });
      }
      if (filterMinSpent) {
        filters.push({ label: 'Gasto Mínimo', value: `${filterMinSpent} MT` });
      }

      // Estaté­sticas
      const highRisk = filteredInsights.filter(i => i.riskLevel === 'high').length;
      const mediumRisk = filteredInsights.filter(i => i.riskLevel === 'medium').length;
      const lowRisk = filteredInsights.filter(i => i.riskLevel === 'low').length;

      filters.push({ label: 'Total de clientes', value: filteredInsights.length.toString() });
      filters.push({ label: 'Alto Risco', value: `${highRisk} | Médio Risco: ${mediumRisk} | Baixo Risco: ${lowRisk}` });

      // Adicionar cabeçalho com branding
      let yPos = await addPDFHeader(pdf, 'Insights de Fidelizaçéo de Clientes', {
        filters,
        orientation: 'landscape',
      });

      // Tabela de insights com branding
      // Calcular largura disponível e proporções das colunas
      const availableWidth = pdfWidth - (margin * 2);
      const colProportions = [2.5, 1.2, 1.0, 1.0, 1.2, 1.5, 1.0, 1.0, 2.5]; // 9 colunas
      const colWidths = calculateColumnWidths(availableWidth, colProportions);

      // Calcular posições X das colunas
      const colX: number[] = [margin];
      for (let i = 1; i < colWidths.length; i++) {
        colX.push(colX[i - 1] + colWidths[i - 1]);
      }

      const headers = ['Cliente', 'Tier', 'Risco', 'Dias', 'éšltimo Pedido', 'Total Gasto', 'Pedidos', 'Açéµes', 'Sugestéo'];
      yPos = addPDFTableHeader(pdf, headers, colX, yPos, margin, pdfWidth);

      // Dados da tabela com alterné¢ncia de cores
      filteredInsights.forEach((insight, index) => {
        // Verificar se precisa de nova página
        if (yPos > pdfHeight - 20) {
          pdf.addPage();
          yPos = margin;
          // Repetir cabeçalho em nova página
          yPos = addPDFTableHeader(pdf, headers, colX, yPos, margin, pdfWidth);
        }

        const customer = customers.find(c => c.id === insight.customerId);
        const customerActionCount = customerActions.filter(a => a.customerId === insight.customerId).length;

        const riskLabel = insight.riskLevel === 'high' ? 'Alto' : insight.riskLevel === 'medium' ? 'Médio' : 'Baixo';
        const daysText = insight.daysSinceLastOrder === Infinity ? 'Nunca' : insight.daysSinceLastOrder.toString();

        const maxCustomerLength = Math.floor(colWidths[0] / 2);
        const maxSuggestionLength = Math.floor(colWidths[8] / 2);

        const rowData = [
          insight.customerName.length > maxCustomerLength ? insight.customerName.substring(0, maxCustomerLength - 3) + '...' : insight.customerName,
          insight.tier,
          riskLabel,
          daysText,
          insight.lastOrderDate
            ? new Date(insight.lastOrderDate).toLocaleDateString('pt-PT')
            : '-',
          formatMoney(insight.totalSpent || 0),
          (insight.totalOrders || 0).toString(),
          customerActionCount.toString(),
          (() => {
            const suggestion = insight.suggestedAction || '';
            return suggestion.length > maxSuggestionLength
              ? suggestion.substring(0, maxSuggestionLength - 3) + '...'
              : suggestion;
          })()
        ];

        yPos = addPDFTableRow(pdf, rowData, colX, yPos, index, margin, pdfWidth, {
          fontSize: 8,
          alternateColors: true,
        });
      });

      // Rodapé© com branding
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        addPDFFooter(pdf, i, totalPages, { showCompanyInfo: true });
      }

      // Gerar nome do arquivo
      const filename = `insights_fidelizacao_${getTodayDateString()}.pdf`;

      // Salvar arquivo
      pdf.save(filename);
      showToast(`Exportaçéo para PDF conclué­da: ${filteredInsights.length} insights`, 'success');
    } catch (error: any) {
      console.error('Erro ao exportar para PDF:', error);
      showToast('Erro ao exportar para PDF', 'error');
    }
  };

  const CustomerDetail = ({ customer }: { customer: Customer }) => {
    const customerOrders = orders.filter(o => o.customerId === customer.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const tierColors = getTierColor(customer.tier);

    return (
      <div className="fixed inset-0 min-h-screen min-w-full modal-overlay z-50 flex justify-end" onClick={() => setSelectedCustomer(null)}>
        <div className={`w-full max-w-md bg-white dark:bg-gray-800 h-full shadow-2xl p-6 overflow-y-auto animate-slide-in-right border-l-4 ${tierColors.border}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-3xl">{getTierIcon(customer.tier)}</span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.name}</h2>
              </div>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${tierColors.badge}`}>
                <Award className="w-4 h-4 mr-1" />
                {customer.tier}
              </div>
            </div>
            <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className={`${tierColors.card} rounded-xl p-4 mb-6 border`}>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Estaté­sticas de Fidelizaçéo</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-gray-600 dark:text-gray-400 block">Total Gasto</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(customer.totalSpent)}</span>
              </div>
              <div>
                <span className="text-xs text-gray-600 dark:text-gray-400 block">Pedidos</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{customer.totalOrders}</span>
              </div>
              <div className="col-span-2">
                <span className="text-xs text-gray-600 dark:text-gray-400 block">Valor Médio por Pedido</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatMoney(customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-bold text-gray-800 dark:text-white mb-2">Crité©rios de Classificaçéo</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>â€¢ Ouro: 15+ pedidos ou 20.000+ MT gastos</p>
              <p>â€¢ Prata: 5-15 pedidos ou 5.000-20.000 MT gastos</p>
              <p>â€¢ Bronze: 0-5 pedidos ou até© 5.000 MT gastos</p>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-800 dark:text-white mb-3">Últimos Pedidos</h3>
            <div className="space-y-2">
              {customerOrders.slice(0, 5).map(order => (
                <div key={order.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">Pedido #{order.externalId || order.id.slice(-4)}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{formatMoney(order.totalAmount)}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString('pt-PT')}
                  </div>
                </div>
              ))}
              {customerOrders.length === 0 && (
                <p className="text-gray-500 text-sm">Sem histé³rico de pedidos.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Componentes modais e novas seções
  const ActionModal = () => {
    const [actionType, setActionType] = useState<ActionType>(ActionType.PHONE_CALL);
    const [actionStatus, setActionStatus] = useState<ActionStatus>(ActionStatus.PENDING);
    const [actionNotes, setActionNotes] = useState('');
    const [actionPriority, setActionPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [scheduledDate, setScheduledDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    if (!showActionModal || !selectedActionCustomer || !currentUser) return null;

    const handleSave = async () => {
      if (!selectedActionCustomer || !currentUser) {
        showToast('Dados do cliente ou usué¡rio néo disponé­veis', 'error');
        return;
      }

      setIsSaving(true);
      try {
        const action = await dataService.createCustomerAction({
          customerId: selectedActionCustomer.id,
          userId: currentUser.id,
          type: actionType,
          actionType: actionType,
          status: actionStatus,
          scheduledDate: scheduledDate || undefined,
          notes: actionNotes,
          priority: actionPriority,
          pointsEarned: 0
        });

        if (action) {
          showToast('Açéo criada com sucesso!', 'success');
          // Néo remover cliente da lista - manter para acompanhamento
          setShowActionModal(false);
          // Limpar apenas campos do formulário, mas manter cliente selecionado para possível nova ação
          setActionNotes('');
          setScheduledDate('');
          // Recarregar insights e ações para atualizar contadores
          loadInsights();
          loadActions();
          // Néo limpar selectedActionCustomer para manter contexto
        } else {
          showToast('Erro ao criar ação. Verifique se a tabela customer_actions existe no banco de dados.', 'error');
          console.error('createCustomerAction retornou null - Verifique se executou o SQL CREATE_LOYALTY_TABLES.sql');
        }
      } catch (error: any) {
        console.error('Erro ao criar ação:', error);
        const errorMessage = error.message || 'Erro desconhecido';
        showToast(`Erro ao criar ação: ${errorMessage}`, 'error');

        // Se for erro de tabela néo encontrada, mostrar mensagem mais éºtil
        if (errorMessage.includes('néo encontrada') || error.code === '42P01') {
          setTimeout(() => {
            showToast('Execute o SQL CREATE_LOYALTY_TABLES.sql no Supabase para criar as tabelas necessé¡rias', 'warning', 8000);
          }, 2000);
        }
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 min-h-screen min-w-full modal-overlay z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Nova Ação Comercial</h3>
            <button onClick={() => { setShowActionModal(false); setSelectedActionCustomer(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Cliente:</p>
            <p className="font-semibold text-gray-900 dark:text-white">{selectedActionCustomer.name}</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de Açéo</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.values(ActionType).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
              <select
                value={actionStatus}
                onChange={(e) => setActionStatus(e.target.value as ActionStatus)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.values(ActionStatus).map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prioridade</label>
              <select
                value={actionPriority}
                onChange={(e) => setActionPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="low">Baixa</option>
                <option value="medium">Mé©dia</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Agendada (opcional)</label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notas</label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Adicione notas sobre esta ação..."
              />
            </div>
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? 'A guardar...' : 'Guardar Açéo'}
              </button>
              <button
                onClick={() => { setShowActionModal(false); setSelectedActionCustomer(null); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const FeedbackModal = () => {
    const [feedback, setFeedback] = useState('');
    const [rating, setRating] = useState<number>(0);
    const [outcome, setOutcome] = useState<'positive' | 'neutral' | 'negative' | 'sale' | 'no_interest'>('neutral');
    const [isSaving, setIsSaving] = useState(false);

    if (!showFeedbackModal || !selectedActionForFeedback || !currentUser) return null;

    const customer = customers.find(c => c.id === selectedActionForFeedback.customerId);

    const handleSave = async () => {
      if (!feedback.trim()) {
        showToast('Por favor, adicione um feedback', 'warning');
        return;
      }

      setIsSaving(true);
      try {
        const feedbackData = await dataService.createCustomerFeedback({
          customerId: selectedActionForFeedback.customerId,
          actionId: selectedActionForFeedback.id,
          userId: currentUser.id,
          feedback: feedback.trim(),
          rating: rating > 0 ? rating : undefined,
          outcome
        });

        if (feedbackData) {
          showToast('Feedback registado com sucesso!', 'success');
          setShowFeedbackModal(false);
          setSelectedActionForFeedback(null);
          setFeedback('');
          setRating(0);
          setOutcome('neutral');
          loadFeedbacks();
          loadInsights();
          loadActions();
        } else {
          showToast('Erro ao registar feedback', 'error');
        }
      } catch (error: any) {
        showToast('Erro ao registar feedback: ' + (error.message || 'Erro desconhecido'), 'error');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 min-h-screen min-w-full modal-overlay z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Registar Feedback</h3>
            <button onClick={() => { setShowFeedbackModal(false); setSelectedActionForFeedback(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-6 h-6" />
            </button>
          </div>
          {customer && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Cliente:</p>
              <p className="font-semibold text-gray-900 dark:text-white">{customer.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Açéo: {selectedActionForFeedback.type}</p>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Feedback</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Descreva o resultado do contacto..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Avaliaçéo (1-5 estrelas)</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={`${rating >= star ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}
                  >
                    <Star className="w-6 h-6 fill-current" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Resultado</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="positive">Positivo</option>
                <option value="neutral">Neutro</option>
                <option value="negative">Negativo</option>
                <option value="sale">Venda Realizada</option>
                <option value="no_interest">Sem Interesse</option>
              </select>
            </div>
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSave}
                disabled={isSaving || !feedback.trim()}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? 'A guardar...' : 'Guardar Feedback'}
              </button>
              <button
                onClick={() => { setShowFeedbackModal(false); setSelectedActionForFeedback(null); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Conteéºdo - apenas aba 'insights' (aba 'actions' movida para CommercialActions.tsx) */}
      <PageShell
        title="Insights de Fidelizaçéo"
        actions={
          <div className="flex items-center gap-2">
            {/* Botéo Criar Açéo - Aparece apenas quando houver clientes selecionados */}
            {selectedInsights.size > 0 && (
              <button
                onClick={() => {
                  setShowBulkActionModal(true);
                }}
                className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg flex items-center shadow-lg transition-colors px-4 py-2"
              >
                <Plus className="w-5 h-5 mr-2" />
                <span className="hidden sm:inline">Criar Açéo</span>
              </button>
            )}

            {/* Botéo Excel */}
            <button
              onClick={exportInsightsToExcel}
              className="bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center shadow-lg transition-colors px-4 py-2"
              title="Exportar para Excel"
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            {/* Botéo PDF */}
            <button
              onClick={exportInsightsToPDF}
              className="bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center shadow-lg transition-colors px-4 py-2"
              title="Exportar para PDF"
            >
              <FileText className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </button>

            {/* Botéo Filtros - Apenas no Mobile */}
            {isMobile && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${showFilters || searchInsights || filterRisk !== 'all' || filterTier !== 'all' || filterDaysSince !== 'all' || filterHasActions !== 'all' || filterMinSpent || filterHasNotes !== 'all'
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                title="Filtros"
              >
                <Filter className="w-5 h-5" />
                {(searchInsights || filterRisk !== 'all' || filterTier !== 'all' || filterDaysSince !== 'all' || filterHasActions !== 'all' || filterMinSpent || filterHasNotes !== 'all') && (
                  <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
                    {[searchInsights, filterRisk !== 'all' ? 1 : 0, filterTier !== 'all' ? 1 : 0, filterDaysSince !== 'all' ? 1 : 0, filterHasActions !== 'all' ? 1 : 0, filterMinSpent ? 1 : 0, filterHasNotes !== 'all' ? 1 : 0].filter(Boolean).length}
                  </span>
                )}
              </button>
            )}
          </div>
        }
      >
        {/* FilterBar - Filtros principais visé­veis no desktop */}
        <FilterBar isStickyOnMobile={isMobile} stickyTopClassName="top-0">
          <ViewModeToggle
            value={insightsViewMode === 'grid' ? 'cards' : 'table'}
            onChange={(mode) => setInsightsViewMode(mode === 'cards' ? 'grid' : 'list')}
            size="compact"
          />

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

          <SearchInput
            value={searchInsights}
            onChange={(val) => {
              setSearchInsights(val);
            }}
            placeholder="Buscar clientes por nome ou telefone..."
            size="compact"
            className="flex-1 min-w-[120px] max-w-[300px] flex-shrink-0"
          />

          {/* Filtros - Ocultos no Mobile */}
          <div className="hidden sm:block">
            <SelectFilter
              value={filterRisk}
              onChange={(val) => {
                setFilterRisk(val as 'all' | 'high' | 'medium' | 'low');
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'Risco' },
                { value: 'high', label: 'Alto' },
                { value: 'medium', label: 'Médio' },
                { value: 'low', label: 'Baixo' },
              ]}
              className="flex-shrink-0"
              size="compact"
            />
          </div>

          <div className="hidden sm:block">
            <SelectFilter
              value={filterTier}
              onChange={(val) => {
                setFilterTier(val as 'all' | LoyaltyTier);
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'Tier' },
                { value: LoyaltyTier.BRONZE, label: 'Bronze' },
                { value: LoyaltyTier.SILVER, label: 'Prata' },
                { value: LoyaltyTier.GOLD, label: 'Ouro' },
              ]}
              className="flex-shrink-0"
              size="compact"
            />
          </div>

          <div className="hidden sm:block">
            <SelectFilter
              value={filterDaysSince}
              onChange={(val) => {
                setFilterDaysSince(val as 'all' | '30' | '60' | '90' | '180');
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'Tempo' },
                { value: '30', label: '+30d' },
                { value: '60', label: '+60d' },
                { value: '90', label: '+90d' },
                { value: '180', label: '+180d' },
              ]}
              className="flex-shrink-0"
              size="compact"
            />
          </div>

          <div className="hidden sm:block">
            <SelectFilter
              value={filterHasActions}
              onChange={(val) => {
                setFilterHasActions(val as 'all' | 'yes' | 'no');
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'Ações' },
                { value: 'yes', label: 'Com ações' },
                { value: 'no', label: 'Sem ações' },
              ]}
              className="flex-shrink-0"
              size="compact"
            />
          </div>

          <div className="hidden sm:block">
            <ItemsPerPageSelect
              value={itemsPerPage}
              onChange={(val) => {
                setItemsPerPage(val);
                setCurrentPage(1);
              }}
              options={[6, 12, 24, 48, 96, 500]}
              label=""
              size="compact"
              className="flex-shrink-0"
            />
          </div>

          {/* Botéo Limpar Filtros - Oculto no Mobile */}
          {(searchInsights || filterRisk !== 'all' || filterTier !== 'all' || filterDaysSince !== 'all' || filterHasActions !== 'all' || filterMinSpent || filterHasNotes !== 'all') && (
            <button
              onClick={() => {
                setSearchInsights('');
                setFilterRisk('all');
                setFilterTier('all');
                setFilterDaysSince('all');
                setFilterHasActions('all');
                setFilterMinSpent('');
                setFilterHasNotes('all');
                setCurrentPage(1);
              }}
              className="hidden sm:flex px-1.5 py-0.5 text-[10px] sm:text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors items-center gap-0.5 flex-shrink-0"
              title="Limpar filtros"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </FilterBar>

        {/* Painel de Filtros Mobile - Fixo quando aberto */}
        {isMobile && showFilters && (
          <div className="sticky top-[60px] z-20 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Filtros</h4>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Filtros lado a lado em grid 2 colunas */}
              <div className="grid grid-cols-2 gap-3">
                {/* Primeira linha de filtros */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Risco
                  </label>
                  <SelectFilter
                    value={filterRisk}
                    onChange={(val) => {
                      setFilterRisk(val as 'all' | 'high' | 'medium' | 'low');
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: 'Risco' },
                      { value: 'high', label: 'Alto' },
                      { value: 'medium', label: 'Médio' },
                      { value: 'low', label: 'Baixo' },
                    ]}
                    className="w-full"
                    size="md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tier
                  </label>
                  <SelectFilter
                    value={filterTier}
                    onChange={(val) => {
                      setFilterTier(val as 'all' | LoyaltyTier);
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: 'Tier' },
                      { value: LoyaltyTier.BRONZE, label: 'Bronze' },
                      { value: LoyaltyTier.SILVER, label: 'Prata' },
                      { value: LoyaltyTier.GOLD, label: 'Ouro' },
                    ]}
                    className="w-full"
                    size="md"
                  />
                </div>

                {/* Segunda linha */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tempo
                  </label>
                  <SelectFilter
                    value={filterDaysSince}
                    onChange={(val) => {
                      setFilterDaysSince(val as 'all' | '30' | '60' | '90' | '180');
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: 'Tempo' },
                      { value: '30', label: '+30d' },
                      { value: '60', label: '+60d' },
                      { value: '90', label: '+90d' },
                      { value: '180', label: '+180d' },
                    ]}
                    className="w-full"
                    size="md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ações
                  </label>
                  <SelectFilter
                    value={filterHasActions}
                    onChange={(val) => {
                      setFilterHasActions(val as 'all' | 'yes' | 'no');
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'all', label: 'Ações' },
                      { value: 'yes', label: 'Com ações' },
                      { value: 'no', label: 'Sem ações' },
                    ]}
                    className="w-full"
                    size="md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Itens por página
                  </label>
                  <ItemsPerPageSelect
                    value={itemsPerPage}
                    onChange={(val) => {
                      setItemsPerPage(val);
                      setCurrentPage(1);
                    }}
                    options={[6, 12, 24, 48, 96, 500]}
                    label=""
                    size="md"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Ordenaçéo - Nova seçéo para mobile */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ordenar por
                  </label>
                  <SelectFilter
                    value={sortBy}
                    onChange={(val) => {
                      setSortBy(val as 'risk' | 'days' | 'spent' | 'orders' | 'name');
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 'spent', label: 'Gasto Total' },
                      { value: 'orders', label: 'Pedidos' },
                      { value: 'days', label: 'Dias sem compra' },
                      { value: 'risk', label: 'Risco' },
                      { value: 'name', label: 'Nome' },
                    ]}
                    className="w-full"
                    size="md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ordem
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSortOrder('asc');
                        setCurrentPage(1);
                      }}
                      className={`flex-1 px-3 py-2 text-sm border rounded-lg transition-colors ${sortOrder === 'asc'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                      <ArrowUp className="w-4 h-4 mx-auto" />
                    </button>
                    <button
                      onClick={() => {
                        setSortOrder('desc');
                        setCurrentPage(1);
                      }}
                      className={`flex-1 px-3 py-2 text-sm border rounded-lg transition-colors ${sortOrder === 'desc'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                      <ArrowDown className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Botéo Limpar Filtros */}
              {(searchInsights || filterRisk !== 'all' || filterTier !== 'all' || filterDaysSince !== 'all' || filterHasActions !== 'all' || filterMinSpent || filterHasNotes !== 'all' || sortBy !== 'spent' || sortOrder !== 'desc') && (
                <button
                  onClick={() => {
                    setSearchInsights('');
                    setFilterRisk('all');
                    setFilterTier('all');
                    setFilterDaysSince('all');
                    setFilterHasActions('all');
                    setFilterMinSpent('');
                    setFilterHasNotes('all');
                    setSortBy('spent');
                    setSortOrder('desc');
                    setCurrentPage(1);
                  }}
                  className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>
        )}

        {/* Painel de Filtros Avançados Desktop */}
        {showFilters && !isMobile && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-2">
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Filtros Avançados</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">Filtros adicionais para busca mais específica</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Gasto Mínimo</label>
                <input
                  type="number"
                  value={filterMinSpent}
                  onChange={(e) => setFilterMinSpent(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tem Notas</label>
                <select
                  value={filterHasNotes}
                  onChange={(e) => setFilterHasNotes(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Sim</option>
                  <option value="no">Néo</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Lista de Clientes Inativos (Insights) */}
        {loadingInsights ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-600 dark:text-brand-400 mx-auto mb-2" />
            <p>A carregar insights...</p>
          </div>
        ) : filteredInsights.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {insights.length === 0
                ? 'Nenhum cliente inativo encontrado. Todos os clientes estéo ativos!'
                : 'Nenhum cliente encontrado com os filtros aplicados.'}
            </p>
          </div>
        ) : (
          <>
            {/* Controles de Seleçéo */}
            {filteredInsights.length > 0 && (
              <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    onClick={() => {
                      const allPageSelected = paginatedInsights.every(i => selectedInsights.has(i.customerId));
                      const newSelected = new Set(selectedInsights);
                      paginatedInsights.forEach(i => {
                        if (allPageSelected) {
                          newSelected.delete(i.customerId);
                        } else {
                          newSelected.add(i.customerId);
                        }
                      });
                      setSelectedInsights(newSelected);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title={paginatedInsights.every(i => selectedInsights.has(i.customerId)) ? 'Desselecionar página' : 'Selecionar página'}
                  >
                    {paginatedInsights.length > 0 && paginatedInsights.every(i => selectedInsights.has(i.customerId)) ? (
                      <CheckSquare className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {paginatedInsights.every(i => selectedInsights.has(i.customerId)) ? 'Desselecionar Pé¡gina' : 'Selecionar Pé¡gina'}
                    </span>
                    <span className="sm:hidden">
                      {paginatedInsights.every(i => selectedInsights.has(i.customerId)) ? 'Desmarcar' : 'Marcar'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const allFilteredSelected = filteredInsights.every(i => selectedInsights.has(i.customerId));
                      const newSelected = new Set(selectedInsights);
                      filteredInsights.forEach(i => {
                        if (allFilteredSelected) {
                          newSelected.delete(i.customerId);
                        } else {
                          newSelected.add(i.customerId);
                        }
                      });
                      setSelectedInsights(newSelected);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title={filteredInsights.every(i => selectedInsights.has(i.customerId)) ? 'Desselecionar todos' : 'Selecionar todos'}
                  >
                    {filteredInsights.every(i => selectedInsights.has(i.customerId)) ? (
                      <CheckSquare className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                      {filteredInsights.every(i => selectedInsights.has(i.customerId)) ? 'Desselecionar Todos' : 'Selecionar Todos'}
                    </span>
                    <span className="sm:hidden">
                      {filteredInsights.every(i => selectedInsights.has(i.customerId)) ? 'Desmarcar Todos' : 'Marcar Todos'}
                    </span>
                  </button>
                </div>

                {selectedInsights.size > 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-brand-600 dark:text-brand-400">{selectedInsights.size}</span>
                    {' '}selecionado{selectedInsights.size !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

            {/* Visualizaçéo - Cards ou Tabela */}
            {insightsViewMode === 'grid' ? (
              /* Cards View */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {paginatedInsights.map(insight => {
                  const customer = customers.find(c => c.id === insight.customerId);
                  if (!customer) return null;

                  // Contar ações do cliente
                  const customerActionCount = customerActions.filter(a => a.customerId === insight.customerId).length;
                  const pendingActions = customerActions.filter(a => a.customerId === insight.customerId && a.status === ActionStatus.PENDING).length;
                  const hasActions = customerActionCount > 0;

                  const isSelected = selectedInsights.has(insight.customerId);
                  const riskColors = {
                    high: {
                      bg: 'bg-red-50 dark:bg-red-900/20',
                      border: 'border-red-200 dark:border-red-800',
                      badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900',
                      text: 'text-red-600 dark:text-red-400'
                    },
                    medium: {
                      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
                      border: 'border-yellow-200 dark:border-yellow-800',
                      badge: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-900',
                      text: 'text-yellow-600 dark:text-yellow-400'
                    },
                    low: {
                      bg: 'bg-blue-50 dark:bg-blue-900/20',
                      border: 'border-blue-200 dark:border-blue-800',
                      badge: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900',
                      text: 'text-blue-600 dark:text-blue-400'
                    }
                  };

                  const riskStyle = riskColors[insight.riskLevel];

                  return (
                    <div
                      key={insight.customerId}
                      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 transition-all cursor-pointer ${isSelected
                          ? 'border-brand-500 dark:border-brand-400 ring-2 ring-brand-200 dark:ring-brand-800'
                          : riskStyle.border + ' hover:shadow-md'
                        }`}
                      onClick={() => {
                        const newSelected = new Set(selectedInsights);
                        if (isSelected) {
                          newSelected.delete(insight.customerId);
                        } else {
                          newSelected.add(insight.customerId);
                        }
                        setSelectedInsights(newSelected);
                      }}
                    >
                      <div className="p-3 sm:p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-400" />
                              )}
                              <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{insight.customerName}</h4>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${riskStyle.badge}`}>
                                {insight.riskLevel === 'high' ? 'Alto Risco' : insight.riskLevel === 'medium' ? 'Médio Risco' : 'Baixo Risco'}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getTierColor(insight.tier).badge}`}>
                                <span className="mr-1">{getTierIcon(insight.tier)}</span>
                                {insight.tier}
                              </span>
                              {hasActions ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {customerActionCount} ação{customerActionCount !== 1 ? 'ões' : ''}
                                  {pendingActions > 0 && ` (${pendingActions} pendente${pendingActions !== 1 ? 's' : ''})`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900">
                                  Sem ações
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerForDetail(insight);
                              setShowCustomerDetailModal(true);
                            }}
                            className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Ver Detalhes"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className={`w-3 h-3 ${riskStyle.text}`} />
                            <span className="text-gray-600 dark:text-gray-400">
                              {(() => {
                                if (insight.daysSinceLastOrder === Infinity) return 'Nunca fez pedidos';
                                const days = insight.daysSinceLastOrder;
                                if (days < 7) return `Hé¡ ${days} dia${days === 1 ? '' : 's'} sem compras`;
                                if (days < 30) return `Hé¡ ${Math.floor(days / 7)} semana${Math.floor(days / 7) === 1 ? '' : 's'} sem compras`;
                                if (days < 365) return `Há ${Math.floor(days / 30)} mês${Math.floor(days / 30) === 1 ? '' : 'es'} sem compras`;
                                return `Hé¡ mais de ${Math.floor(days / 365)} ano${Math.floor(days / 365) === 1 ? '' : 's'} sem compras`;
                              })()}
                              {insight.lastOrderDate && ` (última: ${new Date(insight.lastOrderDate).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })})`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <TrendingDown className={`w-3 h-3 ${riskStyle.text}`} />
                            <span className="text-gray-600 dark:text-gray-400">{insight.suggestedAction}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-700">
                          <span>Total Gasto: <span className="font-medium text-gray-900 dark:text-white">{formatMoney(insight.totalSpent)}</span></span>
                          <span>Pedidos: <span className="font-medium text-gray-900 dark:text-white">{insight.totalOrders}</span></span>
                        </div>
                      </div>
                      <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedActionCustomer(customer);
                            setShowActionModal(true);
                          }}
                          className="px-3 sm:px-4 py-2 min-h-[44px] sm:min-h-0 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-1.5 flex-1 sm:flex-initial justify-center"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Criar Açéo</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-280px)]">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4">
                          <button
                            onClick={() => {
                              const allSelected = paginatedInsights.every(i => selectedInsights.has(i.customerId));
                              const newSelected = new Set(selectedInsights);
                              paginatedInsights.forEach(i => {
                                if (allSelected) {
                                  newSelected.delete(i.customerId);
                                } else {
                                  newSelected.add(i.customerId);
                                }
                              });
                              setSelectedInsights(newSelected);
                            }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          >
                            {paginatedInsights.length > 0 && paginatedInsights.every(i => selectedInsights.has(i.customerId)) ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('name')}>
                          Cliente <SortIcon field="name" />
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-center" onClick={() => handleSort('risk')}>
                          Risco <SortIcon field="risk" />
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm text-center">Tier</th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm text-center">Ações</th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm hidden md:table-cell cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('days')}>
                          Tempo sem Pedido <SortIcon field="days" />
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('spent')}>
                          Total Gasto <SortIcon field="spent" />
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('orders')}>
                          Pedidos <SortIcon field="orders" />
                        </th>
                        <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-400 text-sm">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {paginatedInsights.map(insight => {
                        const customer = customers.find(c => c.id === insight.customerId);
                        if (!customer) return null;

                        // Contar ações do cliente
                        const customerActionCount = customerActions.filter(a => a.customerId === insight.customerId).length;
                        const pendingActions = customerActions.filter(a => a.customerId === insight.customerId && a.status === ActionStatus.PENDING).length;
                        const hasActions = customerActionCount > 0;

                        const isSelected = selectedInsights.has(insight.customerId);
                        const riskColors = {
                          high: {
                            badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900',
                          },
                          medium: {
                            badge: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-900',
                          },
                          low: {
                            badge: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900',
                          }
                        };

                        const riskStyle = riskColors[insight.riskLevel];

                        return (
                          <tr
                            key={insight.customerId}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${isSelected ? 'bg-brand-50 dark:bg-brand-logo-dark' : ''
                              }`}
                            onClick={() => {
                              const newSelected = new Set(selectedInsights);
                              if (isSelected) {
                                newSelected.delete(insight.customerId);
                              } else {
                                newSelected.add(insight.customerId);
                              }
                              setSelectedInsights(newSelected);
                            }}
                          >
                            <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  const newSelected = new Set(selectedInsights);
                                  if (isSelected) {
                                    newSelected.delete(insight.customerId);
                                  } else {
                                    newSelected.add(insight.customerId);
                                  }
                                  setSelectedInsights(newSelected);
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {insight.customerName}
                                </div>
                                {customer.phone && (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {customer.phone}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center" title={insight.riskLevel === 'high' ? 'Alto Risco' : insight.riskLevel === 'medium' ? 'Médio Risco' : 'Baixo Risco'}>
                                {insight.riskLevel === 'high' ? (
                                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                ) : insight.riskLevel === 'medium' ? (
                                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                                ) : (
                                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center" title={insight.tier}>
                                {insight.tier === LoyaltyTier.GOLD ? (
                                  <Award className="w-5 h-5 text-yellow-600 dark:text-yellow-400 fill-current" />
                                ) : insight.tier === LoyaltyTier.SILVER ? (
                                  <Award className="w-5 h-5 text-gray-400 dark:text-gray-500 fill-current" />
                                ) : (
                                  <Award className="w-5 h-5 text-amber-600 dark:text-amber-400 fill-current" />
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center relative" title={hasActions ? `${customerActionCount} ação${customerActionCount !== 1 ? 'ões' : ''}${pendingActions > 0 ? ` (${pendingActions} pendente${pendingActions !== 1 ? 's' : ''})` : ''}` : 'Sem ações'}>
                                {hasActions ? (
                                  <>
                                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    {pendingActions > 0 && (
                                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                        {pendingActions}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <XCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 hidden md:table-cell">
                              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <Clock className="w-4 h-4" />
                                <span>
                                  {(() => {
                                    if (insight.daysSinceLastOrder === Infinity) return 'Nunca fez pedidos';
                                    const days = insight.daysSinceLastOrder;
                                    if (days < 7) return `${days} dia${days === 1 ? '' : 's'}`;
                                    if (days < 30) return `${Math.floor(days / 7)} semana${Math.floor(days / 7) === 1 ? '' : 's'}`;
                                    if (days < 365) return `${Math.floor(days / 30)} mês${Math.floor(days / 30) === 1 ? '' : 'es'}`;
                                    return `+${Math.floor(days / 365)} ano${Math.floor(days / 365) === 1 ? '' : 's'}`;
                                  })()}
                                </span>
                              </div>
                              {insight.lastOrderDate && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  éšltima: {new Date(insight.lastOrderDate).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {formatMoney(insight.totalSpent)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {insight.totalOrders}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCustomerForDetail(insight);
                                    setShowCustomerDetailModal(true);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                  title="Ver Detalhes"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedActionCustomer(customer);
                                    setShowActionModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                                  title="Criar Açéo"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span className="hidden sm:inline">Açéo</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Paginaçéo */}
            {totalPages > 1 && (
              <div className="flex justify-center mt-6">
                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredInsights.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  mode={isMobile ? 'simple' : 'full'}
                />
              </div>
            )}
          </>
        )}
      </PageShell>

      {/* Aba 'actions' removida - agora página separada CommercialActions.tsx */}

      {/* Seção de Relatórios removida - substituída por botões de exportação */}

      {/* Modal de Detalhes do Cliente */}
      {showCustomerDetailModal && selectedCustomerForDetail && (() => {
        const customer = customers.find(c => c.id === selectedCustomerForDetail.customerId);
        if (!customer) {
          // Criar customer temporé¡rio se néo encontrado
          const tempCustomer: Customer = {
            id: selectedCustomerForDetail.customerId,
            name: selectedCustomerForDetail.customerName,
            phone: '',
            email: '',
            address: '',
            tier: selectedCustomerForDetail.tier,
            totalSpent: selectedCustomerForDetail.totalSpent,
            totalOrders: selectedCustomerForDetail.totalOrders,
            lastOrderDate: selectedCustomerForDetail.lastOrderDate || '',
            notes: ''
          };
          return (
            <CustomerDetailModal
              customer={tempCustomer}
              insight={selectedCustomerForDetail}
              orders={orders}
              actions={customerActions.filter(a => a.customerId === selectedCustomerForDetail.customerId)}
              feedbacks={customerFeedbacks.filter(f => f.customerId === selectedCustomerForDetail.customerId)}
              onClose={() => {
                setShowCustomerDetailModal(false);
                setSelectedCustomerForDetail(null);
              }}
              onCreateAction={(customer) => {
                setShowCustomerDetailModal(false);
                setSelectedActionCustomer(customer);
                setShowActionModal(true);
              }}
              onAddFeedback={(customer) => {
                const action = customerActions.find(a => a.customerId === customer.id && a.status === ActionStatus.COMPLETED);
                if (action) {
                  setSelectedActionForFeedback(action);
                  setShowFeedbackModal(true);
                } else {
                  showToast('Nenhuma ação concluída encontrada para adicionar feedback', 'warning');
                }
              }}
              showToast={showToast}
            />
          );
        }
        return (
          <CustomerDetailModal
            customer={customer}
            insight={selectedCustomerForDetail}
            orders={orders}
            actions={customerActions.filter(a => a.customerId === selectedCustomerForDetail.customerId)}
            feedbacks={customerFeedbacks.filter(f => f.customerId === selectedCustomerForDetail.customerId)}
            onClose={() => {
              setShowCustomerDetailModal(false);
              setSelectedCustomerForDetail(null);
            }}
            onCreateAction={(customer) => {
              setShowCustomerDetailModal(false);
              setSelectedActionCustomer(customer);
              setShowActionModal(true);
            }}
            onAddFeedback={(customer) => {
              const action = customerActions.find(a => a.customerId === customer.id && a.status === ActionStatus.COMPLETED);
              if (action) {
                setSelectedActionForFeedback(action);
                setShowFeedbackModal(true);
              } else {
                showToast('Nenhuma açéo conclué­da encontrada para adicionar feedback', 'warning');
              }
            }}
            showToast={showToast}
          />
        );
      })()}

      {/* Modal de Detalhes do Pedido removido - agora gerenciado pelo CustomerDetailModal */}

      {/* Modal de Ações em Massa */}
      {showBulkActionModal && (
        <BulkActionModal
          selectedCustomerIds={Array.from(selectedInsights)}
          customers={customers}
          onClose={() => {
            setShowBulkActionModal(false);
            setSelectedInsights(new Set());
          }}
          onSuccess={() => {
            loadInsights();
            loadActions();
            showToast('Ações criadas com sucesso!', 'success');
          }}
          currentUser={currentUser}
          showToast={showToast}
        />
      )}

      {/* Modais */}
      {showActionModal && <ActionModal />}
      {showFeedbackModal && <FeedbackModal />}
    </div>
  );
};

// Componente de Modal de Ações em Massa
const BulkActionModal: React.FC<{
  selectedCustomerIds: string[];
  customers: Customer[];
  onClose: () => void;
  onSuccess: () => void;
  currentUser: User | null;
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
}> = ({ selectedCustomerIds, customers, onClose, onSuccess, currentUser, showToast }) => {
  const [actionType, setActionType] = useState<ActionType>(ActionType.PHONE_CALL);
  const [actionStatus, setActionStatus] = useState<ActionStatus>(ActionStatus.PENDING);
  const [actionNotes, setActionNotes] = useState('');
  const [actionPriority, setActionPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!currentUser) return null;

  const selectedCustomers = customers.filter(c => selectedCustomerIds.includes(c.id));

  const handleSave = async () => {
    if (selectedCustomers.length === 0) {
      showToast('Nenhum cliente selecionado', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const customer of selectedCustomers) {
        const action = await dataService.createCustomerAction({
          customerId: customer.id,
          userId: currentUser.id,
          type: actionType,
          actionType: actionType,
          status: actionStatus,
          scheduledDate: scheduledDate || undefined,
          notes: actionNotes,
          priority: actionPriority,
          pointsEarned: 0
        });

        if (action) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        showToast(`${successCount} ação(ões) criada(s) com sucesso${errorCount > 0 ? `. ${errorCount} erro(s).` : '.'}`,
          errorCount > 0 ? 'warning' : 'success');
        onSuccess();
        onClose();
      } else {
        showToast('Erro ao criar ações', 'error');
      }
    } catch (error: any) {
      showToast('Erro ao criar açéµes: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 min-h-screen min-w-full modal-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Criar Ações em Massa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>{selectedCustomers.length}</strong> cliente(s) selecionado(s)
          </p>
          <div className="mt-2 max-h-32 overflow-y-auto">
            <div className="flex flex-wrap gap-1">
              {selectedCustomers.map(customer => (
                <span key={customer.id} className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded">
                  {customer.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de Açéo</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {Object.values(ActionType).map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
            <select
              value={actionStatus}
              onChange={(e) => setActionStatus(e.target.value as ActionStatus)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {Object.values(ActionStatus).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prioridade</label>
            <select
              value={actionPriority}
              onChange={(e) => setActionPriority(e.target.value as 'low' | 'medium' | 'high')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="low">Baixa</option>
              <option value="medium">Mé©dia</option>
              <option value="high">Alta</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Agendada (opcional)</label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notas (aplicadas a todas as ações)</label>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Adicione notas que serão aplicadas a todas as ações..."
            />
          </div>
          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSaving ? `A criar ${selectedCustomers.length} ação(ões)...` : `Criar ${selectedCustomers.length} Ação(ões)`}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


