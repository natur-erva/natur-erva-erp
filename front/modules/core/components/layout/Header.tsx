import React, { useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogIn, LogOut, Moon, Sun, Settings, ShoppingCart, Menu, X, ShoppingBag, Search } from 'lucide-react';
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
  const isTablet = useMobile(1024);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  const shopContext = useShopContextSafe();
  const searchTerm = shopContext?.searchTerm || '';
  const setSearchTerm = shopContext?.setSearchTerm;

  const handleLogout = () => { onLogout?.(); };

  if (isShopMode) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl border-b border-gray-100/80 dark:border-gray-800/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[68px] gap-3">

            {/* Logo */}
            <Link to="/" className="flex-shrink-0 flex items-center hover:opacity-80 transition-opacity" aria-label="Início">
              <Logo
                width={isMobile ? 110 : isTablet ? 130 : 150}
                height={isMobile ? 38 : isTablet ? 44 : 48}
                className="w-auto"
                isDarkMode={isDarkMode}
              />
            </Link>

            {/* Search — desktop/tablet expandida, mobile ícone */}
            {!isMobile ? (
              <div className="flex-1 max-w-md mx-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar produtos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm?.(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                  />
                </div>
              </div>
            ) : searchOpen ? (
              <div className="flex-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm?.(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                  />
                </div>
                <button onClick={() => { setSearchOpen(false); setSearchTerm?.(''); }} className="p-2 text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">

              {/* Search icon — mobile only */}
              {isMobile && !searchOpen && (
                <button onClick={() => setSearchOpen(true)} className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <Search className="h-5 w-5" />
                </button>
              )}

              {/* Dark mode */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={isDarkMode ? 'Modo claro' : 'Modo escuro'}
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* Admin link */}
              {currentUser && currentUser.role !== UserRole.CLIENTE && !(currentUser.roles?.length === 1 && currentUser.roles[0] === 'CLIENTE') && (
                <button onClick={() => navigate('/admin')} className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Painel Admin">
                  <Settings className="h-4 w-4" />
                </button>
              )}

              {/* User — desktop only */}
              {!isMobile && (
                currentUser ? (
                  <div className="flex items-center gap-1">
                    <button onClick={onProfileClick} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium">
                      <User className="h-4 w-4" />
                      <span className="max-w-[100px] truncate">{currentUser.name}</span>
                    </button>
                    <button onClick={handleLogout} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Sair">
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => onLogin?.()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <LogIn className="h-4 w-4" />
                    Entrar
                  </button>
                )
              )}

              {/* Cart */}
              {onCartClick && !searchOpen && (
                <button onClick={onCartClick} className="relative p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-green-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-0.5 shadow-md shadow-green-500/40">
                      {cartItemCount > 9 ? '9+' : cartItemCount}
                    </span>
                  )}
                </button>
              )}

              {/* Hamburger — mobile/tablet */}
              {!searchOpen && (
                <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar mobile */}
        {sidebarOpen && typeof document !== 'undefined' && createPortal(
          <>
            <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={closeSidebar} />
            <aside className="fixed left-0 top-0 bottom-0 w-[80vw] max-w-[320px] z-[101] bg-white dark:bg-gray-950 shadow-2xl flex flex-col overflow-y-auto">
              {/* Header da sidebar */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <Logo width={120} height={40} className="w-auto" isDarkMode={isDarkMode} />
                <button onClick={closeSidebar} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Nav */}
              <nav className="flex-1 px-4 py-5 space-y-1">
                <Link to="/loja" onClick={closeSidebar} className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${location.pathname === '/loja' || location.pathname === '/' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60'}`}>
                  <ShoppingBag className="h-5 w-5" />
                  Loja
                </Link>

                <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
                  {onCartClick && (
                    <button onClick={() => { onCartClick(); closeSidebar(); }} className="flex items-center justify-between w-full px-4 py-3 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-all">
                      <span className="flex items-center gap-3"><ShoppingCart className="h-5 w-5" /> Carrinho</span>
                      {cartItemCount > 0 && <span className="bg-green-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">{cartItemCount}</span>}
                    </button>
                  )}

                  {currentUser ? (
                    <>
                      <button onClick={() => { onProfileClick?.(); closeSidebar(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-all">
                        <User className="h-5 w-5" />{currentUser.name}
                      </button>
                      {currentUser.role !== UserRole.CLIENTE && !(currentUser.roles?.length === 1 && currentUser.roles[0] === 'CLIENTE') && (
                        <button onClick={() => { navigate('/admin'); closeSidebar(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-all">
                          <Settings className="h-5 w-5" />Painel Admin
                        </button>
                      )}
                      <button onClick={() => { handleLogout(); closeSidebar(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all">
                        <LogOut className="h-5 w-5" />Sair
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { onLogin?.(); closeSidebar(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-all">
                      <LogIn className="h-5 w-5" />Entrar
                    </button>
                  )}

                  <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-all">
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

  // Admin header
  return (
    <header className="backdrop-blur-xl bg-white/90 dark:bg-gray-950/90 border-b border-gray-100 dark:border-gray-800 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <Link to="/admin" className="flex items-center hover:opacity-80 transition-opacity">
            <Logo width={140} height={46} className="w-auto" isDarkMode={isDarkMode} />
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {currentUser && (
              <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-sm font-medium shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30">
                Voltar ao Site
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export const Header = memo(HeaderComponent, (prevProps, nextProps) =>
  prevProps.currentUser?.id === nextProps.currentUser?.id &&
  prevProps.isDarkMode === nextProps.isDarkMode &&
  prevProps.cartItemCount === nextProps.cartItemCount &&
  prevProps.isShopMode === nextProps.isShopMode &&
  prevProps.onCartClick === nextProps.onCartClick &&
  prevProps.onLogin === nextProps.onLogin &&
  prevProps.onProfileClick === nextProps.onProfileClick
);
