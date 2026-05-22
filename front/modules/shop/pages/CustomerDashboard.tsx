import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, RefreshCw, ChevronRight, Loader2, User, Gift, TrendingUp, Star, Copy, Check } from 'lucide-react';
import api from '../../core/services/apiClient';
import { Order } from '../../core/types/order';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', processing: 'Em Processamento',
  out_for_delivery: 'A Caminho', delivered: 'Entregue',
  completed: 'Concluído', cancelled: 'Cancelado',
};

interface AffiliateSnippet {
  referral_code: string;
  available_balance: number;
  total_earned: number;
  total_referrals: number;
}

const MEDALS = [
  { label: 'Semente',       emoji: '🌱', min: 0,    max: 99,       gradient: 'from-amber-400 to-yellow-500',   textColor: 'text-amber-700',   bg: 'bg-amber-50 dark:bg-amber-900/20'  },
  { label: 'Raiz',          emoji: '🌿', min: 100,  max: 299,      gradient: 'from-green-400 to-green-500',    textColor: 'text-green-700',   bg: 'bg-green-50 dark:bg-green-900/20'  },
  { label: 'Broto',         emoji: '🌾', min: 300,  max: 699,      gradient: 'from-emerald-400 to-teal-500',   textColor: 'text-teal-700',    bg: 'bg-teal-50 dark:bg-teal-900/20'    },
  { label: 'Flor',          emoji: '🌸', min: 700,  max: 1499,     gradient: 'from-pink-400 to-rose-500',      textColor: 'text-pink-700',    bg: 'bg-pink-50 dark:bg-pink-900/20'    },
  { label: 'Planta Mestre', emoji: '🌳', min: 1500, max: Infinity, gradient: 'from-green-600 to-emerald-700',  textColor: 'text-green-800',   bg: 'bg-green-50 dark:bg-green-900/30'  },
];

const getMedal = (pts: number) => MEDALS.find(m => pts >= m.min && pts <= m.max) || MEDALS[0];
const getNextMedal = (pts: number) => {
  const idx = MEDALS.findIndex(m => pts >= m.min && pts <= m.max);
  return idx < MEDALS.length - 1 ? MEDALS[idx + 1] : null;
};

function PointsCard({ points }: { points: number }) {
  const medal = getMedal(points);
  const next = getNextMedal(points);
  const progress = next ? Math.round(((points - medal.min) / (next.min - medal.min)) * 100) : 100;

  return (
    <div className={`rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 ${medal.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          <span className="font-semibold text-gray-900 dark:text-white text-sm">Nível de Fidelidade</span>
        </div>
        <span className="text-2xl">{medal.emoji}</span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className={`text-3xl font-bold bg-gradient-to-r ${medal.gradient} bg-clip-text text-transparent`}>
          {points}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">pontos</span>
      </div>

      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3 ${medal.bg} ${medal.textColor} border border-current/20`}>
        {medal.emoji} {medal.label}
      </div>

      {next ? (
        <div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{points} pts</span>
            <span>{next.emoji} {next.label} em {next.min - points} pts</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full bg-gradient-to-r ${medal.gradient} transition-all duration-500`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            1 ponto por cada 10 MT gasto
          </p>
        </div>
      ) : (
        <p className="text-xs font-medium text-green-700 dark:text-green-400">
          🎉 Nível máximo atingido!
        </p>
      )}

      {/* Todas as medalhas */}
      <div className="flex gap-1.5 mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700/60">
        {MEDALS.map(m => (
          <div
            key={m.label}
            title={`${m.emoji} ${m.label} — ${m.min} pts`}
            className={`flex-1 text-center py-1.5 rounded-lg text-xs transition-all ${
              points >= m.min ? `bg-gradient-to-b ${m.gradient} text-white shadow-sm` : 'bg-gray-100 dark:bg-gray-800 text-gray-400 opacity-50'
            }`}
          >
            <div>{m.emoji}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CustomerDashboard: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [affiliate, setAffiliate] = useState<AffiliateSnippet | null | false>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Order[]>('/orders/my-orders')
      .then(data => setOrders(data.slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get<AffiliateSnippet>('/affiliates/me')
      .then(data => setAffiliate(data))
      .catch(() => setAffiliate(false));
  }, []);

  const totalSpent = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const points = currentUser?.points || 0;

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Cabeçalho */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <User className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Olá, {currentUser?.name || 'Cliente'}!</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{currentUser?.email}</p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 text-center">
            <ShoppingBag className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? '—' : orders.length}+</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Encomendas</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 text-center">
            <RefreshCw className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? '—' : totalSpent.toFixed(0)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">MT gastos</p>
          </div>
        </div>

        {/* Pontos e Medalhas */}
        <PointsCard points={points} />

        {/* Últimas encomendas */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-white">Últimas Encomendas</h2>
            <button onClick={() => navigate('/minha-conta/encomendas')} className="text-sm text-green-600 dark:text-green-400 hover:underline flex items-center gap-1">
              Ver todas <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">Nenhuma encomenda ainda.</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {orders.map(o => (
                <button
                  key={o.id}
                  onClick={() => navigate(`/minha-conta/encomendas/${o.id}`)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">Pedido #{o.orderNumber || o.id.slice(0,8)}</p>
                    {o.trackingCode && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-gray-400 font-mono">{o.trackingCode}</span>
                        <button
                          onClick={e => { e.stopPropagation(); copyTracking(o.trackingCode!); }}
                          className="text-gray-400 hover:text-green-600 transition-colors"
                        >
                          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(o.createdAt).toLocaleDateString('pt-MZ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{o.totalAmount?.toFixed(2)} MT</p>
                    <span className="text-xs text-gray-500">{STATUS_LABEL[o.status] || o.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cartão de afiliado */}
        {affiliate === false ? (
          <button
            onClick={() => navigate('/minha-conta/afiliado')}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white text-left hover:from-green-600 hover:to-emerald-700 transition-all shadow-sm"
          >
            <div className="flex items-center gap-3 mb-2">
              <Gift className="w-5 h-5" />
              <span className="font-semibold text-sm">Programa de Afiliados</span>
              <ChevronRight className="w-4 h-4 ml-auto" />
            </div>
            <p className="text-xs text-green-100">Ganha 5% de comissão indicando amigos. Regista-te grátis →</p>
          </button>
        ) : affiliate ? (
          <button
            onClick={() => navigate('/minha-conta/afiliado')}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800 hover:border-green-500 dark:hover:border-green-500 transition-colors text-left"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-semibold text-sm text-gray-900 dark:text-white">Afiliado — {affiliate.referral_code}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{Number(affiliate.total_earned).toFixed(0)} MT</p>
                <p className="text-xs text-gray-500">Ganho</p>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{Number(affiliate.available_balance).toFixed(0)} MT</p>
                <p className="text-xs text-gray-500">Disponível</p>
              </div>
              <div>
                <p className="text-sm font-bold text-purple-600 dark:text-purple-400">{affiliate.total_referrals}</p>
                <p className="text-xs text-gray-500">Referidos</p>
              </div>
            </div>
          </button>
        ) : null}

        {/* Ações rápidas */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/minha-conta/encomendas')}
            className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 hover:border-green-500 dark:hover:border-green-500 transition-colors text-left"
          >
            <ShoppingBag className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">As minhas encomendas</span>
          </button>
          <button
            onClick={() => navigate('/minha-conta/reembolsos')}
            className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors text-left"
          >
            <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Reembolsos</span>
          </button>
          <button
            onClick={() => navigate('/minha-conta/afiliado')}
            className="col-span-2 flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 hover:border-green-500 dark:hover:border-green-500 transition-colors text-left"
          >
            <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Programa de Afiliados</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
