import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

const TABS = [
  { id: 'resumos',  label: 'Resumos',  path: '/admin/vendas' },
  { id: 'pedidos',  label: 'Pedidos',  path: '/admin/vendas/pedidos' },
  { id: 'cotacoes', label: 'Cotações', path: '/admin/cotacoes' },
  { id: 'clientes', label: 'Clientes', path: '/admin/vendas/clientes' },
] as const;

function getActiveTab(pathname: string): string {
  if (pathname.startsWith('/admin/vendas/pedidos')) return 'pedidos';
  if (pathname.startsWith('/admin/vendas/clientes')) return 'clientes';
  if (pathname.startsWith('/admin/cotacoes')) return 'cotacoes';
  if (pathname.startsWith('/admin/vendas')) return 'resumos';
  return 'resumos';
}

export const VendasNav: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = getActiveTab(pathname);

  return (
    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 mb-6">
      {/* Tabs */}
      <div className="flex items-center">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              active === tab.id
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400 rounded-t-sm" />
            )}
          </button>
        ))}
      </div>

      {/* Acção principal — integrada na barra */}
      <button
        onClick={() => navigate('/admin/pos')}
        className="mb-1.5 flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md transition-colors"
      >
        <ShoppingCart className="w-3.5 h-3.5" />
        Vender
      </button>
    </div>
  );
};
