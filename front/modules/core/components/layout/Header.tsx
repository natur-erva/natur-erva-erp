import React, { useState, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, LogIn, LogOut, Settings, ShoppingCart, Menu, X, ShoppingBag, Home, Info, Shield, Phone, BookOpen, Upload } from 'lucide-react';
import { UserRole } from '../../../core/types/types';
import { Logo } from '../ui/Logo';
import { useMobile } from '../../../core/hooks/useMobile';
import { User as UserType } from '../../../core/types/types';
import { uploadService } from '../../../../services/uploadService';
import api from '../../services/apiClient';
import { invalidateLogoCache } from '../../services/systemSettingsService';

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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const closeSidebar = () => setSidebarOpen(false);

  const LOGO_ROLES = ['SUPER_ADMIN', 'ADMIN'];
  const canChangeLogo = currentUser && (
    (currentUser.roles?.some(r => LOGO_ROLES.includes(r.toUpperCase())) ?? false)
    || LOGO_ROLES.includes((currentUser.role ?? '').toUpperCase())
  );

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const result = await uploadService.uploadImage(file, 'logo', 1600);
      if (result?.url) {
        await api.put('/tax/config', { logoUrl: result.url });
        invalidateLogoCache();
        window.dispatchEvent(new Event('logo:updated'));
      }
    } catch { /* silent */ } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleLogout = () => { onLogout?.(); };

  const navLinks = [
    { to: '/',          label: 'Início',         icon: <Home className="h-4 w-4" /> },
    { to: '/sobre',     label: 'Sobre nós',      icon: <Info className="h-4 w-4" /> },
    { to: '/blog',      label: 'Blog',           icon: <BookOpen className="h-4 w-4" /> },
    { to: '/politica',  label: 'Nossa Política', icon: <Shield className="h-4 w-4" /> },
    { to: '/contactos', label: 'Fale Connosco',  icon: <Phone className="h-4 w-4" /> },
  ];

  const isActive = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  if (isShopMode) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl border-b border-gray-100/80 dark:border-gray-800/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[68px] gap-4">

            {/* Logo */}
            <div className="relative group flex-shrink-0">
              <Link to="/" className="flex items-center hover:opacity-80 transition-opacity" aria-label="Início">
                <Logo
                  width={isMobile ? 100 : isTablet ? 120 : 140}
                  height={isMobile ? 34 : isTablet ? 40 : 44}
                  className="w-auto"
                  isDarkMode={isDarkMode}
                />
              </Link>
              {canChangeLogo && (
                <>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    title="Trocar logotipo"
                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploadingLogo
                      ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Upload className="w-5 h-5 text-white drop-shadow" />}
                  </button>
                </>
              )}
            </div>

            {/* Nav links — desktop */}
            {!isMobile && (
              <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
                {navLinks.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(link.to)
                        ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">

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
              {onCartClick && (
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
              <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar mobile */}
        {sidebarOpen && typeof document !== 'undefined' && createPortal(
          <>
            <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" onClick={closeSidebar} />
            <aside className="fixed left-0 top-0 bottom-0 w-[80vw] max-w-[320px] z-[101] bg-white dark:bg-gray-950 shadow-2xl flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <Logo width={120} height={40} className="w-auto" isDarkMode={isDarkMode} />
                <button onClick={closeSidebar} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 px-4 py-5 space-y-1">
                {navLinks.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={closeSidebar}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                      isActive(link.to)
                        ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                    }`}
                  >
                    {link.icon}{link.label}
                  </Link>
                ))}

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
