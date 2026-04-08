import React from 'react';
import { StockMovement } from '../../../core/types/types';
import { Modal } from '../shared/Modal';

export interface StockInsight {
  productName: string;
  variant?: string;
  stockQty: number;
  orderedQty: number;
  difference: number;
}

interface StockViewModalProps {
  open: boolean;
  stock: StockMovement | null;
  onClose: () => void;
  insights?: StockInsight[];
}

export const StockViewModal: React.FC<StockViewModalProps> = ({
  open,
  stock,
  onClose,
  insights = [],
}) => {
  if (!open || !stock) return null;

  return (
    <Modal open={open} onClose={onClose} title="Detalhes da Atualização de Stock" maxWidth="xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data</label>
          <p className="text-gray-900 dark:text-white">{new Date(stock.date).toLocaleDateString('pt-MZ')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Itens ({stock.items.length})
          </label>
          <div className="space-y-2">
            {stock.items.map((item, idx) => (
              <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.productName}</div>
                    {item.variant && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">Variação: {item.variant}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {item.quantity} {item.unit || 'un'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {stock.notes && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
            <p className="text-gray-900 dark:text-white">{stock.notes}</p>
          </div>
        )}

        {insights.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Comparação com Pedidos
            </label>
            <div className="space-y-2">
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {insight.productName} {insight.variant && `(${insight.variant})`}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Stock: {insight.stockQty} | Pedidos: {insight.orderedQty}
                      </div>
                    </div>
                    <div
                      className={`font-medium ${insight.difference > 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {insight.difference > 0 ? '+' : ''}{insight.difference.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
