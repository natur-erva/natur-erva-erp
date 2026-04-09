
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import { dataService } from './modules/core/services/dataService';
import { applyTheme } from './modules/core/utils/theme';
import { type User, Order, OrderStatus, Product, Customer, Sale, Purchase, PurchaseRequest, Supplier, UserRole, ProductVariant } from './modules/core/types/types';

// Core Imports
import { Layout } from './modules/core/components/layout/Layout';
import { PageShell } from './modules/core/components/layout/PageShell';
import { Toast } from './modules/core/components/ui/Toast';
import { LanguageProvider } from './modules/core/contexts/LanguageContext';
import { Logo } from './modules/core/components/ui/Logo';
import { DashboardPreferencesProvider } from './modules/core/hooks/useDashboardPreferences';
import { LocationProvider } from './modules/core/contexts/LocationContext';
import { useVersionCheck } from './modules/core/hooks/useVersionCheck';
import { UpdateBanner } from './modules/core/components/ui/UpdateBanner';

// Pages - lazy loaded para reduzir bundle inicial (evitar 504)
const Dashboard = lazy(() => import('./modules/core/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Orders = lazy(() => import('./modules/sales/pages/Orders').then(m => ({ default: m.Orders })));
const Sales = lazy(() => import('./modules/sales/pages/Sales').then(m => ({ default: m.Sales })));
const Users = lazy(() => import('./modules/admin/pages/Users').then(m => ({ default: m.Users })));
const Roles = lazy(() => import('./modules/admin/pages/Roles').then(m => ({ default: m.Roles })));
const UserProfile = lazy(() => import('./modules/core/pages/UserProfile').then(m => ({ default: m.UserProfile })));
import { ProtectedRoute } from './modules/auth/components/ProtectedRoute';
import { TrackedPage } from './modules/auth/components/TrackedPage';
const Media = lazy(() => import('./modules/media/pages/Media').then(m => ({ default: m.Media })));
const Tracking = lazy(() => import('./modules/admin/pages/Tracking').then(m => ({ default: m.Tracking })));
const Customers = lazy(() => import('./modules/customers/pages/Customers').then(m => ({ default: m.Customers })));
const CustomerProfile = lazy(() => import('./modules/customers/pages/CustomerProfile').then(m => ({ default: m.CustomerProfile })));
const Purchases = lazy(() => import('./modules/products/components/ui/Purchases').then(m => ({ default: m.Purchases })));
const Products = lazy(() => import('./modules/products/pages/Products').then(m => ({ default: m.Products })));
const StockManagement = lazy(() => import('./modules/products/pages/StockManagement').then(m => ({ default: m.StockManagement })));
const StockAuditPage = lazy(() => import('./modules/products/pages/StockAudit').then(m => ({ default: m.StockAuditPage })));
const StockAdjustmentsPage = lazy(() => import('./modules/products/pages/StockAdjustmentsPage').then(m => ({ default: m.StockAdjustmentsPage })));
const StockLotsPage = lazy(() => import('./modules/products/pages/StockLotsPage').then(m => ({ default: m.StockLotsPage })));
const StockAlerts = lazy(() => import('./modules/products/pages/StockAlerts').then(m => ({ default: m.StockAlerts })));
const AuditReportPage = lazy(() => import('./modules/products/pages/AuditReportPage').then(m => ({ default: m.AuditReportPage })));
const ShopReceipts = lazy(() => import('./modules/sales/pages/ShopReceipts').then(m => ({ default: m.ShopReceipts })));
const Shop = lazy(() => import('./modules/shop/pages/Shop').then(m => ({ default: m.Shop })));
const ProductLandingPage = lazy(() => import('./modules/shop/pages/ProductLandingPage').then(m => ({ default: m.ProductLandingPage })));
const UserManagement = lazy(() => import('./modules/admin/pages/UserManagement').then(m => ({ default: m.UserManagement })));

// Services & Utils
import { Lock, User as UserIcon, Loader2, Info, Eye, EyeOff } from 'lucide-react';
import { getSystemSettings, updateFavicon, updatePageTitle } from './modules/core/services/systemSettingsService';
import { ForgotPasswordModal } from './modules/core/components/modals/ForgotPasswordModal';
import { SignUpModal } from './modules/core/components/modals/SignUpModal';
import { LoginModal } from './modules/core/components/modals/LoginModal';
import { authService } from './modules/auth/services/authService';

// Base path para deploy na raiz
const BASE_PATH = '/';

const PageLoadingFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
  </div>
);

/** Wrapper que mostra popup de login em páginas acessíveis (ex: Sobre) */
const AboutUsWithLoginPrompt: React.FC<{
  currentUser: User | null;
  onLogin: (user: User) => void;
  children: React.ReactNode;
}> = ({ currentUser, onLogin, children }) => {
  const [showLogin, setShowLogin] = useState(!currentUser);

  useEffect(() => {
    if (currentUser) setShowLogin(false);
  }, [currentUser]);

  const handleLogin = useCallback(async (identifier: string, password: string) => {
    const { user, error } = await authService.signIn(identifier, password);
    if (user) {
      setShowLogin(false);
      onLogin(user);
    } else {
      throw new Error(error || 'Erro ao iniciar sessão');
    }
  }, [onLogin]);

  return (
    <>
      {children}
      {showLogin && !currentUser && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => setShowLogin(false)}
          onUserLogin={(user) => {
            setShowLogin(false);
            onLogin(user);
          }}
          message={null}
        />
      )}
    </>
  );
};

// Rate limiting constants removed (moved to Login.tsx)
// Helper functions removed (moved to Login.tsx)

// Auth / Layout - lazy
const Login = lazy(() => import('./modules/auth/pages/Login').then(m => ({ default: m.Login })));
import { CompatibilityRedirect } from './components/CompatibilityRedirect';
const PublicLayout = lazy(() => import('./components/layouts/PublicLayout').then(m => ({ default: m.PublicLayout })));
const AdminLayout = lazy(() => import('./components/layouts/AdminLayout').then(m => ({ default: m.AdminLayout })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { ShopProvider } from './contexts/ShopContext';
import { getAdminPath } from './modules/core/routes/adminRoutes';
import { useAppAuth } from './modules/auth/hooks/useAppAuth';
import { ForceStrongPasswordModal } from './modules/auth/components/ForceStrongPasswordModal';
import { useToast } from './modules/core/contexts/ToastContext';
import { useAppDataHandlers } from './modules/core/hooks/useAppDataHandlers';
import { useOperationProgress } from './modules/core/hooks/useOperationProgress';
import { OperationOverlay } from './modules/core/components/ui/OperationOverlay';

const App = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const operationProgress = useOperationProgress();
  const {
    currentUser,
    setCurrentUser,
    isAuthLoading,
    isShopMode,
    activePage,
    handleLogin,
    handleLogout,
    setActivePage,
    setIsShopMode
  } = useAppAuth();
  const [darkMode, setDarkMode] = useState(true); // Default to Dark Mode

  // Version Check
  const { hasUpdate, updateApp } = useVersionCheck();

  // App State
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<{ customers: number; orders: number; products: number; sales: number; purchases: number; suppliers: number } | null>(null);

  // Initialize Dark Mode
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme === 'dark' || (!savedTheme && true); // Default to true if not set
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Load system settings on mount - executar o mais cedo possé­vel
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const settings = await getSystemSettings();
        if (settings.favicon && settings.favicon !== '/favicon.ico') {
          // Sé³ atualizar se néo for o favicon padréo (que causa 404)
          updateFavicon(settings.favicon);
        }
        if (settings.system_name) {
          updatePageTitle(settings.system_name);
        }
        if (settings.primary_color) {
          applyTheme(settings.primary_color);
        }
      } catch (error) {
        console.warn('Erro ao carregar configurações do sistema:', error);
      }
    };
    // Executar imediatamente, sem delay
    loadSystemSettings();
  }, []);

  // Redirecionar pé¡ginas administrativas para Settings (apenas quando néo estamos em settings)


  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };


  // Declarar loadData antes de ser usado nos useEffects
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, o, s, pur, pr, sup, countsData] = await Promise.all([
        dataService.getProducts(),
        dataService.getCustomers(),
        dataService.getOrders(),
        dataService.getSales(),
        dataService.getPurchases(),
        dataService.getPurchaseRequests(),
        dataService.getSuppliers(),
        dataService.getDashboardCounts()
      ]);
      setProducts(p);
      setCustomers(c);
      setOrders(o);
      setSales(s);
      setPurchases(pur);
      setPurchaseRequests(pr);
      setSuppliers(sup);
      setCounts(countsData);
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, loadData]);

  // AppDataLoader: recarregamento por mudança de local desativado (sistema de uma única loja).
  const AppDataLoader: React.FC<{ onLoadData: () => void }> = () => null;

  const handlers = useAppDataHandlers({
    orders,
    setOrders,
    customers,
    setCustomers,
    products,
    setProducts,
    sales,
    setSales,
    purchases,
    setPurchases,
    purchaseRequests,
    setPurchaseRequests,
    suppliers,
    setSuppliers,
    loadData,
    showToast,
    operationProgress
  });

  const handleAddOrder = handlers.handleAddOrder;
  const handleUpdateOrderStatus = handlers.handleUpdateOrderStatus;
  const handleDeleteOrder = handlers.handleDeleteOrder;
  const handleBulkDeleteOrders = handlers.handleBulkDeleteOrders;
  const handleEditOrder = handlers.handleEditOrder;
  const handleDeleteCustomer = handlers.handleDeleteCustomer;
  const handleBulkDeleteCustomers = handlers.handleBulkDeleteCustomers;
  const handleUpdateCustomer = handlers.handleUpdateCustomer;
  const handleAddSale = handlers.handleAddSale;
  const handleUpdateSale = handlers.handleUpdateSale;
  const handleDeleteSale = handlers.handleDeleteSale;
  const handleBulkDeleteSales = handlers.handleBulkDeleteSales;
  const handleAddPurchase = handlers.handleAddPurchase;
  const handleUpdatePurchase = handlers.handleUpdatePurchase;
  const handleDeletePurchase = handlers.handleDeletePurchase;
  const handleAddPurchaseRequest = handlers.handleAddPurchaseRequest;
  const handleUpdatePurchaseRequest = handlers.handleUpdatePurchaseRequest;
  const handleDeletePurchaseRequest = handlers.handleDeletePurchaseRequest;
  const handleAddSupplier = handlers.handleAddSupplier;
  const handleUpdateSupplier = handlers.handleUpdateSupplier;
  const handleDeleteSupplier = handlers.handleDeleteSupplier;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  // Componente de rotas públicas
  const PublicRoutes = () => {
    return (
      <ShopProvider>
        <Routes>
          <Route element={
            <PublicLayout
              currentUser={currentUser}
              isDarkMode={darkMode}
              toggleTheme={toggleTheme}
              onLogout={handleLogout}
              onLogin={() => {
                // Login será tratado pelo Shop
              }}
            />
          }>
            <Route path="loja" element={
              <LocationProvider>
                <Shop currentUser={currentUser} onLogin={handleLogin} onLogout={handleLogout} requireAuth />
              </LocationProvider>
            } />
            <Route path="loja/produto/:slug" element={
              <LocationProvider>
                <ProductLandingPage />
              </LocationProvider>
            } />
            {/* Home: redireciona para loja ou mostra loja diretamente */}
            <Route index element={
              <LocationProvider>
                <Shop currentUser={currentUser} onLogin={handleLogin} onLogout={handleLogout} requireAuth={false} />
              </LocationProvider>
            } />
          </Route>
        </Routes>
      </ShopProvider>
    );
  };

  return (
    <LocationProvider>
      <DashboardPreferencesProvider>
        {hasUpdate && <UpdateBanner onUpdate={updateApp} />}
        {/* Overlay de operações críticas */}
        <OperationOverlay
          isVisible={operationProgress.operationState.isInProgress}
          title={operationProgress.operationState.title}
          message={operationProgress.operationState.message}
          progress={operationProgress.operationState.progress || undefined}
        />
        {!isAuthLoading && currentUser && currentUser.requiresStrongPassword === true && (
          <ForceStrongPasswordModal
            isOpen
            userId={currentUser.id}
            onSuccess={() => setCurrentUser(prev => prev ? { ...prev, requiresStrongPassword: false } : null)}
            onLogout={handleLogout}
          />
        )}
        <AppDataLoader onLoadData={loadData} />
        <CompatibilityRedirect />
        <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          {currentUser ? (
            <Route path="/admin/*" element={
              <LanguageProvider>
                <ErrorBoundary
                  areaName="Área Admin"
                  onBack={() => navigate('/admin')}
                  backLabel="Voltar ao painel"
                >
                  <AdminLayout
                    currentUser={currentUser}
                    isDarkMode={darkMode}
                    toggleTheme={toggleTheme}
                    onLogout={handleLogout}
                  />
                </ErrorBoundary>
              </LanguageProvider>
            }>
              <Route index element={
                <ProtectedRoute user={currentUser} permission="dashboard.view">
                  <TrackedPage pagePath="/admin" pageTitle="Dashboard">
                    <Dashboard
                      orders={orders}
                      customers={customers}
                      sales={sales}
                      products={products}
                      purchases={purchases}
                      purchaseRequests={purchaseRequests}
                      counts={counts}
                      onNavigate={(page) => {
                        const route = getAdminPath(page);
                        navigate(route);
                      }}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="vendas" element={
                <ProtectedRoute user={currentUser} permission="sales.view">
                  <TrackedPage pagePath="/admin/vendas" pageTitle="Vendas">
                    <Sales
                      sales={sales}
                      products={products}
                      orders={orders}
                      totalSalesCount={counts?.sales}
                      onAddSale={handleAddSale}
                      onUpdateSale={handleUpdateSale}
                      onDeleteSale={handleDeleteSale}
                      onDeleteSales={handleBulkDeleteSales}
                      onImportComplete={() => {
                        loadData();
                      }}
                      showToast={showToast}
                      defaultTab="summaries"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="vendas/por-produto" element={
                <ProtectedRoute user={currentUser} permission="sales.view">
                  <TrackedPage pagePath="/admin/vendas/por-produto" pageTitle="Vendas por Produto">
                    <Sales
                      sales={sales}
                      products={products}
                      orders={orders}
                      totalSalesCount={counts?.sales}
                      onAddSale={handleAddSale}
                      onUpdateSale={handleUpdateSale}
                      onDeleteSale={handleDeleteSale}
                      onDeleteSales={handleBulkDeleteSales}
                      onImportComplete={() => {
                        loadData();
                      }}
                      showToast={showToast}
                      defaultTab="byProduct"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              {/* Pedidos - agora dentro de Vendas */}
              <Route path="vendas/pedidos" element={
                <ProtectedRoute user={currentUser} permission="orders.view">
                  <TrackedPage pagePath="/admin/vendas/pedidos" pageTitle="Pedidos">
                    <Orders
                      orders={orders}
                      products={products}
                      customers={customers}
                      currentUser={currentUser}
                      totalOrdersCount={counts?.orders}
                      onAddOrder={handleAddOrder}
                      onUpdateStatus={handleUpdateOrderStatus}
                      onDeleteOrder={handleDeleteOrder}
                      onDeleteOrders={handleBulkDeleteOrders}
                      onEditOrder={handleEditOrder}
                      onImportComplete={() => {
                        loadData();
                      }}
                      showToast={showToast}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              {/* Clientes - agora dentro de Vendas */}
              <Route path="vendas/clientes" element={
                <ProtectedRoute user={currentUser} permission="customers.view">
                  <TrackedPage pagePath="/admin/vendas/clientes" pageTitle="Clientes">
                    <Customers
                      customers={customers}
                      orders={orders}
                      totalCustomersCount={counts?.customers}
                      onDeleteCustomer={handleDeleteCustomer}
                      onDeleteCustomers={handleBulkDeleteCustomers}
                      onUpdateCustomer={handleUpdateCustomer}
                      showToast={showToast}
                      onReloadData={loadData}
                      currentUser={currentUser}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              {/* Rotas antigas mantidas para compatibilidade - redirecionam para novas */}
              <Route path="pedidos" element={<Navigate to="/admin/vendas/pedidos" replace />} />
              <Route path="clientes" element={<Navigate to="/admin/vendas/clientes" replace />} />
              <Route path="produtos" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/produtos" pageTitle="Produtos">
                    <Products showToast={showToast} onReloadData={loadData} totalProductsCount={counts?.products} />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="produtos/categorias" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/produtos/categorias" pageTitle="Categorias de Produtos">
                    <Products showToast={showToast} onReloadData={loadData} totalProductsCount={counts?.products} showManagementTab="categories" />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="produtos/unidades" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/produtos/unidades" pageTitle="Unidades de Produtos">
                    <Products showToast={showToast} onReloadData={loadData} totalProductsCount={counts?.products} showManagementTab="units" />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="compras" element={
                <ProtectedRoute user={currentUser} permission="purchases.view">
                  <TrackedPage pagePath="/admin/compras" pageTitle="Compras">
                    <Purchases
                      purchases={purchases}
                      purchaseRequests={purchaseRequests}
                      suppliers={suppliers}
                      products={products}
                      totalPurchasesCount={counts?.purchases}
                      onAddPurchase={handleAddPurchase}
                      onUpdatePurchase={handleUpdatePurchase}
                      onDeletePurchase={handleDeletePurchase}
                      onAddPurchaseRequest={handleAddPurchaseRequest}
                      onUpdatePurchaseRequest={handleUpdatePurchaseRequest}
                      onDeletePurchaseRequest={handleDeletePurchaseRequest}
                      onAddSupplier={handleAddSupplier}
                      onUpdateSupplier={handleUpdateSupplier}
                      onDeleteSupplier={handleDeleteSupplier}
                      showToast={showToast}
                      defaultTab="purchases"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="compras/por-produto" element={
                <ProtectedRoute user={currentUser} permission="purchases.view">
                  <TrackedPage pagePath="/admin/compras/por-produto" pageTitle="Compras por Produto">
                    <Purchases
                      purchases={purchases}
                      purchaseRequests={purchaseRequests}
                      suppliers={suppliers}
                      products={products}
                      totalPurchasesCount={counts?.purchases}
                      onAddPurchase={handleAddPurchase}
                      onUpdatePurchase={handleUpdatePurchase}
                      onDeletePurchase={handleDeletePurchase}
                      onAddPurchaseRequest={handleAddPurchaseRequest}
                      onUpdatePurchaseRequest={handleUpdatePurchaseRequest}
                      onDeletePurchaseRequest={handleDeletePurchaseRequest}
                      onAddSupplier={handleAddSupplier}
                      onUpdateSupplier={handleUpdateSupplier}
                      onDeleteSupplier={handleDeleteSupplier}
                      showToast={showToast}
                      defaultTab="byProduct"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="compras/fornecedores" element={
                <ProtectedRoute user={currentUser} permission="purchases.view">
                  <TrackedPage pagePath="/admin/compras/fornecedores" pageTitle="Fornecedores">
                    <Purchases
                      purchases={purchases}
                      purchaseRequests={purchaseRequests}
                      suppliers={suppliers}
                      products={products}
                      totalPurchasesCount={counts?.purchases}
                      onAddPurchase={handleAddPurchase}
                      onUpdatePurchase={handleUpdatePurchase}
                      onDeletePurchase={handleDeletePurchase}
                      onAddPurchaseRequest={handleAddPurchaseRequest}
                      onUpdatePurchaseRequest={handleUpdatePurchaseRequest}
                      onDeletePurchaseRequest={handleDeletePurchaseRequest}
                      onAddSupplier={handleAddSupplier}
                      onUpdateSupplier={handleUpdateSupplier}
                      onDeleteSupplier={handleDeleteSupplier}
                      showToast={showToast}
                      defaultTab="suppliers"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock" pageTitle="Gestão de Stock">
                    <StockManagement
                      products={products}
                      orders={orders}
                      purchases={purchases}
                      sales={sales}
                      showToast={showToast}
                      defaultTab="products"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock/alertas" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock/alertas" pageTitle="Alertas de Stock">
                    <StockAlerts
                      products={products}
                      orders={orders}
                      showToast={showToast}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock/movimentos" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock/movimentos" pageTitle="Movimentos de Stock">
                    <StockManagement
                      products={products}
                      orders={orders}
                      purchases={purchases}
                      sales={sales}
                      showToast={showToast}
                      defaultTab="movements"
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock/auditoria" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock/auditoria" pageTitle="Auditoria de Stock">
                    <StockAuditPage
                      products={products}
                      showToast={showToast}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock/ajustes" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock/ajustes" pageTitle="Ajustes de Stock">
                    <StockAdjustmentsPage
                      products={products}
                      showToast={showToast}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock/lotes" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock/lotes" pageTitle="Lotes de Stock">
                    <StockLotsPage
                      products={products}
                      showToast={showToast}
                    />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="stock/auditoria/relatorio/:id" element={
                <ProtectedRoute user={currentUser} permission="products.view">
                  <TrackedPage pagePath="/admin/stock/auditoria/relatorio" pageTitle="Relatório de Auditoria">
                    <AuditReportPage />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="galeria" element={
                <ProtectedRoute user={currentUser} permission="media.view">
                  <TrackedPage pagePath="/admin/galeria" pageTitle="Galeria">
                    <Media showToast={showToast} />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="estatisticas" element={
                <ProtectedRoute user={currentUser} permission="users.view">
                  <TrackedPage pagePath="/admin/estatisticas" pageTitle="Estatísticas">
                    <Tracking currentUser={currentUser} showToast={showToast} />
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="usuarios" element={
                <ProtectedRoute user={currentUser} permission="users.view">
                  <UserManagement currentUser={currentUser} showToast={showToast} />
                </ProtectedRoute>
              } />
              <Route path="usuarios/staff" element={<Navigate to="/admin/usuarios" replace />} />
              <Route path="usuarios/clientes" element={<Navigate to="/admin/usuarios" replace />} />
              <Route path="usuarios/roles" element={
                <ProtectedRoute user={currentUser} permission="users.manage_roles">
                  <TrackedPage pagePath="/admin/usuarios/roles" pageTitle="Gerir Roles">
                    <PageShell title="Gerir Roles">
                      <Roles currentUser={currentUser} showToast={showToast} />
                    </PageShell>
                  </TrackedPage>
                </ProtectedRoute>
              } />
              <Route path="perfis" element={
                <UserProfile
                  currentUser={currentUser!}
                  onBack={() => navigate('/admin')}
                  onUpdate={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    showToast('Perfil atualizado com sucesso!', 'success');
                  }}
                  onLogout={handleLogout}
                  toggleTheme={toggleTheme}
                  isDarkMode={darkMode}
                />
              } />
            </Route>
          ) : (
            <Route path="/admin/*" element={<Navigate to="/" replace />} />
          )}
          <Route path="/*" element={
            <ErrorBoundary
              areaName="Página pública"
              onBack={() => navigate('/')}
              backLabel="Ir para início"
            >
              <PublicRoutes />
            </ErrorBoundary>
          } />
        </Routes>
        </Suspense>
      </DashboardPreferencesProvider>
    </LocationProvider>
  );
};

export default App;
