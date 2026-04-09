import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShoppingCart, Package, LogOut, Award, TrendingUp, Warehouse, ChevronLeft, ChevronRight, ChevronDown, ShoppingBag, Egg, UserCheck, Repeat, Truck, FileText, BarChart3, ArrowLeftRight, Wallet, Download, Activity, ArrowRight, Upload, Globe, CreditCard, Megaphone, Target, Share2, Eye, MapPin, Moon, Sun, Store, Image, Tv, List, Layers, Ruler, Tag, ClipboardCheck, Scale, AlertTriangle, Shield, Boxes } from 'lucide-react';
import { User, UserRole } from '../../../core/types/types';
import { useLanguage } from '../../../core/contexts/LanguageContext';
import { Logo } from '../ui/Logo';
import { Avatar } from '../ui/Avatar';
import { LanguageFlag } from '../ui/LanguageFlag';
import { usePermissions } from '../../../core/hooks/usePermissions';

const BASE_PATH = '/';

interface SidebarProps {
  currentUser: User;
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

// Submenu item interface
interface SubMenuItem {
  id: string;
  label: string;
  icon?: any;
  path: string;
}

// Main menu item interface with optional children
interface MenuItem {
  id: string;
  label: string;
  icon: any;
  permission: string;
  children?: SubMenuItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activePage,
  onNavigate,
  onLogout,
  isDarkMode,
  toggleTheme,
  isOpen,
  onToggle
}) => {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { hasPermission } = usePermissions(currentUser);

  // State for enabled modules
  const [enabledModules, setEnabledModules] = React.useState<Record<string, boolean>>({});

  // Load modules config
  React.useEffect(() => {
    const loadModulesConfig = () => {
      try {
        const stored = localStorage.getItem('system_modules_config');
        if (stored) {
          setEnabledModules(JSON.parse(stored));
        } else {
          // If no config, assume all enabled by default
          setEnabledModules({});
        }
      } catch (e) {
        console.warn('Error parsing modules config', e);
      }
    };

    loadModulesConfig();

    // Listen for updates
    const handleUpdate = () => loadModulesConfig();
    window.addEventListener('modules_updated', handleUpdate);

    return () => window.removeEventListener('modules_updated', handleUpdate);
  }, []);

  // Helper to check if a module is enabled
  const isModuleEnabled = (moduleId: string) => {
    // If no config exists (empty object), assume enabled (default behavior)
    if (Object.keys(enabledModules).length === 0) return true;

    // Explicitly check for false (undefined means enabled by default for safety, or map strict IDs)
    // Mapping internal IDs to Module IDs from ModuleSettings.tsx
    const moduleMap: Record<string, string> = {
      'dashboard': 'dashboard',
      'orders': 'orders',
      'sales': 'sales',
      'customers': 'customers',
      'purchases': 'purchases',
      'products': 'products',
      'stock-management': 'stock-management',
      'media': 'media',
      'users': 'users',
      'tracking': 'dashboard', // Linked to dashboard
    };

    const configId = moduleMap[moduleId];
    if (!configId) return true; // Always show if not mapped to a toggleable module

    return enabledModules[configId] !== false;
  };

  // Estado para controlar quais submenus estão expandidos
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => {
    // Carregar estado salvo do localStorage
    try {
      const saved = localStorage.getItem('sidebar_expanded_menus');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Salvar estado de expansão no localStorage
  useEffect(() => {
    localStorage.setItem('sidebar_expanded_menus', JSON.stringify(expandedMenus));
  }, [expandedMenus]);

  // Obter pathname atual para destacar submenu ativo
  const location = useLocation();

  // Estrutura do menu com submenus (definida aqui para usar no useEffect)
  const menuItemsWithChildren: { id: string; children?: { path: string }[] }[] = [
    { id: 'sales', children: [{ path: '/admin/vendas' }, { path: '/admin/vendas/por-produto' }, { path: '/admin/vendas/pedidos' }, { path: '/admin/vendas/clientes' }] },
    { id: 'purchases', children: [{ path: '/admin/compras' }, { path: '/admin/compras/por-produto' }, { path: '/admin/compras/fornecedores' }] },
    { id: 'products', children: [{ path: '/admin/produtos' }, { path: '/admin/produtos/categorias' }, { path: '/admin/produtos/unidades' }] },
    { id: 'stock-management', children: [{ path: '/admin/stock' }, { path: '/admin/stock/alertas' }, { path: '/admin/stock/movimentos' }, { path: '/admin/stock/lotes' }, { path: '/admin/stock/auditoria' }, { path: '/admin/stock/ajustes' }] },
    { id: 'users', children: [{ path: '/admin/usuarios' }, { path: '/admin/usuarios/roles' }] },
  ];

  // Auto-expandir apenas o menu que contém a rota atual
  useEffect(() => {
    const currentPath = location.pathname;
    let activeMenuId: string | null = null;

    // Encontrar qual menu pai contém a rota atual
    for (const item of menuItemsWithChildren) {
      if (item.children?.some(child =>
        currentPath === child.path || currentPath.startsWith(child.path + '/')
      )) {
        activeMenuId = item.id;
        break;
      }
    }

    // Se encontrou um menu ativo, expandir apenas esse e colapsar os outros
    if (activeMenuId) {
      setExpandedMenus(prev => {
        // Verificar se já está no estado correto para evitar loops
        const shouldUpdate = !prev[activeMenuId] ||
          Object.keys(prev).some(key => key !== activeMenuId && prev[key]);

        if (shouldUpdate) {
          const newState: Record<string, boolean> = {};
          menuItemsWithChildren.forEach(item => {
            newState[item.id] = item.id === activeMenuId;
          });
          return newState;
        }
        return prev;
      });
    }
  }, [location.pathname]);

  // Toggle expansão de um menu (comportamento accordion - fecha outros)
  const toggleMenuExpansion = (menuId: string) => {
    setExpandedMenus(prev => {
      const isCurrentlyExpanded = prev[menuId];
      // Se está a expandir, fechar todos os outros (accordion)
      // Se está a colapsar, apenas colapsar este
      if (!isCurrentlyExpanded) {
        const newState: Record<string, boolean> = {};
        menuItemsWithChildren.forEach(item => {
          newState[item.id] = item.id === menuId;
        });
        return newState;
      } else {
        return { ...prev, [menuId]: false };
      }
    });
  };

  // Estrutura do menu com submenus
  const allMenuItems: MenuItem[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard, permission: 'dashboard.view' },
    {
      id: 'sales',
      label: t.nav.sales,
      icon: TrendingUp,
      permission: 'sales.view',
      children: [
        { id: 'sales-orders', label: t.nav.orders, icon: ShoppingCart, path: '/admin/vendas/pedidos' },
        { id: 'sales-customers', label: t.nav.customers, icon: Users, path: '/admin/vendas/clientes' },
        { id: 'sales-summaries', label: 'Resumos', icon: List, path: '/admin/vendas' },
        { id: 'sales-by-product', label: 'Por Produto', icon: Package, path: '/admin/vendas/por-produto' },
      ]
    },
    {
      id: 'purchases',
      label: t.nav.purchases,
      icon: ShoppingBag,
      permission: 'purchases.view',
      children: [
        { id: 'purchases-list', label: 'Compras', icon: ShoppingBag, path: '/admin/compras' },
        { id: 'purchases-by-product', label: 'Por Produto', icon: Package, path: '/admin/compras/por-produto' },
        { id: 'purchases-suppliers', label: 'Fornecedores', icon: Truck, path: '/admin/compras/fornecedores' },
      ]
    },
    {
      id: 'products',
      label: t.nav.products,
      icon: Package,
      permission: 'products.view',
      children: [
        { id: 'products-list', label: 'Produtos', icon: Package, path: '/admin/produtos' },
        { id: 'products-categories', label: 'Categorias', icon: Tag, path: '/admin/produtos/categorias' },
        { id: 'products-units', label: 'Unidades', icon: Ruler, path: '/admin/produtos/unidades' },
      ]
    },
    {
      id: 'stock-management',
      label: t.nav.stock,
      icon: BarChart3,
      permission: 'products.view',
      children: [
        { id: 'stock-products', label: 'Produtos', icon: Package, path: '/admin/stock' },
        { id: 'stock-alerts', label: 'Alertas', icon: AlertTriangle, path: '/admin/stock/alertas' },
        { id: 'stock-movements', label: 'Movimentos', icon: ArrowLeftRight, path: '/admin/stock/movimentos' },
        { id: 'stock-lots', label: 'Lotes', icon: Boxes, path: '/admin/stock/lotes' },
        { id: 'stock-audit', label: 'Auditoria', icon: ClipboardCheck, path: '/admin/stock/auditoria' },
        { id: 'stock-adjustments', label: 'Ajustes', icon: Scale, path: '/admin/stock/ajustes' },
      ]
    },
    { id: 'media', label: t.nav.gallery, icon: Image, permission: 'media.view' },
    {
      id: 'users',
      label: t.nav.users,
      icon: Users,
      permission: 'users.view',
      children: [
        { id: 'users-list', label: 'Usuários', icon: Users, path: '/admin/usuarios' },
        { id: 'users-roles', label: 'Gerir Roles', icon: Shield, path: '/admin/usuarios/roles' },
      ]
    },
    { id: 'tracking', label: t.nav.statistics, icon: Activity, permission: 'users.view' },
  ];

  // Filtrar itens baseado apenas nas permisséµes (sistema simplificado)
  const filteredMenuItems = useMemo(() => {
    return allMenuItems.filter(item => {
      // 1. Check Module status
      if (!isModuleEnabled(item.id)) return false;

      // 2. Check User Permission
      if (!item.permission) return true;
      return hasPermission(item.permission);
    });
  }, [hasPermission, t, enabledModules]);

  return (
    <>
      <div className={`bg-surface-overlay h-screen border-r border-border-default flex flex-col fixed left-0 top-0 z-10 hidden md:flex transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
        {/* Header */}
        <div className={`flex items-center border-b border-border-default transition-all duration-300 ${isOpen ? 'px-4 py-4 justify-start' : 'px-2 py-4 justify-center'}`}>
          <button
            onClick={() => {
              navigate('/');
            }}
            className="flex-shrink-0 flex items-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
          >
            {isOpen ? (
              <Logo variant="full" width={200} height={62} className="h-14 sm:h-16 w-auto max-w-[calc(100%-2rem)] object-contain" isDarkMode={isDarkMode} />
            ) : (
              <Logo variant="icon" width={150} height={45} className="w-[150px] h-[45px] object-contain" isDarkMode={isDarkMode} />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedMenus[item.id];

            // Verificar se algum submenu está ativo
            const isSubmenuActive = hasChildren && item.children?.some(
              child => location.pathname === child.path || location.pathname.startsWith(child.path + '/')
            );
            const isActive = activePage === item.id || activePage.startsWith(item.id + '-') || isSubmenuActive;

            // Sidebar fechado - mostrar apenas ícones com tooltip
            if (!isOpen) {
              if (hasChildren) {
                return (
                  <div key={item.id} className="relative group">
                    <button
                      onClick={() => onNavigate(item.id)}
                      title={item.label}
                      className={`w-full flex items-center justify-center py-2.5 px-2 rounded-lg transition-colors text-sm font-medium relative ${isActive
                        ? 'bg-brand-logo-dark/15 dark:bg-brand-logo-dark text-brand-logo-dark dark:text-white dark:border-l-2 dark:border-l-brand-logo-light'
                        : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                        }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-logo-dark dark:text-white' : 'text-content-muted'}`} />
                    </button>
                    {/* Tooltip com submenus ao hover quando sidebar fechado */}
                    <div className="absolute left-full ml-2 top-0 bg-surface-raised border border-border-strong text-content-primary text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg min-w-[160px]">
                      <div className="px-3 py-2 font-medium border-b border-border-default text-content-primary">
                        {item.label}
                      </div>
                      <div className="py-1">
                        {item.children?.map(child => {
                          const ChildIcon = child.icon;

                          // Find the best match among siblings for tooltip logic
                          const matchingSiblings = item.children?.filter(c =>
                            location.pathname === c.path || location.pathname.startsWith(c.path + '/')
                          ) || [];
                          const bestSiblingMatch = matchingSiblings.reduce((prev, curr) =>
                            (curr.path.length > prev.path.length) ? curr : prev
                            , matchingSiblings[0]);

                          const isChildActive = child.id === bestSiblingMatch?.id;

                          return (
                            <button
                              key={child.id}
                              onClick={() => navigate(child.path)}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${isChildActive
                                ? 'bg-brand-logo-dark/15 text-brand-logo-dark dark:text-brand-400'
                                : 'text-content-secondary hover:bg-surface-base hover:text-content-primary'
                                }`}
                            >
                              {ChildIcon && <ChildIcon className="w-4 h-4" />}
                              <span>{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="absolute right-full top-3 border-4 border-transparent border-r-surface-raised"></div>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={item.label}
                  className={`w-full flex items-center justify-center py-2.5 px-2 rounded-lg transition-colors text-sm font-medium relative group ${isActive
                    ? 'bg-brand-logo-dark/15 dark:bg-brand-logo-dark text-brand-logo-dark dark:text-white dark:border-l-2 dark:border-l-brand-logo-light'
                    : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                    }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-logo-dark dark:text-white' : 'text-content-muted'}`} />
                  <div className="absolute left-full ml-2 px-2 py-1 bg-surface-raised border border-border-strong text-content-primary text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-surface-raised"></div>
                  </div>
                </button>
              );
            }

            // Sidebar aberto - mostrar menu completo com accordion
            if (hasChildren) {
              return (
                <div key={item.id} className="space-y-1">
                  {/* Menu principal com seta de expansão */}
                  <button
                    onClick={() => toggleMenuExpansion(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive
                      ? 'bg-brand-logo-dark/15 dark:bg-brand-logo-dark/30 text-brand-logo-dark dark:text-white'
                      : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-logo-dark dark:text-white' : 'text-content-muted'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''} ${isActive ? 'text-brand-logo-dark dark:text-white' : 'text-content-muted'}`} />
                  </button>

                  {/* Submenus com animação */}
                  <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="pl-4 space-y-0.5 pt-1">
                      {item.children?.map(child => {
                        const ChildIcon = child.icon;

                        // Encontrar o melhor match entre os irmãos (o path mais longo que coincide)
                        const matchingSiblings = item.children?.filter(c =>
                          location.pathname === c.path || location.pathname.startsWith(c.path + '/')
                        ) || [];
                        const bestSiblingMatch = matchingSiblings.reduce((prev, curr) =>
                          (curr.path.length > prev.path.length) ? curr : prev
                          , matchingSiblings[0]);

                        const isChildActive = child.id === bestSiblingMatch?.id;

                        return (
                          <button
                            key={child.id}
                            onClick={() => navigate(child.path)}
                            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-sm ${isChildActive
                              ? 'bg-brand-logo-dark/10 dark:bg-brand-logo-dark text-brand-logo-dark dark:text-white border-l-2 border-l-brand-logo-dark dark:border-l-brand-logo-light'
                              : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                              }`}
                          >
                            {ChildIcon && <ChildIcon className={`w-4 h-4 flex-shrink-0 ${isChildActive ? 'text-brand-logo-dark dark:text-white' : 'text-content-muted'}`} />}
                            <span className="truncate">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            // Item sem submenus
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${isActive
                  ? 'bg-brand-logo-dark/15 dark:bg-brand-logo-dark text-brand-logo-dark dark:text-white dark:border-l-2 dark:border-l-brand-logo-light'
                  : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                  }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-logo-dark dark:text-white' : 'text-content-muted'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={`border-t border-border-default ${isOpen ? 'p-2' : 'p-2'}`}>
          {/* Menu Inferior */}

          {/* Perfil do Usuário */}
          <button
            onClick={() => onNavigate('profile')}
            className={`w-full flex items-center ${isOpen ? 'space-x-2 px-2 py-2 mb-2' : 'justify-center py-2 mb-2'} rounded-lg hover:bg-surface-raised transition-colors relative group`}
            title={!isOpen ? currentUser.name : ''}
          >
            <Avatar
              src={currentUser.avatar}
              alt={currentUser.name}
              name={currentUser.name}
              size="sm"
            />
            {isOpen && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-content-primary truncate">{currentUser.name}</p>
                <p className="text-[10px] text-content-muted truncate">
                  {currentUser.roleDisplayName || (currentUser.role === UserRole.ADMIN ? t.ui.admin : t.ui.staff)}
                </p>
              </div>
            )}
          </button>

          {/* Switch de Idioma */}
          <div className={`mb-2 ${isOpen ? '' : ''}`}>
            {isOpen ? (
              <div className="flex gap-0.5 rounded-lg overflow-hidden border border-border-strong bg-surface-base">
                <button
                  onClick={() => setLanguage('pt')}
                  title="Português"
                  className={`flex-1 px-2 py-2 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1 ${language === 'pt'
                    ? 'bg-brand-logo-dark/15 dark:bg-brand-logo-dark dark:text-white text-brand-logo-dark shadow-sm scale-105'
                    : 'text-content-secondary hover:bg-surface-raised hover:scale-102'
                    }`}
                >
                  <LanguageFlag language="pt" size="sm" />
                  <span>PT</span>
                </button>
                <button
                  onClick={() => setLanguage('en')}
                  title="English"
                  className={`flex-1 px-2 py-2 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1 ${language === 'en'
                    ? 'bg-brand-logo-dark/15 dark:bg-brand-logo-dark dark:text-white text-brand-logo-dark shadow-sm scale-105'
                    : 'text-content-secondary hover:bg-surface-raised hover:scale-102'
                    }`}
                >
                  <LanguageFlag language="en" size="sm" />
                  <span>EN</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLanguage(language === 'pt' ? 'en' : 'pt')}
                title={language === 'pt' ? 'Switch to English' : 'Mudar para Português'}
                className="w-full py-2 rounded-lg text-content-secondary hover:bg-surface-raised transition-all duration-200 hover:scale-105 flex items-center justify-center gap-1"
              >
                <LanguageFlag language={language === 'pt' ? 'en' : 'pt'} size="sm" />
              </button>
            )}
          </div>

          {/* Botões de Ação */}
          <div className={`flex ${isOpen ? 'space-x-2' : 'flex-col space-y-2'}`}>
            <button
              onClick={() => navigate('/')}
              title="Voltar ao Site"
              className={`flex items-center justify-center ${isOpen ? 'flex-1 px-3 py-2' : 'w-full py-2'} rounded-lg text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors relative group`}
            >
              <Globe className="w-4 h-4" />
            </button>
            <button
              onClick={toggleTheme}
              title={isDarkMode ? t.settings.lightMode : t.settings.darkMode}
              className={`flex items-center justify-center ${isOpen ? 'flex-1 px-3 py-2' : 'w-full py-2'} rounded-lg text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors relative group`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={onLogout}
              title={t.auth.logout}
              className={`flex items-center justify-center ${isOpen ? 'flex-1 px-3 py-2' : 'w-full py-2'} rounded-lg text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors relative group`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`hidden md:flex fixed top-1/2 ${isOpen ? 'left-[252px]' : 'left-[76px]'} -translate-y-1/2 -translate-x-1/2 z-30 bg-surface-raised border-2 border-border-strong rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:bg-surface-base hover:border-brand-500 dark:hover:border-brand-400`}
        aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </>
  );
};

