import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, FileText, TrendingUp, Receipt, Printer, Store, CheckCircle, XCircle, Clock, Upload, Image, Palette, RotateCcw } from 'lucide-react';
import api from '../../core/services/apiClient';
import { uploadService } from '../../../services/uploadService';
import { invalidateLogoCache } from '../../core/services/systemSettingsService';
import { applyTheme, applyFontFamily, applyBorderRadius, FONT_OPTIONS, RADIUS_OPTIONS, COLOR_PRESETS } from '../../core/utils/theme';
import type { Toast } from '../../core/components/ui/Toast';

interface FinancasProps {
  showToast?: (msg: string, type: Toast['type']) => void;
}

type TaxConfig = {
  companyName: string; companyNuit: string; companyAddress: string;
  companyPhone: string; companyEmail: string;
  vatRate: number; invoicePrefix: string;
  logoUrl?: string; logoIconUrl?: string;
};

type TaxReport = {
  vatRate: number; ordersCount: number;
  totalIncVat: number; totalExVat: number; totalVat: number;
  byMonth: { month: string; count: number; incVat: number; exVat: number; vat: number }[];
};

const fmt = (n: number) => `MT ${Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const TAB = { CONFIG: 'config', REPORT: 'report', SESSIONS: 'sessions', APARENCIA: 'aparencia' } as const;

const DEFAULT_COLOR = '#059669';

const thisMonth = () => {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${new Date(y, d.getMonth() + 1, 0).getDate()}` };
};

export const Financas: React.FC<FinancasProps> = ({ showToast }) => {
  const [tab, setTab] = useState<'config' | 'report' | 'sessions' | 'aparencia'>(TAB.CONFIG);

  // Theme state
  const [themeColor, setThemeColor]   = useState(DEFAULT_COLOR);
  const [themeFont, setThemeFont]     = useState('Inter');
  const [themeRadius, setThemeRadius] = useState('default');
  const [savingTheme, setSavingTheme] = useState(false);
  type Session = { id: string; cashierName: string; openedAt: string; closedAt?: string; initialAmount: number; isOpen: boolean; totalSales: number; totalOrders: number; summary?: any };
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [config, setConfig] = useState<TaxConfig>({
    companyName: '', companyNuit: '', companyAddress: '',
    companyPhone: '', companyEmail: '', vatRate: 16, invoicePrefix: 'FACT',
    logoUrl: '', logoIconUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [reportStart, setReportStart] = useState(thisMonth().start);
  const [reportEnd, setReportEnd] = useState(thisMonth().end);
  const [report, setReport] = useState<TaxReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    api.get<any>('/tax/config').then(c => {
      if (c && c.companyName !== undefined) setConfig(c);
      if (c?.themePrimaryColor) setThemeColor(c.themePrimaryColor);
      if (c?.themeFont) setThemeFont(c.themeFont);
      if (c?.themeRadius) setThemeRadius(c.themeRadius);
    }).catch(() => {});
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const updated = await api.put<TaxConfig>('/tax/config', config);
      setConfig(updated);
      invalidateLogoCache();
      window.dispatchEvent(new Event('logo:updated'));
      showToast?.('Configuração guardada', 'success');
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao guardar', 'error');
    } finally { setSaving(false); }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'logoIconUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const setUploading = field === 'logoUrl' ? setUploadingLogo : setUploadingIcon;
    setUploading(true);
    try {
      const result = await uploadService.uploadImage(file, 'logo', 1600);
      if (result?.url) {
        setConfig(p => ({ ...p, [field]: result.url }));
        showToast?.('Imagem carregada — clique em Guardar para aplicar', 'success');
      } else {
        showToast?.('Erro ao carregar imagem', 'error');
      }
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao carregar imagem', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleLoadReport = async () => {
    setLoadingReport(true);
    try {
      const r = await api.get<TaxReport>(`/tax/report?start=${reportStart}&end=${reportEnd}`);
      setReport(r);
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao carregar relatório', 'error');
    } finally { setLoadingReport(false); }
  };

  const handlePrintReport = () => {
    if (!report) return;
    const rows = report.byMonth.map(m =>
      `<tr><td>${m.month}</td><td>${m.count}</td><td>${fmt(m.incVat)}</td><td>${fmt(m.exVat)}</td><td>${fmt(m.vat)}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório IVA</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin-bottom:4px}p{font-size:12px;color:#555;margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:right}th{background:#f0f0f0;text-align:center}.left{text-align:left}.total{font-weight:bold;background:#e8f5e9}</style>
</head><body>
<h1>RELATÓRIO DE IVA — ${config.companyName}</h1>
<p>NUIT: ${config.companyNuit || '—'} | Período: ${reportStart} a ${reportEnd}</p>
<table>
  <thead><tr><th class="left">Mês</th><th>Nº Vendas</th><th>Total c/IVA</th><th>Base s/IVA</th><th>IVA (${report.vatRate}%)</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="total"><td class="left"><strong>TOTAL</strong></td><td>${report.ordersCount}</td><td>${fmt(report.totalIncVat)}</td><td>${fmt(report.totalExVat)}</td><td>${fmt(report.totalVat)}</td></tr>
  </tfoot>
</table>
<p style="margin-top:16px;font-size:11px;color:#888">Gerado em ${new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Maputo' })} · IVA a entregar às Finanças: ${fmt(report.totalVat)}</p>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try { setSessions(await api.get<Session[]>('/pos/sessions')); }
    catch { showToast?.('Erro ao carregar sessões', 'error'); }
    finally { setLoadingSessions(false); }
  };

  const closeSession = async () => {
    if (!confirm('Fechar a sessão de caixa actual?')) return;
    try {
      await api.post('/pos/session/close', {});
      showToast?.('Sessão fechada', 'success');
      loadSessions();
    } catch (e: any) { showToast?.(e.message, 'error'); }
  };

  const openSession = async () => {
    const amt = window.prompt('Fundo inicial (MT):', '0');
    if (amt === null) return;
    try {
      await api.post('/pos/session/open', { initialAmount: parseFloat(amt) || 0 });
      showToast?.('Caixa aberta', 'success');
      loadSessions();
    } catch (e: any) { showToast?.(e.message, 'error'); }
  };

  const printSession = (s: Session) => {
    const PAY_LABELS: Record<string, string> = { cash: 'Dinheiro', mpesa: 'M-Pesa', transfer: 'Transferência' };
    const fmtT = (iso: string) => new Date(iso).toLocaleString('pt-PT', { timeZone: 'Africa/Maputo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const dur = () => {
      const ms = (s.closedAt ? new Date(s.closedAt) : new Date()).getTime() - new Date(s.openedAt).getTime();
      const mins = Math.floor(ms / 60000);
      return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };
    const byMethod = s.summary?.byMethod || [];
    const rowsHtml = byMethod.map((m: any) =>
      `<tr><td>${PAY_LABELS[m.method] || m.method}</td><td style="text-align:right">${m.count}</td><td style="text-align:right">${fmt(m.total)}</td></tr>`
    ).join('');
    const w = window.open('', '_blank', 'width=500,height=700');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sessão de Caixa</title>
<style>body{font-family:'Courier New',monospace;padding:20px;font-size:12px}h1{font-size:16px;text-align:center}hr{border:none;border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse}td{padding:4px 0}.bold{font-weight:bold}.center{text-align:center}.right{text-align:right}</style></head><body>
<h1>RELATÓRIO DE CAIXA</h1>
<div class="center">${config.companyName || 'NaturErva'}</div><hr>
<p>Caixa: <strong>${s.cashierName}</strong></p>
<p>Abertura: ${fmtT(s.openedAt)}</p>
${s.closedAt ? `<p>Fecho: ${fmtT(s.closedAt)}</p>` : '<p>Estado: <strong>ABERTA</strong></p>'}
<p>Duração: ${dur()}</p>
<p>Fundo inicial: <strong>${fmt(s.initialAmount)}</strong></p><hr>
<table><thead><tr><td><strong>Método</strong></td><td class="right"><strong>Nº</strong></td><td class="right"><strong>Total</strong></td></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="3">Sem vendas</td></tr>'}</tbody></table><hr>
<p class="bold">Total Vendas: ${fmt(s.totalSales)}</p>
<p class="bold">Nº Pedidos: ${s.totalOrders}</p>
${s.summary?.expectedCash !== undefined ? `<p class="bold">Fundo esperado em caixa: ${fmt(s.summary.expectedCash)}</p>` : ''}
<hr><div class="center" style="font-size:10px">Documento gerado em ${fmtT(new Date().toISOString())}</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`);
    w.document.close();
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none text-sm';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      await api.put('/tax/config', { themePrimaryColor: themeColor, themeFont, themeRadius });
      applyTheme(themeColor);
      applyFontFamily(themeFont);
      applyBorderRadius(themeRadius);
      invalidateLogoCache();
      showToast?.('Tema guardado com sucesso', 'success');
    } catch (e: any) {
      showToast?.(e.message || 'Erro ao guardar tema', 'error');
    } finally { setSavingTheme(false); }
  };

  const handleResetTheme = () => {
    setThemeColor(DEFAULT_COLOR);
    setThemeFont('Inter');
    setThemeRadius('default');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finanças / IVA</h1>
        <p className="text-sm text-gray-500 mt-1">Configuração fiscal e relatório de IVA</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {[
          { id: TAB.CONFIG,    label: 'Config. Fiscal',  icon: FileText },
          { id: TAB.REPORT,    label: 'Relatório IVA',   icon: TrendingUp },
          { id: TAB.SESSIONS,  label: 'Sessões Caixa',   icon: Store },
          { id: TAB.APARENCIA, label: 'Aparência',       icon: Palette },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id as any); if (t.id === TAB.SESSIONS) loadSessions(); }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── Configuração Fiscal ── */}
      {tab === TAB.CONFIG && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

          {/* ── Identidade Visual ── */}
          <h2 className="font-semibold text-gray-900 dark:text-white">Identidade Visual</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Logo principal */}
            <div className="space-y-2">
              <p className={labelCls}>Logotipo principal</p>
              <div className="flex items-center gap-4">
                <div className="w-24 h-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                  {config.logoUrl
                    ? <img src={config.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                    : <Image className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleUploadLogo(e, 'logoUrl')} />
                  <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 text-gray-700 dark:text-gray-300">
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingLogo ? 'A carregar…' : 'Carregar logo'}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">PNG, SVG ou JPG recomendado</p>
                </div>
              </div>
            </div>

            {/* Ícone (sidebar) */}
            <div className="space-y-2">
              <p className={labelCls}>Ícone (sidebar / favicon)</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                  {config.logoIconUrl
                    ? <img src={config.logoIconUrl} alt="Ícone" className="max-w-full max-h-full object-contain p-1" />
                    : <Image className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1">
                  <input ref={iconInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleUploadLogo(e, 'logoIconUrl')} />
                  <button onClick={() => iconInputRef.current?.click()} disabled={uploadingIcon}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 text-gray-700 dark:text-gray-300">
                    {uploadingIcon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingIcon ? 'A carregar…' : 'Carregar ícone'}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">Quadrado, preferencialmente PNG</p>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Dados da Empresa</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nome da Empresa *</label>
              <input value={config.companyName} onChange={e => setConfig(p => ({ ...p, companyName: e.target.value }))}
                className={inputCls} placeholder="NaturErva Lda." />
            </div>
            <div>
              <label className={labelCls}>NUIT</label>
              <input value={config.companyNuit} onChange={e => setConfig(p => ({ ...p, companyNuit: e.target.value }))}
                className={inputCls} placeholder="4XXXXXXXXX" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Endereço</label>
              <input value={config.companyAddress} onChange={e => setConfig(p => ({ ...p, companyAddress: e.target.value }))}
                className={inputCls} placeholder="Av. 24 de Julho, Maputo" />
            </div>
            <div>
              <label className={labelCls}>Telefone</label>
              <input value={config.companyPhone} onChange={e => setConfig(p => ({ ...p, companyPhone: e.target.value }))}
                className={inputCls} placeholder="+258 XX XXX XXXX" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={config.companyEmail} onChange={e => setConfig(p => ({ ...p, companyEmail: e.target.value }))}
                className={inputCls} placeholder="geral@natur-erva.co.mz" />
            </div>
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Configuração Fiscal</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Taxa IVA (%)</label>
              <input type="number" min={0} max={100} step={0.5}
                value={config.vatRate} onChange={e => setConfig(p => ({ ...p, vatRate: parseFloat(e.target.value) || 0 }))}
                className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Taxa actual em Moçambique: 16%</p>
            </div>
            <div>
              <label className={labelCls}>Prefixo de Factura</label>
              <input value={config.invoicePrefix} onChange={e => setConfig(p => ({ ...p, invoicePrefix: e.target.value.toUpperCase() }))}
                className={inputCls} placeholder="FACT" maxLength={10} />
              <p className="text-xs text-gray-400 mt-1">Ex: FACT → FACT/2026/0001</p>
            </div>
          </div>

          {/* Preview cálculo IVA */}
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4 text-sm space-y-1">
            <p className="font-medium text-brand-700 dark:text-brand-300">Exemplo de cálculo (preço c/ IVA: MT 116.00)</p>
            <p className="text-gray-600 dark:text-gray-400">Base tributável (s/ IVA): <strong>MT {(116 / (1 + config.vatRate / 100)).toFixed(2)}</strong></p>
            <p className="text-gray-600 dark:text-gray-400">IVA {config.vatRate}%: <strong>MT {(116 - 116 / (1 + config.vatRate / 100)).toFixed(2)}</strong></p>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSaveConfig} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Configuração
            </button>
          </div>
        </div>
      )}

      {/* ── Relatório IVA ── */}
      {tab === TAB.REPORT && (
        <div className="space-y-4">
          {/* Filtro período */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Período de Análise</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={labelCls}>Data Início</label>
                <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className={inputCls} style={{ width: 160 }} />
              </div>
              <div>
                <label className={labelCls}>Data Fim</label>
                <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className={inputCls} style={{ width: 160 }} />
              </div>
              <button onClick={handleLoadReport} disabled={loadingReport}
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm">
                {loadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Calcular
              </button>
              {/* Atalhos período */}
              {[
                { label: 'Este mês', ...thisMonth() },
                { label: 'Último mês', start: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })(), end: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0') || '12'}-${new Date(d.getFullYear(), d.getMonth(), 0).getDate()}`; })() },
                { label: 'Este ano', start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31` },
              ].map(q => (
                <button key={q.label} onClick={() => { setReportStart(q.start); setReportEnd(q.end); }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {report && (
            <>
              {/* Cards resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Nº Vendas', value: report.ordersCount.toString(), color: 'blue' },
                  { label: 'Total c/ IVA', value: fmt(report.totalIncVat), color: 'green' },
                  { label: `Base s/ IVA`, value: fmt(report.totalExVat), color: 'gray' },
                  { label: `IVA ${report.vatRate}% a entregar`, value: fmt(report.totalVat), color: 'orange' },
                ].map(c => (
                  <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
                    <p className={`text-lg font-bold mt-1 ${
                      c.color === 'green' ? 'text-green-600' :
                      c.color === 'orange' ? 'text-orange-600' :
                      c.color === 'blue' ? 'text-blue-600' : 'text-gray-900 dark:text-white'
                    }`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabela por mês */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4" />Detalhe por Mês
                  </h3>
                  <button onClick={handlePrintReport}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <Printer className="w-4 h-4" />Imprimir / Exportar
                  </button>
                </div>

                {report.byMonth.length === 0 ? (
                  <p className="text-center text-gray-400 py-12 text-sm">Sem vendas no período seleccionado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {['Mês', 'Nº Vendas', 'Total c/ IVA', 'Base s/ IVA', `IVA ${report.vatRate}%`].map(h => (
                            <th key={h} className="px-4 py-3 text-right first:text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {report.byMonth.map(m => (
                          <tr key={m.month} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{m.month}</td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{m.count}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(m.incVat)}</td>
                            <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{fmt(m.exVat)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-orange-600 dark:text-orange-400">{fmt(m.vat)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-gray-700 border-t-2 border-gray-300 dark:border-gray-500">
                        <tr>
                          <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">TOTAL</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{report.ordersCount}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">{fmt(report.totalIncVat)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{fmt(report.totalExVat)}</td>
                          <td className="px-4 py-3 text-right font-bold text-orange-600">{fmt(report.totalVat)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Nota fiscal */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 text-sm">
                <p className="font-semibold text-orange-800 dark:text-orange-300">IVA a entregar às Finanças (AT)</p>
                <p className="text-orange-700 dark:text-orange-400 mt-1">
                  No período <strong>{reportStart}</strong> a <strong>{reportEnd}</strong>, o valor de IVA a declarar e entregar é: <strong className="text-lg">{fmt(report.totalVat)}</strong>
                </p>
                <p className="text-orange-600 dark:text-orange-500 text-xs mt-2">
                  Base tributável: {fmt(report.totalExVat)} | Taxa aplicada: {report.vatRate}% | NUIT: {config.companyNuit || 'não configurado'}
                </p>
              </div>
            </>
          )}
        </div>
      )}
      {/* ── Sessões de Caixa ── */}
      {tab === TAB.SESSIONS && (
        <div className="space-y-4">
          {/* Acções globais */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={openSession}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Store className="w-4 h-4" />Abrir Nova Caixa
            </button>
            {sessions.some(s => s.isOpen) && (
              <button onClick={closeSession}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors">
                <XCircle className="w-4 h-4" />Fechar Caixa Actual
              </button>
            )}
            <button onClick={loadSessions} disabled={loadingSessions}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {loadingSessions ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Actualizar
            </button>
          </div>

          {/* Lista de sessões */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {sessions.length === 0 ? (
              <div className="text-center py-12">
                {loadingSessions
                  ? <Loader2 className="w-8 h-8 animate-spin text-gray-300 mx-auto" />
                  : <p className="text-gray-400 text-sm">Nenhuma sessão registada</p>}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {sessions.map(s => {
                  const dur = () => {
                    const ms = (s.closedAt ? new Date(s.closedAt) : new Date()).getTime() - new Date(s.openedAt).getTime();
                    const mins = Math.floor(ms / 60000);
                    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
                  };
                  const fmtDt = (iso: string) => new Date(iso).toLocaleString('pt-PT', { timeZone: 'Africa/Maputo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      {/* Estado */}
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.isOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900 dark:text-white">{s.cashierName}</span>
                          {s.isOpen && <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Aberta</span>}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {fmtDt(s.openedAt)}
                          {s.closedAt ? ` → ${fmtDt(s.closedAt)} · ${dur()}` : ` · Em curso (${dur()})`}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Fundo: {fmt(s.initialAmount)} · {s.totalOrders} venda{s.totalOrders !== 1 ? 's' : ''} · {fmt(s.totalSales)}
                        </p>
                      </div>

                      {/* Acções */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => printSession(s)} title="Imprimir relatório"
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                          <Printer className="w-4 h-4" />
                        </button>
                        {!s.isOpen && <CheckCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
                        {s.isOpen && <Clock className="w-4 h-4 text-green-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Aparência ── */}
      {tab === TAB.APARENCIA && (
        <div className="space-y-6">

          {/* Cor principal */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Cor Principal da Marca</h3>
                <p className="text-xs text-gray-500 mt-0.5">Aplica-se a botões, destaques, PDFs e toda a interface</p>
              </div>
              <div className="w-10 h-10 rounded-xl border-2 border-white shadow-md" style={{ background: themeColor }} />
            </div>

            {/* Presets */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Cores predefinidas</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setThemeColor(p.value)}
                    title={p.label}
                    className={`w-9 h-9 rounded-lg border-2 transition-all hover:scale-110 ${themeColor === p.value ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ background: p.value }}
                  />
                ))}
              </div>
            </div>

            {/* Custom picker */}
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cor personalizada</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={themeColor}
                    onChange={e => setThemeColor(e.target.value)}
                    className="w-12 h-10 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600 p-0.5 bg-white dark:bg-gray-700"
                  />
                  <input
                    type="text"
                    value={themeColor}
                    onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setThemeColor(e.target.value)}
                    className="w-28 px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Live preview badges */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Pré-visualização</p>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: themeColor }}>Botão Principal</span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: themeColor }}>Etiqueta</span>
                <span className="w-4 h-4 rounded-full" style={{ background: themeColor }} />
                <span className="text-sm font-semibold" style={{ color: themeColor }}>Texto colorido</span>
                <span className="px-3 py-1 rounded-lg text-sm border-2 font-medium" style={{ borderColor: themeColor, color: themeColor }}>Botão Outline</span>
              </div>
            </div>
          </div>

          {/* Fonte */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Tipografia</h3>
              <p className="text-xs text-gray-500 mt-0.5">Fonte usada em toda a interface da dashboard</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FONT_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setThemeFont(f.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${themeFont === f.value ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                >
                  <p className="text-base font-medium text-gray-900 dark:text-white" style={{ fontFamily: f.stack }}>{f.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: f.stack }}>Aa Bb Cc 123</p>
                </button>
              ))}
            </div>
          </div>

          {/* Border radius */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Estilo de Cantos</h3>
              <p className="text-xs text-gray-500 mt-0.5">Arredondamento dos elementos da interface</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RADIUS_OPTIONS.map(r => {
                const rStyle: Record<string, string> = {
                  sharp: '2px', default: '10px', rounded: '20px', pill: '999px',
                };
                return (
                  <button
                    key={r.value}
                    onClick={() => setThemeRadius(r.value)}
                    className={`p-3 border-2 transition-all flex flex-col items-center gap-2 ${themeRadius === r.value ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    style={{ borderRadius: rStyle[r.value] }}
                  >
                    <div className="w-10 h-7 bg-gray-200 dark:bg-gray-600" style={{ borderRadius: rStyle[r.value] }} />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleResetTheme}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Repor padrão
            </button>
            <button
              onClick={handleSaveTheme}
              disabled={savingTheme}
              className="flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {savingTheme ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Tema
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
