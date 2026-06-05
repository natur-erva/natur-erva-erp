import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Minus, ShoppingCart, CheckCircle, X, Printer, Store, LogOut, Clock } from 'lucide-react';
import api from '../../core/services/apiClient';
import { orderService } from '../services/orderService';
import { Product, OrderItem, OrderStatus } from '../../core/types/types';
import type { Toast } from '../../core/components/ui/Toast';

interface POSProps {
  showToast?: (msg: string, type: Toast['type']) => void;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type CartItem = {
  productId: string; productName: string;
  variantId?: string; variantName?: string;
  price: number; quantity: number; unit: string; maxStock: number;
};
type PayMethod = 'cash' | 'mpesa' | 'transfer';
type SaleReceipt = {
  orderNumber: string; items: CartItem[];
  subtotal: number; discount: number; total: number;
  paid: number; change: number; payMethod: PayMethod;
  customerName: string; date: string;
};
type PosSession = {
  id: string; cashier_name: string; cashier_id: string;
  opened_at: string; closed_at?: string; initial_amount: number; is_open: boolean;
};
type ByMethod = { method: string; count: number; total: number };
type CloseReport = {
  session: PosSession;
  summary: { totalSales: number; totalOrders: number; byMethod: ByMethod[]; expectedCash: number };
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAY_LABELS: Record<string, string> = { cash: 'Dinheiro', mpesa: 'M-Pesa', transfer: 'Transferência' };
const fmt = (n: number) => `MT ${n.toFixed(2)}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
const fmtDuration = (from: string) => {
  const mins = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

function printReceipt(r: SaleReceipt) {
  const rows = r.items.map(c =>
    `<tr><td style="padding:3px 0">${c.productName}${c.variantName ? ' · ' + c.variantName : ''}</td>
     <td style="padding:3px 4px;white-space:nowrap">${c.quantity} ${c.unit}</td>
     <td style="padding:3px 0;text-align:right;white-space:nowrap">MT ${(c.price * c.quantity).toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo #${r.orderNumber}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:12px}.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px}hr{border:none;border-top:1px dashed #000;margin:7px 0}table{width:100%;border-collapse:collapse}.totrow{font-weight:bold;font-size:13px}</style>
</head><body>
<div class="c"><p class="b lg">NATUR ERVA</p><p>natural é saudável</p><p>${r.date}</p><p>Pedido #${r.orderNumber}</p>
${r.customerName !== 'Cliente POS' ? `<p>Cliente: ${r.customerName}</p>` : ''}</div>
<hr><table>${rows}</table><hr>
<table>
  <tr><td>Subtotal:</td><td style="text-align:right">MT ${r.subtotal.toFixed(2)}</td></tr>
  ${r.discount > 0 ? `<tr><td>Desconto:</td><td style="text-align:right">- MT ${r.discount.toFixed(2)}</td></tr>` : ''}
  <tr class="totrow"><td>TOTAL:</td><td style="text-align:right">MT ${r.total.toFixed(2)}</td></tr>
</table><hr>
<table>
  <tr><td>${PAY_LABELS[r.payMethod] || r.payMethod}:</td><td style="text-align:right">MT ${r.paid.toFixed(2)}</td></tr>
  ${r.change > 0 ? `<tr><td>Troco:</td><td style="text-align:right">MT ${r.change.toFixed(2)}</td></tr>` : ''}
</table><hr>
<div class="c"><p>Obrigado pela sua compra!</p><p>www.natur-erva.co.mz</p></div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`;
  const win = window.open('', '_blank', 'width=360,height=620');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Component ──────────────────────────────────────────────────────────────────
export const POS: React.FC<POSProps> = ({ showToast }) => {
  // Session
  const [session, setSession] = useState<PosSession | null | 'loading'>('loading');
  const [initialAmtInput, setInitialAmtInput] = useState('');
  const [openingSession, setOpeningSession] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [closeReport, setCloseReport] = useState<CloseReport | null>(null);

  // POS
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [variantPicker, setVariantPicker] = useState<Product | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [discount, setDiscount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<SaleReceipt | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Product[]>('/products').then(d => setProducts(d || [])),
      api.get<PosSession | null>('/pos/session/current').then(s => setSession(s)),
    ]).catch(() => {
      setSession(null);
      showToast?.('Erro ao carregar dados', 'error');
    });
  }, []);

  const filtered = useMemo(() =>
    products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  // ── Session handlers ──────────────────────────────────────────────────────────
  const handleOpenSession = async () => {
    setOpeningSession(true);
    try {
      const s = await api.post<PosSession>('/pos/session/open', {
        initialAmount: parseFloat(initialAmtInput) || 0,
      });
      setSession(s);
      setInitialAmtInput('');
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao abrir caixa', 'error');
    } finally { setOpeningSession(false); }
  };

  const handleCloseSession = async () => {
    if (!confirm('Confirmas o fecho da caixa?')) return;
    setClosingSession(true);
    try {
      const report = await api.post<CloseReport>('/pos/session/close', {});
      setCloseReport(report);
      setSession(null);
      setCart([]);
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao fechar caixa', 'error');
    } finally { setClosingSession(false); }
  };

  // ── Cart handlers ─────────────────────────────────────────────────────────────
  const addItem = (productId: string, productName: string, price: number, unit: string, maxStock: number, variantId?: string, variantName?: string) => {
    const key = variantId ?? productId;
    setCart(prev => {
      const idx = prev.findIndex(c => (c.variantId ?? c.productId) === key);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, quantity: Math.min(c.quantity + 1, c.maxStock) } : c);
      return [...prev, { productId, productName, variantId, variantName, price, quantity: 1, unit, maxStock }];
    });
    setVariantPicker(null);
  };

  const setQty = (idx: number, qty: number) =>
    qty <= 0
      ? setCart(prev => prev.filter((_, i) => i !== idx))
      : setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: Math.min(qty, c.maxStock) } : c));

  const subtotal    = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const discountAmt = Math.min(Math.max(parseFloat(discount) || 0, 0), subtotal);
  const total       = subtotal - discountAmt;
  const paid        = parseFloat(amountPaid) || 0;
  const change      = paid - total;

  const handleCheckout = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    try {
      const items: OrderItem[] = cart.map(c => ({
        id: '', productId: c.productId,
        productName: c.variantName ? `${c.productName} ${c.variantName}` : c.productName,
        variantId: c.variantId, variantName: c.variantName,
        quantity: c.quantity, price: c.price, unit: c.unit,
      }));
      const result = await orderService.createOrder({
        id: '', customerId: '',
        customerName: customerName.trim() || 'Cliente POS',
        customerPhone: customerPhone.trim() || undefined,
        items, totalAmount: total,
        discountAmount: discountAmt || undefined,
        status: OrderStatus.COMPLETED, paymentStatus: 'paid',
        amountPaid: Math.max(paid, total), paymentMethod: payMethod,
        isDelivery: false, source: 'pos',
        createdAt: new Date().toISOString(),
      });
      if (result.order) {
        setDone({
          orderNumber: result.order.orderNumber || result.order.id.substring(0, 8),
          items: [...cart], subtotal, discount: discountAmt, total,
          paid: Math.max(paid, total), change: Math.max(0, change),
          payMethod, customerName: customerName.trim() || 'Cliente POS',
          date: new Date().toLocaleString('pt-PT'),
        });
        setCart([]);
        setCustomerName(''); setCustomerPhone('');
        setAmountPaid(''); setDiscount('');
      } else {
        showToast?.('Erro ao registar venda', 'error');
      }
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao processar venda', 'error');
    } finally { setSubmitting(false); }
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (session === 'loading') {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center text-gray-400">
          <Store className="w-10 h-10 mx-auto mb-3 animate-pulse" />
          <p className="text-sm">A carregar caixa...</p>
        </div>
      </div>
    );
  }

  // ── Abrir Caixa ───────────────────────────────────────────────────────────────
  if (!session && !closeReport) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-950 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Store className="w-8 h-8 text-brand-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Abrir Caixa</h2>
          <p className="text-sm text-gray-500 mb-6">Introduz o fundo de maneio para iniciar a sessão</p>

          <div className="mb-4 text-left">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Fundo inicial (MT)</label>
            <input
              type="number" value={initialAmtInput}
              onChange={e => setInitialAmtInput(e.target.value)}
              placeholder="0.00" min={0}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-lg font-semibold text-center focus:ring-2 focus:ring-brand-500 focus:outline-none"
              onKeyDown={e => e.key === 'Enter' && handleOpenSession()}
            />
          </div>

          <button onClick={handleOpenSession} disabled={openingSession}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
            {openingSession ? 'A abrir...' : 'Abrir Caixa'}
          </button>
        </div>
      </div>
    );
  }

  // ── Relatório de Fecho ────────────────────────────────────────────────────────
  if (closeReport) {
    const { summary, session: s } = closeReport;
    const duration = fmtDuration(s.opened_at);
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-950 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-brand-600 px-6 py-5 text-white text-center">
            <CheckCircle className="w-10 h-10 mx-auto mb-2" />
            <h2 className="text-xl font-bold">Caixa Fechada</h2>
            <p className="text-brand-100 text-sm mt-1">
              {fmtTime(s.opened_at)} → {fmtTime(s.closed_at!)} · {duration}
            </p>
            <p className="text-brand-100 text-sm">Caixa: {s.cashier_name}</p>
          </div>

          {/* Resumo */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalOrders}</p>
                <p className="text-xs text-gray-500 mt-1">Vendas realizadas</p>
              </div>
              <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-brand-600">{fmt(summary.totalSales)}</p>
                <p className="text-xs text-gray-500 mt-1">Total vendido</p>
              </div>
            </div>

            {/* Por método */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por método de pagamento</p>
              <div className="space-y-2">
                {summary.byMethod.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-2">Nenhuma venda nesta sessão</p>
                  : summary.byMethod.map(m => (
                    <div key={m.method} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{PAY_LABELS[m.method] || m.method}</p>
                        <p className="text-xs text-gray-400">{m.count} {m.count === 1 ? 'venda' : 'vendas'}</p>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">{fmt(m.total)}</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Fundo esperado */}
            <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Fundo esperado em caixa</p>
                <p className="text-xs text-gray-400">Fundo inicial + vendas a dinheiro</p>
              </div>
              <p className="text-xl font-bold text-green-600">{fmt(summary.expectedCash)}</p>
            </div>
          </div>

          <div className="px-6 pb-6">
            <button onClick={() => setCloseReport(null)}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors">
              Abrir Nova Caixa
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── POS Principal ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Barra de sessão */}
      <div className="flex items-center gap-3 px-4 py-2 bg-brand-600 text-white text-sm shrink-0">
        <Store className="w-4 h-4 shrink-0" />
        <span className="font-medium">{(session as PosSession).cashier_name}</span>
        <span className="text-brand-200">·</span>
        <Clock className="w-3.5 h-3.5 text-brand-200" />
        <span className="text-brand-100">Abertura: {fmtTime((session as PosSession).opened_at)}</span>
        <span className="text-brand-200">·</span>
        <span className="text-brand-100">Fundo: {fmt((session as PosSession).initial_amount)}</span>
        <button onClick={handleCloseSession} disabled={closingSession}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg transition-colors disabled:opacity-50 text-xs font-medium">
          <LogOut className="w-3.5 h-3.5" />
          {closingSession ? 'A fechar...' : 'Fechar Caixa'}
        </button>
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">

        {/* Produtos */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar produto..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map(p => (
                <button key={p.id}
                  onClick={() => p.hasVariants && p.variants?.length ? setVariantPicker(p) : addItem(p.id, p.name, p.price, p.unit, p.stock)}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left hover:border-brand-500 hover:shadow-md transition-all">
                  {p.image
                    ? <img src={p.image} alt={p.name} className="w-full aspect-square object-cover rounded-lg mb-2" />
                    : <div className="w-full aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg mb-2 flex items-center justify-center text-2xl">🌿</div>}
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-brand-600 font-semibold mt-0.5">{fmt(p.price)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Stock: {p.stock} {p.unit}</p>
                </button>
              ))}
              {filtered.length === 0 && <p className="col-span-full text-center text-gray-400 py-12">Nenhum produto encontrado</p>}
            </div>
          </div>
        </div>

        {/* Carrinho */}
        <div className="w-80 lg:w-96 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-brand-600" />
            <span className="font-semibold text-gray-900 dark:text-white">Carrinho</span>
            {cart.length > 0 && <span className="ml-auto text-xs bg-brand-600 text-white rounded-full px-2 py-0.5">{cart.reduce((s, c) => s + c.quantity, 0)}</span>}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">Carrinho vazio</p>
              : cart.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{c.productName}{c.variantName ? ` · ${c.variantName}` : ''}</p>
                    <p className="text-xs text-gray-500">{fmt(c.price)} × {c.quantity} = {fmt(c.price * c.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setQty(idx, c.quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-600 hover:bg-red-100 dark:hover:bg-red-900/40"><Minus className="w-3 h-3" /></button>
                    <span className="w-5 text-center text-xs font-medium">{c.quantity}</span>
                    <button onClick={() => setQty(idx, c.quantity + 1)} disabled={c.quantity >= c.maxStock} className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-600 hover:bg-green-100 disabled:opacity-40"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
          </div>

          {/* Checkout */}
          <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome do cliente (opcional)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-500 focus:outline-none" />
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Telefone (opcional)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-500 focus:outline-none" />

            <div className="flex gap-1.5">
              {(['cash', 'mpesa', 'transfer'] as PayMethod[]).map(m => (
                <button key={m} onClick={() => setPayMethod(m)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${payMethod === m ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-400'}`}>
                  {PAY_LABELS[m]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Desconto MT</label>
              <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} min={0} placeholder="0.00"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-500 focus:outline-none" />
            </div>

            <div>
              <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                placeholder={`Valor recebido (total: ${fmt(total)})`}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-500 focus:outline-none" />
              {paid > 0 && change >= 0 && <p className="text-xs text-green-600 font-medium mt-1 px-1">Troco: {fmt(change)}</p>}
            </div>

            <div className="space-y-1 py-2 border-t border-gray-100 dark:border-gray-700">
              {discountAmt > 0 && (
                <>
                  <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                  <div className="flex justify-between text-xs text-red-500"><span>Desconto</span><span>- {fmt(discountAmt)}</span></div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{fmt(total)}</span>
              </div>
            </div>

            <button onClick={handleCheckout} disabled={!cart.length || submitting}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'A processar...' : 'Finalizar Venda'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal variantes */}
      {variantPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setVariantPicker(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">{variantPicker.name}</h3>
              <button onClick={() => setVariantPicker(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-2">
              {variantPicker.variants?.map(v => (
                <button key={v.id}
                  onClick={() => addItem(variantPicker.id, variantPicker.name, v.price, v.unit, v.stock, v.id, v.name)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{v.name}</span>
                  <div className="text-right">
                    <p className="text-brand-600 font-semibold">{fmt(v.price)}</p>
                    <p className="text-xs text-gray-400">Stock: {v.stock}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal venda concluída */}
      {done && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center border-b border-gray-100 dark:border-gray-700">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Venda Concluída!</h3>
              <p className="text-sm text-gray-500 mt-1">Pedido #{done.orderNumber} · {done.date}</p>
            </div>
            <div className="px-5 py-4 max-h-52 overflow-y-auto space-y-1">
              {done.items.map((c, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                  <span className="truncate mr-2">{c.productName}{c.variantName ? ` · ${c.variantName}` : ''} ×{c.quantity}</span>
                  <span className="shrink-0 font-medium">{fmt(c.price * c.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4 space-y-1 border-t border-gray-100 dark:border-gray-700 pt-3">
              {done.discount > 0 && (
                <>
                  <div className="flex justify-between text-xs text-gray-400"><span>Subtotal</span><span>{fmt(done.subtotal)}</span></div>
                  <div className="flex justify-between text-xs text-red-500"><span>Desconto</span><span>- {fmt(done.discount)}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold text-gray-900 dark:text-white"><span>Total</span><span>{fmt(done.total)}</span></div>
              <div className="flex justify-between text-sm text-gray-500"><span>{PAY_LABELS[done.payMethod]}</span><span>{fmt(done.paid)}</span></div>
              {done.change > 0 && <div className="flex justify-between text-sm font-semibold text-green-600"><span>Troco</span><span>{fmt(done.change)}</span></div>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => printReceipt(done)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium">
                <Printer className="w-4 h-4" />Imprimir
              </button>
              <button onClick={() => setDone(null)}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors text-sm">
                Nova Venda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
