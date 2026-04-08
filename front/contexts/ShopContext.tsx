import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode, useRef } from 'react';

interface ShopContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  cartItemCount: number;
  setCartItemCount: (count: number) => void;
  onCartClick?: () => void;
  setOnCartClick: (handler: () => void) => void;
  onProfileClick?: () => void;
  setOnProfileClick: (handler: () => void) => void;
  onLoginClick?: () => void;
  setOnLoginClick: (handler: () => void) => void;
  darkMode: boolean;
  setDarkMode: (mode: boolean) => void;
  toggleTheme?: () => void;
  setToggleTheme: (handler: () => void) => void;
  onFilterClick?: () => void;
  setOnFilterClick: (handler: () => void) => void;
  hasActiveFilters: boolean;
  setHasActiveFilters: (active: boolean) => void;
}

export const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cartItemCount, setCartItemCount] = useState(0);
  const [onCartClick, setOnCartClick] = useState<(() => void) | undefined>(undefined);
  const [onProfileClick, setOnProfileClick] = useState<(() => void) | undefined>(undefined);
  const [onLoginClick, setOnLoginClick] = useState<(() => void) | undefined>(undefined);
  const [darkMode, setDarkMode] = useState(false);
  const [toggleTheme, setToggleTheme] = useState<(() => void) | undefined>(undefined);
  const [onFilterClick, setOnFilterClick] = useState<(() => void) | undefined>(undefined);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  // Usar refs para callbacks para evitar re-renders
  const onCartClickRef = useRef(onCartClick);
  const onProfileClickRef = useRef(onProfileClick);
  const onLoginClickRef = useRef(onLoginClick);
  const toggleThemeRef = useRef(toggleTheme);
  const onFilterClickRef = useRef(onFilterClick);

  // Atualizar refs quando mudarem (sem useEffect para evitar loops)
  onCartClickRef.current = onCartClick;
  onProfileClickRef.current = onProfileClick;
  onLoginClickRef.current = onLoginClick;
  toggleThemeRef.current = toggleTheme;
  onFilterClickRef.current = onFilterClick;

  // Memoizar setters para evitar recriação - usar refs para evitar loops
  // IMPORTANTE: Atualizar tanto o ref quanto o state para garantir disponibilidade imediata
  const stableSetOnCartClick = useCallback((handler: () => void) => {
    onCartClickRef.current = handler;
    // Usar função inline para garantir que o handler seja capturado corretamente
    setOnCartClick(() => handler);
  }, []);

  const stableSetOnProfileClick = useCallback((handler: () => void) => {
    onProfileClickRef.current = handler;
    setOnProfileClick(() => handler);
  }, []);

  const stableSetOnLoginClick = useCallback((handler: () => void) => {
    onLoginClickRef.current = handler;
    // Atualizar state imediatamente para garantir que o contexto seja atualizado
    // Usar função inline para garantir que o handler seja capturado corretamente
    setOnLoginClick(() => handler);
  }, []);

  const stableSetToggleTheme = useCallback((handler: () => void) => {
    toggleThemeRef.current = handler;
    setToggleTheme(() => handler);
  }, []);

  const stableSetOnFilterClick = useCallback((handler: () => void) => {
    onFilterClickRef.current = handler;
    setOnFilterClick(() => handler);
  }, []);

  // Memoizar o valor do contexto
  // IMPORTANTE: Incluir onLoginClick nas dependências para garantir que mudanças sejam refletidas
  const contextValue = useMemo(() => ({
    searchTerm,
    setSearchTerm,
    cartItemCount,
    setCartItemCount,
    onCartClick,
    setOnCartClick: stableSetOnCartClick,
    onProfileClick,
    setOnProfileClick: stableSetOnProfileClick,
    onLoginClick,
    setOnLoginClick: stableSetOnLoginClick,
    darkMode,
    setDarkMode,
    toggleTheme,
    setToggleTheme: stableSetToggleTheme,
    onFilterClick,
    setOnFilterClick: stableSetOnFilterClick,
    hasActiveFilters,
    setHasActiveFilters
  }), [searchTerm, cartItemCount, onCartClick, onProfileClick, onLoginClick, darkMode, toggleTheme, onFilterClick, hasActiveFilters, stableSetOnCartClick, stableSetOnProfileClick, stableSetOnLoginClick, stableSetToggleTheme, stableSetOnFilterClick]);

  return (
    <ShopContext.Provider value={contextValue}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShopContext = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShopContext must be used within ShopProvider');
  }
  return context;
};

// Hook que retorna null se o contexto não estiver disponível (não lança erro)
export const useShopContextSafe = () => {
  const context = useContext(ShopContext);
  return context || null;
};
