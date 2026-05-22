import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Package, Truck, CheckCircle, Clock, XCircle, MapPin, Tag, Copy, Check, Scan } from 'lucide-react';
import api from '../../core/services/apiClient';
import { Order, OrderStatus } from '../../core/types/order';

interface TimelineStep {
  label: string;
  icon: React.ReactNode;
  done: boolean;
  date?: string;
  isCancelled?: boolean;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

const buildTimeline = (order: Order): TimelineStep[] => {
  const cancelled = order.status === OrderStatus.CANCELLED || order.status === 'cancelled';
  if (cancelled) {
    return [
      { label: 'Encomenda Recebida', icon: <Package className="w-5 h-5" />, done: true, date: fmtDate(order.createdAt) || undefined },
      { label: 'Cancelada', icon: <XCircle className="w-5 h-5" />, done: true, date: fmtDate(order.updatedAt) || undefined, isCancelled: true },
    ];
  }
  const statusOrder = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.COMPLETED];
  const currentIdx = statusOrder.indexOf(order.status as OrderStatus);
  return [
    {
      label: 'Encomenda Recebida',
      icon: <Package className="w-5 h-5" />,
      done: currentIdx >= 0,
      date: currentIdx >= 0 ? fmtDate(order.createdAt) || undefined : undefined,
    },
    {
      label: 'Em Processamento',
      icon: <Clock className="w-5 h-5" />,
      done: currentIdx >= 1,
      date: currentIdx >= 1 ? fmtDate(order.updatedAt) || undefined : undefined,
    },
    {
      label: 'A Caminho',
      icon: <Truck className="w-5 h-5" />,
      done: currentIdx >= 2,
      date: currentIdx >= 2 ? fmtDate(order.updatedAt) || undefined : undefined,
    },
    {
      label: 'Entregue',
      icon: <CheckCircle className="w-5 h-5" />,
      done: currentIdx >= 3,
      date: currentIdx >= 3 ? fmtDate(order.deliveredAt || order.updatedAt) || undefined : undefined,
    },
  ];
};

export const CustomerOrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  useEffect(() => {
    if (!id) return;
    api.get<Order>(`/orders/my-orders/${id}`)
      .then(setOrder)
      .catch(() => setError('Encomenda não encontrada'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-4">
      <p className="text-red-500">{error || 'Encomenda não encontrada'}</p>
      <button onClick={() => navigate('/minha-conta/encomendas')} className="text-green-600 hover:underline text-sm">Voltar</button>
    </div>
  );

  const timeline = buildTimeline(order);
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/minha-conta/encomendas')} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pedido #{order.orderNumber || order.id.slice(0,8)}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{fmtDate(order.createdAt)}</p>
          </div>
        </div>

        {/* Código de Rastreio */}
        {order.trackingCode && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-3">
              <Scan className="w-5 h-5 text-green-600 dark:text-green-400" />
              <h2 className="font-semibold text-green-800 dark:text-green-300 text-sm">Código de Rastreio</h2>
            </div>
            <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-xl px-4 py-3 border border-green-200 dark:border-green-700">
              <span className="font-mono text-lg font-bold tracking-widest text-gray-900 dark:text-white">
                {order.trackingCode}
              </span>
              <button
                onClick={() => copyTracking(order.trackingCode!)}
                className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:text-green-800 transition-colors"
              >
                {copied ? (
                  <><Check className="w-4 h-4" /> Copiado!</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copiar</>
                )}
              </button>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400 mt-2">
              Use este código para rastrear a sua encomenda.
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-5">Rastreio do Pedido</h2>
          <div className="space-y-0">
            {timeline.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    step.isCancelled ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : step.done ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                  }`}>
                    {step.icon}
                  </div>
                  {i < timeline.length - 1 && (
                    <div className={`w-0.5 flex-1 my-1 ${step.done && !step.isCancelled ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} style={{ minHeight: '24px' }} />
                  )}
                </div>
                <div className="pb-4 flex-1">
                  <p className={`font-medium text-sm ${step.isCancelled ? 'text-red-600 dark:text-red-400' : step.done ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'}`}>
                    {step.label}
                  </p>
                  {step.date && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.date}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Itens */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Itens do Pedido</h2>
          <div className="space-y-3">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.productName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Qtd: {item.quantity} {item.unit || ''}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {((item.priceAtTime || item.price || 0) * item.quantity).toFixed(2)} MT
                </span>
              </div>
            ))}
          </div>

          {/* Totais */}
          <div className="mt-4 space-y-2">
            {order.isDelivery && order.deliveryFee != null && order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Taxa de entrega {order.deliveryZoneName ? `(${order.deliveryZoneName})` : ''}</span>
                <span>{order.deliveryFee.toFixed(2)} MT</span>
              </div>
            )}
            {order.couponCode && (order.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> {order.couponCode}</span>
                <span>-{(order.discountAmount || 0).toFixed(2)} MT</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-200 dark:border-gray-700 pt-2 text-gray-900 dark:text-white">
              <span>Total</span>
              <span>{order.totalAmount?.toFixed(2)} MT</span>
            </div>
          </div>
        </div>

        {/* Endereço */}
        {order.isDelivery && order.deliveryLocation && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-5 h-5 text-green-600 dark:text-green-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Endereço de Entrega</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{order.deliveryLocation}</p>
          </div>
        )}

        {/* Ação: Solicitar Reembolso */}
        {(order.status === OrderStatus.DELIVERED || order.status === 'delivered' || order.status === OrderStatus.COMPLETED) && (
          <button
            onClick={() => navigate('/minha-conta/reembolsos', { state: { orderId: order.id, orderNumber: order.orderNumber } })}
            className="w-full py-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-red-400 hover:text-red-600 dark:hover:border-red-500 dark:hover:text-red-400 transition-colors font-medium text-sm"
          >
            Solicitar Reembolso
          </button>
        )}
      </div>
    </div>
  );
};

export default CustomerOrderDetail;
