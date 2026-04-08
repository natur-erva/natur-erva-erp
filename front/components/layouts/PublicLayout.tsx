import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from '../../modules/core/components/layout/Header';
import { Footer } from '../../modules/core/components/layout/Footer';
import { User } from '../../modules/core/types/types';
import { useMobile } from '../../modules/core/hooks/useMobile';
import { useShopContextSafe } from '../../contexts/ShopContext';

interface PublicLayoutProps {
  currentUser: User | null;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
}

// Componente interno que usa o contexto - memoizado
const PublicLayoutContent: React.FC<PublicLayoutProps> = ({
  currentUser,
  isDarkMode,
  toggleTheme,
  onLogout,
  onLogin
}) => {
  const location = useLocation();
  const isMobile = useMobile(768);
  const [headerHeight, setHeaderHeight] = useState(64);
  
  // Usar contexto do Shop (pode ser null se não estiver disponível)
  const shopContext = useShopContextSafe();

  useEffect(() => {
    // Altura do header (h-16 = 64px)
    setHeaderHeight(64);
  }, []);

  // Memoizar valores derivados do contexto para evitar recálculos
  // IMPORTANTE: Não memoizar os callbacks para garantir que mudanças sejam detectadas
  const effectiveDarkMode = useMemo(() => shopContext?.darkMode ?? isDarkMode, [shopContext?.darkMode, isDarkMode]);
  const effectiveToggleTheme = useMemo(() => shopContext?.toggleTheme ?? toggleTheme, [shopContext?.toggleTheme, toggleTheme]);
  const effectiveCartItemCount = useMemo(() => shopContext?.cartItemCount ?? 0, [shopContext?.cartItemCount]);
  
  // NÃO memoizar callbacks - garantir que mudanças sejam detectadas pelo Header
  const effectiveOnCartClick = shopContext?.onCartClick;
  const effectiveOnProfileClick = shopContext?.onProfileClick;
  const effectiveOnLoginClick = shopContext?.onLoginClick;
  
  // Forçar re-render quando callbacks mudarem usando um estado local
  const [callbacksReady, setCallbacksReady] = useState(false);
  
  useEffect(() => {
    // Quando os callbacks estiverem disponíveis, forçar re-render
    if (shopContext?.onCartClick && shopContext?.onLoginClick) {
      setCallbacksReady(true);
    }
  }, [shopContext?.onCartClick, shopContext?.onLoginClick]);
  
  // Criar fallback para onLogin se não estiver disponível no contexto ainda
  // Isso garante que o botão sempre tenha uma função válida, mesmo na primeira renderização
  const handleLoginFallback = useCallback(() => {
    // Tentar usar o callback do contexto primeiro (via ref para garantir disponibilidade)
    if (shopContext?.onLoginClick) {
      shopContext.onLoginClick();
    } else if (onLogin) {
      onLogin();
    } else {
      // Se não houver nenhum callback, pelo menos não quebrar
      console.warn('onLoginClick não está disponível no contexto e nenhum fallback foi fornecido');
    }
  }, [shopContext?.onLoginClick, onLogin]);
  
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-green-50/30 to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header
        currentUser={currentUser}
        isDarkMode={effectiveDarkMode}
        toggleTheme={effectiveToggleTheme}
        onLogout={onLogout}
        onLogin={effectiveOnLoginClick || handleLoginFallback}
        isShopMode={true}
        cartItemCount={effectiveCartItemCount}
        onCartClick={effectiveOnCartClick}
        onProfileClick={effectiveOnProfileClick}
      />
      <main className="flex-1" style={{ paddingTop: `${headerHeight}px` }}>
        <Outlet />
      </main>
      <Footer isShopMode={true} />
    </div>
  );
};

// NÃO memoizar o PublicLayout para garantir que re-renderize quando o contexto mudar
// Isso é necessário para que o Header receba os callbacks quando o Shop os definir
export const PublicLayout: React.FC<PublicLayoutProps> = (props) => {
  return <PublicLayoutContent {...props} />;
};
