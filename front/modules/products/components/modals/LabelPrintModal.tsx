import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Printer, Plus, Minus, Trash2, Tag, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Loader2, Zap } from 'lucide-react';
import { Product } from '../../../core/types/product';
import api from '../../../core/services/apiClient';

interface LabelPrintModalProps {
  products: Product[];
  preselected?: Product[];
  open: boolean;
  onClose: () => void;
  /** Called after barcodes are auto-assigned so the parent can refresh its product list */
  onBarcodeAssigned?: () => void;
}

interface LabelItem { product: Product; qty: number; }
type Step = 'select' | 'format';

// ─── Barcode formats ──────────────────────────────────────────────────────────
const BARCODE_FORMATS = [
  { id: 'UPC',     name: 'UPC-A',            desc: '12 dígitos numéricos' },
  { id: 'UPC_E',   name: 'UPC-E',            desc: '6 dígitos comprimido' },
  { id: 'CODE128', name: 'Code 128',          desc: 'Alfanumérico universal' },
  { id: 'EAN13',   name: 'EAN-13',            desc: '13 dígitos — padrão EU' },
  { id: 'EAN8',    name: 'EAN-8',             desc: '8 dígitos — compacto' },
  { id: 'CODE39',  name: 'Code 39',           desc: 'Alfanumérico industrial' },
  { id: 'ITF14',   name: 'Interleaved 2/5',   desc: 'Numérico entrelacado' },
  { id: 'codabar', name: 'Codabar',           desc: 'Bibliotecas e saúde' },
  { id: 'postnet', name: 'PostNet',           desc: 'Códigos postais ZIP' },
];

// ─── Label sizes ──────────────────────────────────────────────────────────────
const LABEL_SIZES = [
  { id: 'a4-sm',  name: 'Pequena',      dim: '31 × 17 mm', paper: 'Folha A4', isBobina: false },
  { id: 'a4-md',  name: 'Média',        dim: '50 × 25 mm', paper: 'Folha A4', isBobina: false },
  { id: 'a4-lg',  name: 'Grande',       dim: '80 × 50 mm', paper: 'Folha A4', isBobina: false },
  { id: 'bob-40', name: 'Bobina 40mm',  dim: '40 × 25 mm', paper: 'Bobina 40mm', isBobina: true },
  { id: 'bob-50', name: 'Bobina 50mm',  dim: '50 × 30 mm', paper: 'Bobina 50mm', isBobina: true },
  { id: 'bob-80', name: 'Bobina 80mm',  dim: '80 × 50 mm', paper: 'Bobina 80mm', isBobina: true },
];

// ─── Mini barcode stripe SVG ──────────────────────────────────────────────────
const BarcodeStripes: React.FC<{ format: string; w?: number; h?: number }> = ({ format, w = 80, h = 30 }) => {
  // Bar-then-space width sequences per format
  const patterns: Record<string, number[]> = {
    CODE128: [1,1, 2,1, 1,2, 2,1, 1,1, 2,1, 1,2, 1,1, 2,1, 1,1],
    EAN13:   [1,1, 1,1, 2,1, 1,1, 1,1, 1,2, 2,1, 1,1, 2,1, 1,1, 1,1, 2,1],
    EAN8:    [1,1, 2,1, 1,1, 2,1, 1,1, 1,2, 1,1, 2,1],
    UPC:     [1,1, 2,1, 1,2, 1,1, 2,1, 1,1, 2,1, 1,2, 1,1, 2,1],
    UPC_E:   [2,1, 1,1, 2,1, 1,2, 1,1, 2,1],
    CODE39:  [2,1, 1,1, 1,3, 2,1, 1,1, 1,3, 2,1, 1,1],
    ITF14:   [3,1, 1,1, 3,1, 1,1, 3,1, 1,1, 3,1, 1,1],
    codabar: [1,1, 2,1, 1,1, 2,1, 1,2, 1,1, 2,1, 1,1],
    postnet: [1,2, 1,2, 1,2, 1,2, 1,2, 1,2, 1,2, 1,2, 1,2, 1,2],
  };
  const pat = patterns[format] || patterns.CODE128;
  const total = pat.reduce((s, v) => s + v, 0);
  const scale = (w - 4) / total;

  let x = 2;
  const bars: React.ReactElement[] = [];
  pat.forEach((width, i) => {
    const pw = width * scale;
    if (i % 2 === 0) {
      bars.push(<rect key={i} x={x} y={2} width={Math.max(0.5, pw)} height={h - 10} fill="#111" />);
    }
    x += pw;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <rect width={w} height={h} fill="white" />
      {bars}
      <text x={w / 2} y={h - 1} textAnchor="middle" fontSize={6} fill="#666" fontFamily="monospace">
        {format === 'postnet' ? '12345' : format === 'UPC_E' ? '123456' : '0123456789'}
      </text>
    </svg>
  );
};

// ─── Print HTML builder ───────────────────────────────────────────────────────
function buildPrintHtml(items: LabelItem[], format: string, sizeId: string): string {
  const fmt = (n: number) => `MT ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Generate a safe code for the chosen format
  const getCode = (p: Product): string => {
    const raw = p.barcode?.trim();
    if (raw) return raw;
    const digits = String(p.id).replace(/\D/g, '').padStart(13, '0');
    if (format === 'EAN13') return digits.slice(0, 13);
    if (format === 'EAN8')  return digits.slice(0, 8);
    if (format === 'UPC')   return digits.slice(0, 12);
    if (format === 'UPC_E') return digits.slice(0, 6);
    if (format === 'ITF14') return digits.slice(0, 14);
    if (format === 'postnet') return digits.slice(0, 5);
    return digits.slice(0, 12);
  };

  const expanded: Product[] = [];
  items.forEach(({ product, qty }) => { for (let i = 0; i < qty; i++) expanded.push(product); });

  const sizeConfigs: Record<string, { page: string; labelCss: string; wrapCss: string; barH: number; showQr: boolean }> = {
    'a4-sm':  { page: '@page{size:A4;margin:8mm}', labelCss: 'width:31mm;height:17mm;padding:1.5mm 2mm;', wrapCss: 'display:flex;flex-wrap:wrap;gap:1.5mm;', barH: 9,  showQr: false },
    'a4-md':  { page: '@page{size:A4;margin:10mm}', labelCss: 'width:50mm;height:25mm;padding:2mm 3mm;', wrapCss: 'display:flex;flex-wrap:wrap;gap:2mm;',   barH: 12, showQr: false },
    'a4-lg':  { page: '@page{size:A4;margin:10mm}', labelCss: 'width:80mm;height:50mm;padding:3mm 4mm;', wrapCss: 'display:flex;flex-wrap:wrap;gap:3mm;',   barH: 18, showQr: true  },
    'bob-40': { page: '@page{size:40mm 25mm;margin:1.5mm}', labelCss: 'width:37mm;height:22mm;padding:1.5mm 2mm;page-break-after:always;', wrapCss: 'display:block;', barH: 11, showQr: false },
    'bob-50': { page: '@page{size:50mm 30mm;margin:1.5mm}', labelCss: 'width:47mm;height:27mm;padding:2mm;page-break-after:always;',      wrapCss: 'display:block;', barH: 13, showQr: false },
    'bob-80': { page: '@page{size:80mm 50mm;margin:2mm}',   labelCss: 'width:76mm;height:46mm;padding:2mm 3mm;page-break-after:always;',  wrapCss: 'display:block;', barH: 18, showQr: true  },
  };

  const cfg = sizeConfigs[sizeId] || sizeConfigs['a4-md'];

  const labelHtml = (p: Product): string => {
    const c = getCode(p);
    const nm = esc(p.name.substring(0, 40));
    const price = fmt(Number(p.price));
    const barSvg = `<svg class="bc" data-value="${c}" data-fmt="${format}" style="width:100%;height:${cfg.barH}mm;display:block;"></svg>`;
    const qrImg  = cfg.showQr ? `<img class="qr" data-text="${c}" style="width:18mm;height:18mm;flex-shrink:0;" />` : '';
    const textCol = `<div style="flex:1;min-width:0;overflow:hidden;display:flex;flex-direction:column;gap:0.5mm;">
      <div style="font-size:${cfg.showQr ? 7 : 6}pt;font-weight:700;line-height:1.2;overflow:hidden;">${nm}</div>
      <div style="font-size:${cfg.showQr ? 7 : 6}pt;font-weight:700;">${price}</div>
      ${cfg.showQr ? barSvg : ''}
    </div>`;

    if (cfg.showQr) {
      return `${textCol}<div style="display:flex;flex-direction:column;align-items:center;gap:1.5mm;flex-shrink:0;">${qrImg}</div>`;
    }
    return `${textCol}<div style="flex:1.2;display:flex;align-items:center;">${barSvg}</div>`;
  };

  const labelsHtml = expanded.map(p =>
    `<div style="${cfg.labelCss}display:flex;flex-direction:row;align-items:center;gap:2mm;border:0.3pt solid #ddd;box-sizing:border-box;overflow:hidden;font-family:Arial,sans-serif;">
      ${labelHtml(p)}
    </div>`
  ).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Etiquetas</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>
<style>
  ${cfg.page}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; }
  .labels { ${cfg.wrapCss} }
  svg.bc { max-width: 100% !important; }
</style>
</head>
<body>
<div class="labels">
${labelsHtml}
</div>
<script>
window.onload = function() {
  document.querySelectorAll('svg.bc').forEach(function(svg) {
    var val = svg.dataset.value;
    var fmt = svg.dataset.fmt || 'CODE128';
    if (!val) return;
    try {
      JsBarcode(svg, val, { format: fmt, displayValue: true, width: 1.3, height: 30, fontSize: 8, margin: 2 });
    } catch(e) {
      try { JsBarcode(svg, val, { format: 'CODE128', displayValue: true, width: 1.3, height: 30, fontSize: 8, margin: 2 }); } catch(e2) {}
    }
  });
  var qrs = document.querySelectorAll('img.qr');
  var pending = qrs.length;
  function doPrint() { setTimeout(function(){ window.print(); }, 300); }
  if (pending === 0) { doPrint(); return; }
  qrs.forEach(function(img) {
    QRCode.toDataURL(img.dataset.text || '?', { width: 128, margin: 1 }, function(err, url) {
      if (!err) img.src = url;
      if (--pending === 0) doPrint();
    });
  });
};
<\/script>
</body>
</html>`;
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export const LabelPrintModal: React.FC<LabelPrintModalProps> = ({ products, preselected = [], open, onClose, onBarcodeAssigned }) => {
  const [step, setStep]       = useState<Step>('select');
  const [search, setSearch]   = useState('');
  const [queue, setQueue]     = useState<Map<string, LabelItem>>(() => {
    const m = new Map<string, LabelItem>();
    preselected.forEach(p => m.set(p.id, { product: p, qty: 1 }));
    return m;
  });
  const [selectedFormat, setSelectedFormat] = useState('CODE128');
  const [selectedSize, setSelectedSize]     = useState('a4-md');

  // Local copy of products so we can update barcodes immediately without waiting for parent reload
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  useEffect(() => { setLocalProducts(products); }, [products]);

  // Barcode generation state
  const [generatingAll, setGeneratingAll] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? localProducts.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
      : localProducts;
  }, [localProducts, search]);

  const queueList   = Array.from(queue.values());
  const totalLabels = queueList.reduce((s, i) => s + i.qty, 0);

  const toggleProduct = (p: Product) => {
    setQueue(prev => {
      const m = new Map(prev);
      if (m.has(p.id)) m.delete(p.id); else m.set(p.id, { product: p, qty: 1 });
      return m;
    });
  };

  const setQty = (id: string, delta: number) => {
    setQueue(prev => {
      const m = new Map(prev);
      const item = m.get(id);
      if (!item) return m;
      m.set(id, { ...item, qty: Math.max(1, item.qty + delta) });
      return m;
    });
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => { const m = new Map(prev); m.delete(id); return m; });
  };

  // Products without barcodes across the full catalogue
  const missingInAll = useMemo(
    () => localProducts.filter(p => !p.barcode?.trim()),
    [localProducts]
  );

  // Generate EAN-13 for ALL products that still lack a barcode, update local state immediately
  const generateAllBarcodes = async () => {
    if (missingInAll.length === 0 || generatingAll) return;
    setGeneratingAll(true);
    try {
      const ids = missingInAll.map(p => p.id);
      const { assigned } = await api.post<{ assigned: { id: string; barcode: string }[] }>(
        '/products/bulk-assign-barcodes',
        { productIds: ids }
      );
      if (assigned.length > 0) {
        const barcodeMap = new Map(assigned.map(a => [a.id, a.barcode]));

        // 1. Update the full local product list immediately
        setLocalProducts(prev =>
          prev.map(p => barcodeMap.has(p.id) ? { ...p, barcode: barcodeMap.get(p.id)! } : p)
        );

        // 2. Patch queue items that were already selected
        setQueue(prev => {
          const m = new Map(prev);
          assigned.forEach(({ id, barcode }) => {
            const item = m.get(id);
            if (item) m.set(id, { ...item, product: { ...item.product, barcode } });
          });
          return m;
        });

        setLastGenerated(assigned.length);
        onBarcodeAssigned?.(); // ask parent to refresh too (in background)
      }
    } catch {
      // generation failed silently — user can retry
    }
    setGeneratingAll(false);
  };

  const handlePrint = () => {
    if (!queueList.length) return;
    const html = buildPrintHtml(queueList, selectedFormat, selectedSize);
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  };

  if (!open) return null;

  const inputCls = 'w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const activeFormat = BARCODE_FORMATS.find(f => f.id === selectedFormat);
  const activeSize   = LABEL_SIZES.find(s => s.id === selectedSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Tag className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {step === 'select' ? 'Impressão de Etiquetas' : 'Formato de Código de Barras'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── STEP 1: Product selection ── */}
        {step === 'select' && (
          <div className="flex flex-1 min-h-0">
            {/* Left — product list */}
            <div className="flex-1 flex flex-col min-h-0 border-r border-gray-200 dark:border-gray-700">

              {/* Barcode generation banner */}
              {missingInAll.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-800 dark:text-amber-300">
                      <strong>{missingInAll.length}</strong> produto{missingInAll.length > 1 ? 's' : ''} sem código de barras
                    </span>
                  </div>
                  <button
                    onClick={generateAllBarcodes}
                    disabled={generatingAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                  >
                    {generatingAll
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> A gerar...</>
                      : <><Zap className="w-3 h-3" /> Gerar todos os códigos</>
                    }
                  </button>
                </div>
              )}
              {lastGenerated > 0 && missingInAll.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                    {lastGenerated} código{lastGenerated > 1 ? 's' : ''} EAN-13 gerado{lastGenerated > 1 ? 's' : ''} e guardado{lastGenerated > 1 ? 's' : ''} com sucesso!
                  </span>
                </div>
              )}

              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    className={inputCls} placeholder="Pesquisar produto..." />
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-8">Sel.</th>
                      <th className="px-2 py-2 w-10"></th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Produto</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Preço</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Código</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Stock</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Categoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filtered.map(p => {
                      const inQueue = queue.has(p.id);
                      const img = p.image || (p as any).image_url || (p as any).imageUrl;
                      return (
                        <tr key={p.id} onClick={() => toggleProduct(p)}
                          className={`cursor-pointer transition-colors ${inQueue ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                          <td className="px-3 py-1.5 text-center">
                            {inQueue && <span className="text-blue-600 font-bold text-sm">✓</span>}
                          </td>
                          <td className="px-2 py-1">
                            {img ? (
                              <img src={img} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 dark:border-gray-700" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-300 text-xs">?</div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-white text-sm">{p.name}</td>
                          <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300 text-sm">MT {Number(p.price).toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-center font-mono text-xs">
                            {p.barcode
                              ? <span className="text-gray-600 dark:text-gray-400">{p.barcode}</span>
                              : <span className="text-amber-500 font-medium text-[10px] bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">auto</span>
                            }
                          </td>
                          <td className="px-3 py-1.5 text-center text-gray-500 dark:text-gray-400 text-sm">{p.stock}</td>
                          <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 text-xs">{p.category}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Nenhum produto encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right — print queue */}
            <div className="w-72 flex flex-col bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="font-semibold text-gray-900 dark:text-white text-sm">Lista de Impressão</span>
                {queueList.length > 0 && (
                  <button onClick={() => setQueue(new Map())} className="text-gray-400 hover:text-red-500 transition-colors" title="Limpar lista">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto divide-y divide-gray-200 dark:divide-gray-700">
                {queueList.map(({ product, qty }) => {
                  const img = product.image || (product as any).image_url || (product as any).imageUrl;
                  return (
                  <div key={product.id} className="flex items-center gap-2 px-3 py-2">
                    {img ? (
                      <img src={img} alt="" className="w-8 h-8 rounded-md object-cover border border-gray-100 dark:border-gray-700 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-700 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{product.barcode || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(product.id, -1)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-gray-900 dark:text-white">{qty}</span>
                      <button onClick={() => setQty(product.id, +1)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button onClick={() => removeFromQueue(product.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  );
                })}
                {queueList.length === 0 && (
                  <p className="px-4 py-6 text-center text-gray-400 text-sm">Clique nos produtos para adicionar</p>
                )}
              </div>

              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <button onClick={() => setStep('format')} disabled={queueList.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors text-sm">
                  <Printer className="w-4 h-4" />
                  IMPRIMIR {totalLabels > 0 ? totalLabels : ''}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Format + size selection ── */}
        {step === 'format' && (
          <div className="flex flex-1 min-h-0">
            {/* Left — format grid */}
            <div className="flex-1 flex flex-col min-h-0 overflow-auto p-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Formato do Código de Barras</p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {BARCODE_FORMATS.map(f => (
                  <button key={f.id} onClick={() => setSelectedFormat(f.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-center ${
                      selectedFormat === f.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}>
                    <div className={`rounded overflow-hidden ${selectedFormat === f.id ? 'ring-1 ring-blue-300' : ''}`}>
                      <BarcodeStripes format={f.id} w={80} h={32} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white leading-tight">{f.name}</p>
                      <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{f.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Tamanho da Etiqueta</p>
              <div className="grid grid-cols-3 gap-2">
                {LABEL_SIZES.map(s => (
                  <button key={s.id} onClick={() => setSelectedSize(s.id)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                      selectedSize === s.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${s.isBobina ? 'bg-orange-400' : 'bg-green-400'}`} />
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{s.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{s.dim}</span>
                    <span className="text-[10px] text-gray-400">{s.paper}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right — preview panel */}
            <div className="w-72 flex flex-col items-center bg-gray-50 dark:bg-gray-800/50 border-l border-gray-200 dark:border-gray-700 p-5 gap-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 self-start">Pré-visualização</p>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col items-center gap-3 w-full">
                <BarcodeStripes format={selectedFormat} w={160} h={52} />
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{activeFormat?.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{activeFormat?.desc}</p>
                </div>
                <div className="w-full pt-2 border-t border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{activeSize?.name} — {activeSize?.dim}</p>
                  <p className="text-[11px] text-gray-400">{activeSize?.paper}</p>
                </div>
              </div>

              <div className="w-full p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  Produtos sem código próprio receberão um código numérico gerado automaticamente compatível com o formato <strong>{activeFormat?.name}</strong>.
                </p>
              </div>

              <div className="w-full text-center">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400">{queueList.length} produto{queueList.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer (format step) */}
        {step === 'format' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button onClick={() => setStep('select')}
              className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors text-sm">
              <Printer className="w-4 h-4" />
              Imprimir {totalLabels} Etiqueta{totalLabels !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
