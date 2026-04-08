import React from 'react';
import { ModalPortal } from '../../../core/components/ui/ModalPortal';
import { X, Printer } from 'lucide-react';
import { Purchase } from '../../../core/types/types';

interface PurchaseViewerModalProps {
  open: boolean;
  purchase: Purchase | null;
  onClose: () => void;
  onPrint?: (purchase: Purchase) => void;
}

const formatMoney = (value: number) => {
  return value.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' }).replace(/MZN/gi, 'MT');
};

export const PurchaseViewerModal: React.FC<PurchaseViewerModalProps> = ({ open, purchase, onClose, onPrint }) => {
  if (!purchase) return null;

  return (
    <ModalPortal open={open} onClose={onClose} zIndex={10001}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalhes da Compra</h2>
          <div className="flex gap-2">
            {onPrint && (
              <button
                onClick={() => onPrint(purchase)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors text-sm"
                title="Imprimir fatura"
              >
                <Printer className="w-4 h-4" />
                Imprimir Fatura
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data</label>
              <p className="text-gray-900 dark:text-white">
                {new Date(purchase.date).toLocaleDateString('pt-MZ')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fornecedor</label>
              <p className="text-gray-900 dark:text-white">{purchase.supplierName || 'Sem fornecedor'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fatura</label>
              <p className="text-gray-900 dark:text-white">{purchase.invoiceNumber || '—'}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Itens</label>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 font-medium">Variação</th>
                    <th className="px-3 py-2 font-medium text-right">Qtd</th>
                    <th className="px-3 py-2 font-medium">Unidade</th>
                    <th className="px-3 py-2 font-medium text-right">Preço unit.</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900 dark:text-white divide-y divide-gray-200 dark:divide-gray-600">
                  {(() => {
                    const groups = new Map<string, { items: typeof purchase.items; totalQty: number; totalValue: number }>();
                    for (const item of purchase.items) {
                      const key = item.productName ?? item.productId ?? '';
                      if (!groups.has(key)) groups.set(key, { items: [], totalQty: 0, totalValue: 0 });
                      const g = groups.get(key)!;
                      g.items.push(item);
                      g.totalQty += item.quantity;
                      g.totalValue += (item.total ?? item.totalPrice ?? item.quantity * (item.costPrice ?? item.unitPrice ?? 0));
                    }
                    const rows: React.ReactNode[] = [];
                    groups.forEach((group, productName) => {
                      group.items.forEach((item, i) => {
                        rows.push(
                          <tr key={`${productName}-${i}`} className="bg-white dark:bg-gray-800">
                            <td className="px-3 py-2">{i === 0 ? item.productName : '—'}</td>
                            <td className="px-3 py-2">{item.variant ?? '—'}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2">{item.unit ?? 'un'}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(item.costPrice ?? item.unitPrice ?? 0)}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(item.total ?? item.totalPrice ?? 0)}</td>
                          </tr>
                        );
                      });
                      rows.push(
                        <tr key={`sub-${productName}`} className="bg-gray-50 dark:bg-gray-700 font-medium">
                          <td className="px-3 py-2" colSpan={2}>Subtotal: {productName}</td>
                          <td className="px-3 py-2 text-right">{group.totalQty}</td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2 text-right">—</td>
                          <td className="px-3 py-2 text-right">{formatMoney(group.totalValue)}</td>
                        </tr>
                      );
                    });
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">Total:</span>
              <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                {formatMoney(purchase.totalAmount)}
              </span>
            </div>
          </div>
          {purchase.notes && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
              <p className="text-gray-900 dark:text-white">{purchase.notes}</p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
};
