import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../core/services/apiClient';
import { Product } from '../../core/types/types';
import { getEffectivePrice } from '../../core/utils/pricing';

// ── Types ──────────────────────────────────────────────────────────────────────
interface QuoteItem {
  productId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unit: string;
  price: number;
  isPromo?: boolean;
  originalPrice?: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerPhone: string;
  customerNuit: string;
  customerEmail: string;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  notes: string;
  status: QuoteStatus;
  validUntil: string | null;
  validityDays: number;
  createdAt: string;
  updatedAt: string;
}

type QuoteStatus = 'rascunho' | 'enviada' | 'aceite' | 'rejeitada' | 'convertida' | 'expirada';

interface Stats {
  total: number; rascunho: number; enviada: number;
  aceite: number; convertida: number; expirada: number;
  total_mes: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number | string) => `MT ${Number(n ?? 0).toFixed(2)}`;
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  rascunho: 'Rascunho', enviada: 'Enviada', aceite: 'Aceite',
  rejeitada: 'Rejeitada', convertida: 'Convertida', expirada: 'Expirada',
};
const STATUS_STYLE: Record<QuoteStatus, string> = {
  rascunho:   'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  enviada:    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  aceite:     'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejeitada:  'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  convertida: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  expirada:   'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

// ── Print function (same as POS) ───────────────────────────────────────────────
function printQuoteDoc(q: Quote, tax: { companyName: string; companyNuit: string; companyAddress: string; companyPhone: string; companyEmail: string; vatRate: number }, logoUrl = `${window.location.origin}/logo.png`) {
  const vatMult  = 1 + tax.vatRate / 100;
  const baseIva  = q.total / vatMult;
  const ivaAmt   = q.total - baseIva;
  const today    = new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Maputo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const validStr = q.validUntil ? fmtDate(q.validUntil) : '—';
  const rows = q.items.map(c =>
    `<tr>
      <td>${c.productName}${c.variantName ? ` (${c.variantName})` : ''}${c.isPromo ? ' <span style="font-size:9px;background:#fff3cd;color:#b45309;padding:1px 4px;border-radius:3px">PROMO</span>' : ''}</td>
      <td class="r">${c.quantity} ${c.unit}</td>
      <td class="r">${c.isPromo && c.originalPrice ? `<span style="text-decoration:line-through;color:#bbb;font-size:10px">MT ${c.originalPrice.toFixed(2)}</span><br>` : ''}MT ${c.price.toFixed(2)}</td>
      <td class="r">MT ${(c.price * c.quantity).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cotação ${q.quoteNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;padding:28px;color:#111}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
  .company{font-size:18px;font-weight:700;color:#16a34a}
  .badge{background:#7c3aed;color:#fff;font-size:20px;font-weight:700;padding:8px 18px;border-radius:8px;letter-spacing:1px}
  .num{font-size:12px;color:#555;margin-top:4px;text-align:right}
  .validity{background:#faf5ff;border:2px solid #7c3aed;border-radius:8px;padding:10px 16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center}
  .vl{font-size:12px;color:#7c3aed;font-weight:600}
  .vd{font-size:16px;font-weight:700;color:#7c3aed}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
  .info-box{background:#f9f9f9;border:1px solid #e5e7eb;border-radius:6px;padding:10px}
  .info-box h4{font-size:10px;text-transform:uppercase;color:#888;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{background:#7c3aed;color:#fff;padding:7px 8px;font-size:11px;text-align:left}
  td{padding:6px 8px;font-size:11px;border-bottom:1px solid #e5e7eb}
  .r{text-align:right}
  .totals{margin-left:auto;width:260px}
  .totals td{padding:4px 8px;font-size:12px}
  .bold{font-weight:700;font-size:15px;color:#7c3aed}
  .footer{margin-top:24px;font-size:10px;color:#888;text-align:center;border-top:1px solid #e5e7eb;padding-top:10px}
  .warning{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:8px 12px;font-size:11px;color:#92400e;margin-top:16px;text-align:center;font-weight:600}
  .sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px}
  .sig-box{border-top:1px solid #999;padding-top:6px;font-size:11px;color:#555;text-align:center}
  ${q.notes ? '.notes{background:#f9f9f9;border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:14px;font-size:11px;color:#555}' : ''}
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:14px">
    <img src="${logoUrl}" onerror="this.style.display='none'" style="max-width:90px;max-height:55px;object-fit:contain">
    <div>
      <div class="company">${tax.companyName}</div>
      <div style="font-size:11px;color:#666;margin-top:3px">NUIT: ${tax.companyNuit || '—'}</div>
      <div style="font-size:11px;color:#666">${tax.companyAddress || ''}</div>
      <div style="font-size:11px;color:#666">${tax.companyPhone || ''} | ${tax.companyEmail || ''}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div class="badge">COTAÇÃO</div>
    <div class="num">${q.quoteNumber}</div>
    <div style="font-size:11px;color:#666;margin-top:4px">Data: ${today}</div>
  </div>
</div>
<div class="validity">
  <div><div class="vl">Validade</div><div style="font-size:11px;color:#555;margin-top:2px">Esta cotação é válida por ${q.validityDays} dias</div></div>
  <div class="vd">Válida até ${validStr}</div>
</div>
<div class="info-grid">
  <div class="info-box"><h4>Emitida por</h4><p><strong>${tax.companyName}</strong></p><p>NUIT: ${tax.companyNuit || '—'}</p><p>${tax.companyPhone || ''}</p></div>
  <div class="info-box"><h4>Cliente</h4><p><strong>${q.customerName || '—'}</strong></p>${q.customerPhone ? `<p>${q.customerPhone}</p>` : ''}${q.customerNuit ? `<p>NUIT: ${q.customerNuit}</p>` : '<p style="font-size:10px;color:#999">NUIT: ______________</p>'}${q.customerEmail ? `<p>${q.customerEmail}</p>` : ''}</div>
</div>
${q.notes ? `<div class="notes"><strong>Notas:</strong> ${q.notes}</div>` : ''}
<table><thead><tr><th>Descrição</th><th class="r">Qtd</th><th class="r">Preço Unit.</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals">
  ${q.discount > 0 ? `<tr><td>Subtotal:</td><td class="r">MT ${q.subtotal.toFixed(2)}</td></tr><tr><td>Desconto:</td><td class="r">- MT ${q.discount.toFixed(2)}</td></tr>` : ''}
  <tr><td>Base s/IVA (${tax.vatRate}%):</td><td class="r">MT ${baseIva.toFixed(2)}</td></tr>
  <tr><td>IVA ${tax.vatRate}%:</td><td class="r">MT ${ivaAmt.toFixed(2)}</td></tr>
  <tr class="bold"><td>TOTAL c/IVA:</td><td class="r">MT ${q.total.toFixed(2)}</td></tr>
</table>
<div class="warning">Este documento é uma cotação e NÃO constitui um documento fiscal. Não serve como comprovativo de pagamento.</div>
<div class="sig"><div class="sig-box">Emitido por: ${tax.companyName}</div><div class="sig-box">Aceite pelo Cliente</div></div>
<div class="footer">Cotação ${q.quoteNumber} | ${today} | ${tax.companyName} | NUIT ${tax.companyNuit || '—'}</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Empty form state ───────────────────────────────────────────────────────────
const emptyForm = (): Omit<Quote, 'id' | 'quoteNumber' | 'subtotal' | 'total' | 'createdAt' | 'updatedAt'> => ({
  customerName: '', customerPhone: '', customerNuit: '', customerEmail: '',
  items: [], discount: 0, notes: '',
  status: 'rascunho', validUntil: null, validityDays: 15,
});

// ── Component ──────────────────────────────────────────────────────────────────
export const QuotesPage: React.FC = () => {
  const [quotes, setQuotes]   = useState<Quote[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxConfig, setTaxConfig] = useState<any>({});

  // Filters
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('todos');

  // Panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing]     = useState<Quote | null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);

  // Product search in panel
  const [prodSearch, setProdSearch] = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'todos') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const [{ quotes: qs }, s, p, t] = await Promise.all([
        api.get<{ quotes: Quote[]; total: number }>(`/quotes?${params}`),
        api.get<Stats>('/quotes/stats'),
        api.get<Product[]>('/products'),
        api.get<any>('/tax/config'),
      ]);
      setQuotes(qs);
      setStats(s);
      setProducts(p || []);
      setTaxConfig(t || {});
    } catch {}
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  // ── Open panel ───────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setProdSearch('');
    setPanelOpen(true);
  };
  const openEdit = (q: Quote) => {
    setEditing(q);
    setForm({
      customerName: q.customerName, customerPhone: q.customerPhone,
      customerNuit: q.customerNuit, customerEmail: q.customerEmail,
      items: [...q.items], discount: q.discount, notes: q.notes,
      status: q.status, validUntil: q.validUntil, validityDays: q.validityDays,
    });
    setProdSearch('');
    setPanelOpen(true);
  };

  // ── Computed totals ──────────────────────────────────────────────────────────
  const subtotal = useMemo(() => form.items.reduce((s, c) => s + c.price * c.quantity, 0), [form.items]);
  const discAmt  = Math.min(Math.max(form.discount || 0, 0), subtotal);
  const total    = subtotal - discAmt;

  // ── Item helpers ─────────────────────────────────────────────────────────────
  const addProduct = (p: Product) => {
    const ep = getEffectivePrice(p);
    const key = p.id;
    setForm(prev => {
      const existing = prev.items.findIndex(i => i.productId === key && !i.variantName);
      if (existing >= 0) {
        return { ...prev, items: prev.items.map((it, idx) => idx === existing ? { ...it, quantity: it.quantity + 1 } : it) };
      }
      return { ...prev, items: [...prev.items, { productId: p.id, productName: p.name, quantity: 1, unit: p.unit, price: ep.price, isPromo: ep.isPromo, originalPrice: ep.originalPrice }] };
    });
    setProdSearch('');
  };

  const updateItemQty = (idx: number, qty: number) =>
    setForm(prev => ({ ...prev, items: qty <= 0 ? prev.items.filter((_, i) => i !== idx) : prev.items.map((it, i) => i === idx ? { ...it, quantity: qty } : it) }));

  const updateItemPrice = (idx: number, price: number) =>
    setForm(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, price } : it) }));

  // ── Save ─────────────────────────────────────────────────────────────────────
  const save = async (statusOverride?: QuoteStatus) => {
    setSaving(true);
    try {
      const payload = { ...form, subtotal, discount: discAmt, total, status: statusOverride || form.status };
      if (editing) {
        const updated = await api.put<Quote>(`/quotes/${editing.id}`, payload);
        setQuotes(prev => prev.map(q => q.id === updated.id ? updated : q));
      } else {
        const created = await api.post<Quote>('/quotes', payload);
        setQuotes(prev => [created, ...prev]);
      }
      setPanelOpen(false);
      load();
    } catch {}
    setSaving(false);
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const deleteQuote = async (id: string) => {
    if (!confirm('Eliminar esta cotação permanentemente?')) return;
    setDeleting(id);
    await api.delete(`/quotes/${id}`);
    setQuotes(prev => prev.filter(q => q.id !== id));
    setDeleting(null);
    load();
  };

  // ── Status change ─────────────────────────────────────────────────────────────
  const changeStatus = async (q: Quote, status: QuoteStatus) => {
    const updated = await api.put<Quote>(`/quotes/${q.id}`, { status });
    setQuotes(prev => prev.map(x => x.id === updated.id ? updated : x));
  };

  // ── Print ─────────────────────────────────────────────────────────────────────
  const handlePrint = (q: Quote) => printQuoteDoc(q, taxConfig, taxConfig.logoUrl || `${window.location.origin}/logo.png`);

  // ── Filtered products for search ─────────────────────────────────────────────
  const filteredProds = useMemo(() =>
    prodSearch.trim().length >= 1
      ? products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 8)
      : [],
    [products, prodSearch]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Cotações</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gere propostas de preço para os seus clientes</p>
          </div>
          <button onClick={openNew}
            className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors">
            Nova Cotação
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: stats.total, sub: 'cotações' },
              { label: 'Rascunho', value: stats.rascunho, sub: 'por enviar' },
              { label: 'Enviadas', value: stats.enviada, sub: 'aguardando' },
              { label: 'Aceites', value: stats.aceite, sub: 'este mês' },
              { label: 'Convertidas', value: stats.convertida, sub: 'em vendas' },
              { label: 'Valor Mês', value: fmt(stats.total_mes), sub: 'total c/IVA', isMoney: true },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</p>
                <p className={`text-xl font-semibold mt-1 ${s.isMoney ? 'text-gray-700 dark:text-gray-300 text-base' : 'text-gray-900 dark:text-white'}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar cliente ou número..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:outline-none"
          />
          <div className="flex gap-1.5 flex-wrap">
            {(['todos', 'rascunho', 'enviada', 'aceite', 'rejeitada', 'convertida', 'expirada'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${statusFilter === s ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                {s === 'todos' ? 'Todos' : STATUS_LABELS[s as QuoteStatus]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">A carregar...</div>
          ) : quotes.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-500 font-medium">Nenhuma cotação encontrada</p>
              <p className="text-xs text-gray-400 mt-1">Cria a primeira cotação com o botão acima</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Número', 'Cliente', 'Itens', 'Total', 'Estado', 'Válida até', 'Data', ''].map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${h === '' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {quotes.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300 font-medium">{q.quoteNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{q.customerName || <span className="text-gray-400 italic text-xs">Sem nome</span>}</p>
                      {q.customerPhone && <p className="text-xs text-gray-400">{q.customerPhone}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {q.items.length} {q.items.length === 1 ? 'item' : 'itens'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white font-mono">{fmt(q.total)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={q.status}
                        onChange={e => changeStatus(q, e.target.value as QuoteStatus)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-offset-1 focus:outline-none ${STATUS_STYLE[q.status]}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {q.validUntil ? (
                        <span className={new Date(q.validUntil) < new Date() ? 'text-red-500' : ''}>
                          {fmtDate(q.validUntil)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(q.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(q)} className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white font-medium transition-colors">Editar</button>
                        <button onClick={() => handlePrint(q)} className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium transition-colors">Imprimir</button>
                        <button onClick={() => deleteQuote(q.id)} disabled={deleting === q.id}
                          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-40">
                          {deleting === q.id ? '...' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Slide-over Panel ── */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setPanelOpen(false)} />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editing ? `Editar ${editing.quoteNumber}` : 'Nova Cotação'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editing ? `Criada em ${fmtDate(editing.createdAt)}` : 'O número é gerado automaticamente ao guardar'}
                </p>
              </div>
              <button onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-light leading-none">&times;</button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Customer */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Cliente</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Nome</label>
                    <input value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))}
                      placeholder="Nome do cliente"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Telefone</label>
                    <input value={form.customerPhone} onChange={e => setForm(p => ({ ...p, customerPhone: e.target.value }))}
                      placeholder="84 000 0000"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">NUIT (opcional)</label>
                    <input value={form.customerNuit} onChange={e => setForm(p => ({ ...p, customerNuit: e.target.value }))}
                      placeholder="000000000"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Email (opcional)</label>
                    <input value={form.customerEmail} onChange={e => setForm(p => ({ ...p, customerEmail: e.target.value }))}
                      placeholder="cliente@email.com" type="email"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:outline-none" />
                  </div>
                </div>
              </section>

              {/* Items */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Produtos</h3>

                {/* Product search */}
                <div className="relative mb-3">
                  <input value={prodSearch} onChange={e => setProdSearch(e.target.value)}
                    placeholder="Pesquisar e adicionar produto..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 dark:focus:ring-white focus:outline-none" />
                  {filteredProds.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-52 overflow-y-auto">
                      {filteredProds.map(p => {
                        const ep = getEffectivePrice(p);
                        return (
                          <button key={p.id} onClick={() => addProduct(p)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <span className="text-sm text-gray-900 dark:text-white">{p.name}</span>
                            <span className={`text-xs font-mono font-semibold ${ep.isPromo ? 'text-orange-600' : 'text-gray-600 dark:text-gray-400'}`}>{fmt(ep.price)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Items list */}
                {form.items.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg py-8 text-center">
                    <p className="text-sm text-gray-400">Pesquisa acima para adicionar produtos</p>
                  </div>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left text-xs text-gray-500">Produto</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 w-20">Qtd</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 w-28">Preço Unit.</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500 w-24">Total</th>
                          <th className="px-3 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {form.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                              {item.productName}
                              {item.isPromo && <span className="ml-1 text-[9px] bg-orange-100 text-orange-600 px-1 rounded font-bold">PROMO</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" min="1" value={item.quantity}
                                onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1 text-sm text-right border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-gray-900 focus:outline-none" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" min="0" step="0.01" value={item.price}
                                onChange={e => updateItemPrice(idx, parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-1 text-sm text-right border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-gray-900 focus:outline-none" />
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-mono text-gray-700 dark:text-gray-300">
                              {fmt(item.price * item.quantity)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => updateItemQty(idx, 0)}
                                className="text-xs text-red-400 hover:text-red-600 font-medium">&times;</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Totals + settings */}
              <section className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Desconto (MT)</label>
                    <input type="number" min="0" value={form.discount}
                      onChange={e => setForm(p => ({ ...p, discount: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Validade (dias)</label>
                    <input type="number" min="1" value={form.validityDays}
                      onChange={e => setForm(p => ({ ...p, validityDays: parseInt(e.target.value) || 15 }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Data limite (opcional)</label>
                    <input type="date" value={form.validUntil ?? ''}
                      onChange={e => setForm(p => ({ ...p, validUntil: e.target.value || null }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 focus:outline-none" />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
                  {discAmt > 0 && (
                    <>
                      <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
                      <div className="flex justify-between text-xs text-red-500"><span>Desconto</span><span className="font-mono">- {fmt(discAmt)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                    <span>Total c/IVA</span>
                    <span className="font-mono">{fmt(total)}</span>
                  </div>
                </div>
              </section>

              {/* Notes */}
              <section>
                <label className="text-xs text-gray-500 mb-1 block">Notas internas (opcional)</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} placeholder="Condições especiais, prazo de entrega, etc."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-900 focus:outline-none resize-none" />
              </section>
            </div>

            {/* Panel footer */}
            <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-gray-900">
              <button onClick={() => setPanelOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <div className="flex gap-2">
                <button onClick={() => save('rascunho')} disabled={saving || !form.items.length}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
                  Guardar Rascunho
                </button>
                <button onClick={() => save('enviada')} disabled={saving || !form.items.length}
                  className="px-4 py-2 text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors disabled:opacity-40 font-medium">
                  {saving ? 'A guardar...' : 'Guardar e Marcar Enviada'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
