import React, { useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogIn, LogOut, Moon, Sun, Settings, ShoppingCart, Menu, X, Home, ShoppingBag, Tv, Info, Search, Filter } from 'lucide-react';
import { UserRole } from '../../../core/types/types';
import { Logo } from '../ui/Logo';
import { useMobile } from '../../../core/hooks/useMobile';
import { User as UserType } from '../../../core/types/types';
import { useShopContextSafe } from '../../../../contexts/ShopContext';

interface HeaderProps {
  currentUser: UserType | null;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
  isShopMode?: boolean;
  cartItemCount?: number;
  onCartClick?: () => void;
  onProfileClick?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  currentUser,
  isDarkMode,
  toggleTheme,
  onLogout,
  onLogin,
  isShopMode = false,
  cartItemCount = 0,
  onCartClick,
  onProfileClick
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile(768);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);
  
  const shopContext = useShopContextSafe();
  const searchTerm = shopContext?.searchTerm || '';
  const setSearchTerm = shopContext?.setSearchTerm;
  const onFilterClick = shopContext?.onFilterClick;
  const hasActiveFilters = shopContext?.hasActiveFilters || false;

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    setUserMenuOpen(false);
  };

  // Header para modo Shop (público)
  if (isShopMode) {
    return (
      <header className={`backdrop-blur-xl bg-surface-raised/90 dark:bg-surface-base/90 border-b border-border-default shadow-lg shadow-black/5 fixed top-0 left-0 right-0 z-30 transition-all duration-300 ${isMobile ? 'h-16' : 'h-16'}`}>
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
          <div className={`flex items-center justify-between ${isMobile ? 'gap-2' : 'gap-2 sm:gap-4'} ${isMobile ? 'h-16' : 'h-16'}`}>
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
              <Link
                to="/"
                className="flex items-center cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
                aria-label="Ir para página inicial"
              >
                <Logo
                  width={isMobile ? 130 : 120}
                  height={isMobile ? 42 : 40}
                  className={isMobile ? "h-10 w-auto" : "h-8 sm:h-10 w-auto"}
                  isDarkMode={isDarkMode}
                />
              </Link>
            </div>

            {/* Right Group: Search, Filters & Actions */}
            <div className="flex-1 flex items-center justify-end gap-2 sm:gap-4 lg:gap-6 min-w-0">
              {/* Search Bar & Filters */}
              <div className="flex-1 flex items-center gap-2 max-w-xl">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm && setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white/80 dark:bg-gray-800/80 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-1 focus:ring-green-500/50 focus:border-green-500/50 transition-all backdrop-blur-sm"
                  />
                </div>
              </div>

            {/* Actions */}
            <div className="flex items-center flex-shrink-0 gap-1 sm:space-x-1 sm:space-x-3">
              {/* Dark Mode Toggle */}
              <button
                onClick={toggleTheme}
                className={`${isMobile ? 'p-2' : 'p-2'} rounded-lg text-content-secondary hover:bg-surface-raised/80 backdrop-blur-md transition-all shadow-sm hover:shadow-md`}
                title={isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
                aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                {isDarkMode ? <Sun className={isMobile ? "h-5 w-5" : "h-5 w-5"} /> : <Moon className={isMobile ? "h-5 w-5" : "h-5 w-5"} />}
              </button>

              {/* Link para Painel Admin (se for admin) */}
              {currentUser && currentUser.role !== UserRole.CLIENTE && !(currentUser.roles && currentUser.roles.length === 1 && currentUser.roles[0] === 'CLIENTE') && (
                <button
                  onClick={() => navigate('/admin')}
                  className={`${isMobile ? 'p-2' : 'p-2'} rounded-lg text-content-secondary hover:bg-surface-raised/80 backdrop-blur-md transition-all shadow-sm hover:shadow-md`}
                  title="Painel Admin"
                  aria-label="Acessar painel administrativo"
                >
                  <Settings className={isMobile ? "h-4 w-4" : "h-4 w-4"} />
                </button>
              )}

              {/* User Menu - Desktop */}
              {!isMobile && (
                <div className="flex items-center space-x-1 sm:space-x-2">
                  {currentUser ? (
                    <>
                      <button
                        onClick={onProfileClick}
                        className="flex items-center space-x-1 text-sm text-content-secondary hover:text-content-primary px-2 py-1.5 rounded-xl hover:bg-surface-raised/80 backdrop-blur-md transition-all shadow-sm hover:shadow-md"
                      >
                        <User className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span className="hidden sm:inline text-xs sm:text-sm">{currentUser.name}</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="p-2 rounded-lg text-content-secondary hover:bg-surface-raised transition-colors"
                        title="Sair"
                      >
                        <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        // Garantir que onLogin seja chamado mesmo se for undefined
                        if (onLogin) {
                          onLogin();
                        } else {
                          console.warn('onLogin não está disponível');
                        }
                      }}
                      className="flex items-center space-x-1 text-sm text-content-secondary hover:text-content-primary px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-surface-raised transition-colors"
                    >
                      <LogIn className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="hidden sm:inline">Entrar</span>
                    </button>
                  )}
                </div>
              )}

              {/* Cart */}
              {onCartClick && (
                <button
                  onClick={onCartClick}
                  className="relative p-2 rounded-xl text-content-secondary hover:bg-surface-raised/80 backdrop-blur-md transition-all shadow-sm hover:shadow-md"
                >
                  <ShoppingCart className="h-6 w-6" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-gradient-to-r from-green-500 to-green-600 text-white text-[10px] sm:text-xs rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center font-medium shadow-lg animate-pulse">
                      {cartItemCount}
                    </span>
                  )}
                </button>
              )}

              {/* Hamburger - à direita, ao lado do carrinho (mobile) */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl text-content-secondary hover:bg-surface-raised/80 backdrop-blur-md transition-all"
                aria-label="Abrir menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

        {/* Sidebar (menu hamburger) - Portal para altura total */}
        {sidebarOpen && typeof document !== 'undefined' && createPortal(
          <>
            <div
              className="fixed inset-0 min-h-screen min-w-full z-[100] modal-overlay"
              onClick={closeSidebar}
              aria-hidden="true"
              style={{ top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <aside
              className="fixed left-0 top-0 w-[85vw] max-w-sm min-h-screen h-screen bg-white dark:bg-gray-900 z-[101] shadow-2xl overflow-y-auto flex flex-col"
              role="dialog"
              aria-label="Menu de navegação"
              style={{ top: 0, left: 0, height: '100vh' }}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <Logo width={140} height={44} className="h-10 w-auto" isDarkMode={isDarkMode} />
                <button
                  onClick={closeSidebar}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Fechar menu"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                <Link
                  to="/loja"
                  onClick={closeSidebar}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    location.pathname === '/loja' || location.pathname === '/' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <ShoppingBag className="h-5 w-5" />
                  Loja
                </Link>

                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 space-y-1">
                  {onCartClick && (
                    <button
                      onClick={() => { onCartClick(); closeSidebar(); }}
                      className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <span className="flex items-center gap-3">
                        <ShoppingCart className="h-5 w-5" />
                        Carrinho
                      </span>
                      {cartItemCount > 0 && (
                        <span className="bg-green-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                          {cartItemCount}
                        </span>
                      )}
                    </button>
                  )}
                  {currentUser ? (
                    <>
                      <button
                        onClick={() => { onProfileClick?.(); closeSidebar(); }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <User className="h-5 w-5" />
                        Perfil
                      </button>
                      {currentUser.role !== UserRole.CLIENTE && !(currentUser.roles && currentUser.roles.length === 1 && currentUser.roles[0] === 'CLIENTE') && (
                        <button
                          onClick={() => { navigate('/admin'); closeSidebar(); }}
                          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Settings className="h-5 w-5" />
                          Painel Admin
                        </button>
                      )}
                      <button
                        onClick={() => { handleLogout(); closeSidebar(); }}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <LogOut className="h-5 w-5" />
                        Sair
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { onLogin?.(); closeSidebar(); }}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <LogIn className="h-5 w-5" />
                      Entrar
                    </button>
                  )}
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    {isDarkMode ? 'Modo claro' : 'Modo escuro'}
                  </button>
                </div>
              </nav>
            </aside>
          </>,
          document.body
        )}
      </header>
    );
  }

  // Header para modo Admin (simplificado)
  return (
    <header className="backdrop-blur-xl bg-surface-raised/90 dark:bg-surface-base/90 border-b border-border-default shadow-lg shadow-black/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link
            to="/admin"
            className="flex items-center cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
          >
            <Logo width={120} height={40} className="h-8 sm:h-10 w-auto" isDarkMode={isDarkMode} />
          </Link>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-content-secondary hover:bg-surface-raised transition-colors"
              title={isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
            >
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {currentUser && (
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-medium transition-all shadow-lg hover:shadow-xl shadow-green-500/30 cursor-pointer border-none"
              >
                Voltar ao Site
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// Memoizar o Header com comparação customizada para evitar re-renders desnecessários
export const Header = memo(HeaderComponent, (prevProps, nextProps) => {
  // Comparação customizada para evitar re-renders quando apenas valores internos mudam
  // IMPORTANTE: Incluir onCartClick e onLogin na comparação para garantir re-render quando forem definidos
  return (
    prevProps.currentUser?.id === nextProps.currentUser?.id &&
    prevProps.isDarkMode === nextProps.isDarkMode &&
    prevProps.cartItemCount === nextProps.cartItemCount &&
    prevProps.isShopMode === nextProps.isShopMode &&
    prevProps.onCartClick === nextProps.onCartClick &&
    prevProps.onLogin === nextProps.onLogin &&
    prevProps.onProfileClick === nextProps.onProfileClick
  );
});
