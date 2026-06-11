import React, { useState, useEffect, useCallback } from 'react';
import {
  Store, Printer, Clock, Banknote, Smartphone,
  CreditCard, CheckCircle, RefreshCw,
} from 'lucide-react';
import api from '../../core/services/apiClient';
import type { Toast } from '../../core/components/ui/Toast';

interface CaixaPageProps {
  showToast?: (msg: string, type: Toast['type']) => void;
}

type PosSession = {
  id: string; cashier_name: string; cashier_id: string;
  opened_at: string; closed_at?: string; initial_amount: number; is_open: boolean;
};
type ByMethod = { method: string; count: number; total: number };
type CloseReport = {
  session: PosSession;
  summary: { totalSales: number; totalOrders: number; byMethod: ByMethod[]; expectedCash: number };
};
type SessionHistory = {
  id: string; cashierName: string; openedAt: string; closedAt?: string;
  initialAmount: number; isOpen: boolean;
  totalSales: number; totalOrders: number;
  summary?: CloseReport['summary'] | null;
};
type Order = {
  id: string; orderNumber?: string; customerName?: string;
  totalAmount: number; paymentMethod?: string;
  createdAt: string; created_at?: string; source?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const TZ = 'Africa/Maputo';
const PAY_LABELS: Record<string, string> = { cash: 'Dinheiro', mpesa: 'M-Pesa', transfer: 'Transferência' };
const fmt = (n: number | string) => `MT ${Number(n ?? 0).toFixed(2)}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDuration = (from: string) => {
  const m = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function printCloseReport(
  s: PosSession,
  summary: CloseReport['summary'],
  companyName = 'NaturErva',
  logoUrl = `${window.location.origin}/logo.png`,
) {
  const f = (n: number) => `MT ${Number(n).toFixed(2)}`;
  const rows = summary.byMethod.map(m =>
    `<tr><td>${PAY_LABELS[m.method] || m.method}</td><td style="text-align:center">${m.count}</td><td style="text-align:right">${f(m.total)}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="text-align:center">Sem vendas</td></tr>';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fecho de Caixa</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;margin:0 auto;padding:12px}.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px}hr{border:none;border-top:1px dashed #000;margin:7px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0}img.logo{display:block;margin:0 auto 6px;max-width:110px;max-height:55px;object-fit:contain}</style>
</head><body>
<div class="c"><img class="logo" src="${logoUrl}" alt="" onerror="this.style.display='none'"><p class="b lg">${companyName}</p><p>FECHO DE CAIXA</p></div><hr>
<p>Caixa: ${s.cashier_name}</p>
<p>Abertura: ${new Date(s.opened_at).toLocaleString('pt-PT', { timeZone: TZ })}</p>
<p>Fecho: ${s.closed_at ? new Date(s.closed_at).toLocaleString('pt-PT', { timeZone: TZ }) : '—'}</p>
<p>Fundo inicial: ${f(Number(s.initial_amount))}</p><hr>
<table><tr><td class="b">Método</td><td class="b" style="text-align:center">Qtd</td><td class="b" style="text-align:right">Total</td></tr>${rows}</table><hr>
<table>
  <tr><td class="b">Total Vendas:</td><td class="b" style="text-align:right">${f(summary.totalSales)}</td></tr>
  <tr><td>Transações:</td><td style="text-align:right">${summary.totalOrders}</td></tr>
  <tr><td>Fundo esperado:</td><td style="text-align:right">${f(summary.expectedCash)}</td></tr>
</table><hr>
<div class="c"><p>Relatório de Fecho de Caixa</p></div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=360,height=680');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Component ─────────────────────────────────────────────────────────────────
export const CaixaPage: React.FC<CaixaPageProps> = ({ showToast }) => {
  const [tab, setTab] = useState<'atual' | 'anteriores'>('atual');
  const [session, setSession] = useState<PosSession | null | 'loading'>('loading');
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [taxConfig, setTaxConfig] = useState<any>({});
  const [initialAmt, setInitialAmt] = useState('');
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeReport, setCloseReport] = useState<CloseReport | null>(null);

  const loadOrders = useCallback(async (sess: PosSession) => {
    try {
      const data = await api.get<any>('/orders?limit=100');
      const list: Order[] = Array.isArray(data) ? data : (data?.orders || data?.data || []);
      const sessionStart = new Date(sess.opened_at);
      setRecentOrders(
        list.filter(o => {
          const dt = new Date(o.createdAt || o.created_at || 0);
          const src = o.source || '';
          return dt >= sessionStart && src === 'pos';
        })
      );
    } catch { setRecentOrders([]); }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api.get<PosSession | null>('/pos/session/current'),
        api.get<any>('/tax/config'),
      ]);
      setSession(s);
      setTaxConfig(t || {});
      if (s?.is_open) loadOrders(s);
    } catch { setSession(null); }
  }, [loadOrders]);

  const loadSessions = useCallback(async () => {
    if (loadingSessions) return;
    setLoadingSessions(true);
    try { setSessions((await api.get<SessionHistory[]>('/pos/sessions')) || []); } catch {}
    setLoadingSessions(false);
  }, [loadingSessions]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === 'anteriores') loadSessions(); }, [tab]);

  const handleOpen = async () => {
    setOpening(true);
    try {
      const s = await api.post<PosSession>('/pos/session/open', { initialAmount: parseFloat(initialAmt) || 0 });
      setSession(s);
      setInitialAmt('');
      setRecentOrders([]);
    } catch (e: any) { showToast?.(e.message || 'Erro ao abrir caixa', 'error'); }
    setOpening(false);
  };

  const handleClose = async () => {
    if (!confirm('Confirmas o fecho da caixa?')) return;
    setClosing(true);
    try {
      const r = await api.post<CloseReport>('/pos/session/close', {});
      setCloseReport(r);
      setSession(null);
      setRecentOrders([]);
    } catch (e: any) { showToast?.(e.message || 'Erro ao fechar caixa', 'error'); }
    setClosing(false);
  };

  // Live payment breakdown from recent orders
  const liveByMethod = ['cash', 'mpesa', 'transfer'].map(method => {
    const orders = recentOrders.filter(o => (o.paymentMethod || 'cash') === method);
    return { method, count: orders.length, total: orders.reduce((s, o) => s + Number(o.totalAmount), 0) };
  });
  const liveTotalSales = recentOrders.reduce((s, o) => s + Number(o.totalAmount), 0);
  const sess = session as PosSession | null;
  const logoUrl = taxConfig.logoUrl || `${window.location.origin}/logo.png`;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (session === 'loading') return (
    <div className="flex items-center justify-center h-[calc(100vh-64px)]">
      <div className="text-center text-gray-400">
        <Store className="w-10 h-10 mx-auto mb-3 animate-pulse" />
        <p className="text-sm">A carregar caixa...</p>
      </div>
    </div>
  );

  // ── Close Report ─────────────────────────────────────────────────────────────
  if (closeReport) {
    const { summary, session: s } = closeReport;
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-5">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Caixa</h1>
            <p className="text-sm text-gray-500 mt-0.5">Sessão encerrada</p>
          </div>
        </div>
        <div className="max-w-md mx-auto px-6 py-10">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="bg-brand-600 px-6 py-6 text-white text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-90" />
              <h2 className="text-xl font-bold">Caixa Fechada</h2>
              <p className="text-brand-100 text-sm mt-1">
                {fmtTime(s.opened_at)} → {s.closed_at ? fmtTime(s.closed_at) : '—'} · {fmtDuration(s.opened_at)}
              </p>
              <p className="text-brand-100 text-sm">{s.cashier_name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalOrders}</p>
                  <p className="text-xs text-gray-500 mt-1">Vendas realizadas</p>
                </div>
                <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4 text-center">
                  <p className="text-xl font-bold text-brand-600">{fmt(summary.totalSales)}</p>
                  <p className="text-xs text-gray-500 mt-1">Total vendido</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por método de pagamento</p>
                {summary.byMethod.length === 0
                  ? <p className="text-sm text-gray-400 text-center py-3">Nenhuma venda</p>
                  : summary.byMethod.map(m => (
                    <div key={m.method} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{PAY_LABELS[m.method] || m.method}</p>
                        <p className="text-xs text-gray-400">{m.count} {m.count === 1 ? 'venda' : 'vendas'}</p>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white font-mono">{fmt(m.total)}</p>
                    </div>
                  ))}
              </div>

              <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Fundo esperado em caixa</p>
                  <p className="text-xs text-gray-400">Fundo inicial + vendas a dinheiro</p>
                </div>
                <p className="text-xl font-bold text-green-600">{fmt(summary.expectedCash)}</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => printCloseReport(s, summary, taxConfig.companyName, logoUrl)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium">
                  <Printer className="w-4 h-4" />Imprimir
                </button>
                <button
                  onClick={() => { setCloseReport(null); setTab('atual'); }}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors text-sm">
                  Abrir Nova Caixa
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Caixa</h1>
              {sess ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full border border-green-200 dark:border-green-800">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Aberta há {fmtDuration(sess.opened_at)}
                </span>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">Fechada</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie a sua sessão de caixa</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex">
            {([
              { id: 'atual', label: 'Caixa Atual' },
              { id: 'anteriores', label: 'Caixas Anteriores' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── Tab: Caixa Atual — sem sessão ────────────────────────────────── */}
        {tab === 'atual' && !sess && (
          <div className="flex items-center justify-center py-16">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 w-full max-w-sm text-center shadow-sm">
              <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Store className="w-8 h-8 text-brand-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Abrir Caixa</h2>
              <p className="text-sm text-gray-500 mb-6">Introduz o fundo de maneio para iniciar a sessão</p>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block text-left">Fundo inicial (MT)</label>
              <input
                type="number" value={initialAmt}
                onChange={e => setInitialAmt(e.target.value)}
                placeholder="0.00" min={0}
                onKeyDown={e => e.key === 'Enter' && handleOpen()}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-lg font-semibold text-center focus:ring-2 focus:ring-brand-500 focus:outline-none mb-4"
              />
              <button onClick={handleOpen} disabled={opening}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
                {opening ? 'A abrir...' : 'Abrir Caixa'}
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Caixa Atual — sessão aberta — 3 colunas ─────────────────── */}
        {tab === 'atual' && sess && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Col 1: Resumo */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Resumo do Caixa</h3>
                <button onClick={loadAll} title="Atualizar"
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Aberto {fmtTime(sess.opened_at)} ({fmtDuration(sess.opened_at)})</span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Saldo inicial</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white font-mono">{fmt(sess.initial_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Total de vendas</span>
                    <span className="text-sm font-semibold text-brand-600 font-mono">{fmt(liveTotalSales)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Nº de vendas</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{recentOrders.length}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-3 mt-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Saldo Final (est.)</span>
                    <span className="text-base font-bold text-gray-900 dark:text-white font-mono">
                      {fmt(Number(sess.initial_amount) + liveTotalSales)}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  Caixeiro: <span className="font-medium text-gray-600 dark:text-gray-300">{sess.cashier_name}</span>
                </div>
              </div>
            </div>

            {/* Col 2: Meios de Pagamento */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Meio de Pagamento</h3>
              </div>
              <div className="p-5 space-y-3">
                {liveByMethod.map(m => {
                  const icon = m.method === 'cash'
                    ? <Banknote className="w-5 h-5" />
                    : m.method === 'mpesa'
                    ? <Smartphone className="w-5 h-5" />
                    : <CreditCard className="w-5 h-5" />;
                  const color = m.method === 'cash'
                    ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
                    : m.method === 'mpesa'
                    ? 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400'
                    : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
                  return (
                    <div key={m.method} className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                      m.total > 0
                        ? 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                        : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
                    }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{PAY_LABELS[m.method]}</p>
                        {m.count > 0 && (
                          <p className="text-xs text-gray-400">{m.count} {m.count === 1 ? 'venda' : 'vendas'}</p>
                        )}
                      </div>
                      <span className={`text-sm font-semibold font-mono ${m.total > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                        {fmt(m.total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Col 3: Movimentações + Fechar */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Movimentação</h3>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {recentOrders.length} {recentOrders.length === 1 ? 'venda' : 'vendas'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto" style={{ maxHeight: '360px' }}>
                {/* Abertura de caixa */}
                <div className="flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/60">
                  <div className="w-2 h-2 bg-brand-500 rounded-full mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{fmt(sess.initial_amount)}</span>
                      <span className="text-[10px] text-gray-400">{fmtTime(sess.opened_at)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">Abertura de Caixa · Dinheiro</p>
                  </div>
                </div>

                {/* Vendas da sessão */}
                {recentOrders.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-xs text-gray-400">Nenhuma venda nesta sessão</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">As vendas aparecem aqui em tempo real</p>
                  </div>
                ) : (
                  [...recentOrders].reverse().map(o => (
                    <div key={o.id} className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{fmt(o.totalAmount)}</span>
                          <span className="text-[10px] text-gray-400">{fmtTime(o.createdAt)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          {o.customerName || 'Cliente POS'} · {PAY_LABELS[o.paymentMethod || 'cash'] || o.paymentMethod}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Saldo Final + Fechar */}
              <div className="border-t border-gray-100 dark:border-gray-800 p-5 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Saldo Final</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white font-mono">
                    {fmt(Number(sess.initial_amount) + liveTotalSales)}
                  </span>
                </div>
                <button onClick={handleClose} disabled={closing}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm">
                  {closing ? 'A fechar...' : 'Fechar Caixa'}
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ── Tab: Caixas Anteriores ────────────────────────────────────────────── */}
        {tab === 'anteriores' && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            {loadingSessions ? (
              <div className="py-16 text-center text-sm text-gray-400">A carregar...</div>
            ) : sessions.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-gray-500">Nenhuma sessão anterior encontrada</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {['Caixeiro', 'Abertura', 'Fecho', 'Fundo Inicial', 'Vendas', 'Total', 'Estado', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {sessions.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{s.cashierName}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <div>{fmtDate(s.openedAt)}</div>
                        <div className="text-gray-400">{fmtTime(s.openedAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {s.closedAt ? (
                          <>
                            <div>{fmtDate(s.closedAt)}</div>
                            <div className="text-gray-400">{fmtTime(s.closedAt)}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">{fmt(s.initialAmount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{s.totalOrders}</td>
                      <td className="px-4 py-3 text-sm font-semibold font-mono text-gray-900 dark:text-white">{fmt(s.totalSales)}</td>
                      <td className="px-4 py-3">
                        {s.isOpen
                          ? <span className="inline-flex items-center gap-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium"><span className="w-1.5 h-1.5 bg-green-500 rounded-full" />Aberta</span>
                          : <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Fechada</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!s.isOpen && s.summary && (
                          <button
                            onClick={() => {
                              const ps: PosSession = { id: s.id, cashier_name: s.cashierName, cashier_id: '', opened_at: s.openedAt, closed_at: s.closedAt, initial_amount: s.initialAmount, is_open: false };
                              printCloseReport(ps, s.summary!, taxConfig.companyName, logoUrl);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <Printer className="w-3 h-3" />Imprimir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
