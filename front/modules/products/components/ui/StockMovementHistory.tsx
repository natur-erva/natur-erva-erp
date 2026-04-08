/**
 * Stock Movement History Component
 * Exibe histórico de movimentos de stock de um produto
 */
import React, { useState, useEffect } from 'react';
import { Package, ShoppingCart, AlertCircle, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { stockMovementService, StockMovement } from '../../services/stockMovementService';
import { useLanguage } from '../../../core/contexts/LanguageContext';


interface StockMovementHistoryProps {
    productId: string;
    variantId?: string;
    auditDate: string;
    limit?: number;
}

export const StockMovementHistory: React.FC<StockMovementHistoryProps> = ({
    productId,
    variantId,
    auditDate,
    limit = 20
}) => {
    const { t } = useLanguage();
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        loadMovements();
    }, [productId, variantId, auditDate]);

    const loadMovements = async () => {
        setLoading(true);
        try {
            // Buscar movimentos até a data da auditoria
            const data = await stockMovementService.getProductMovementHistory(
                productId,
                variantId,
                undefined, // dateFrom
                auditDate,  // dateTo
                limit
            );
            setMovements(data);
        } catch (error) {
            console.error('Erro ao carregar movimentos:', error);
        } finally {
            setLoading(false);
        }
    };

    const getMovementIcon = (type: string) => {
        switch (type) {
            case 'purchase':
                return <Package className="w-4 h-4" />;
            case 'order':
                return <ShoppingCart className="w-4 h-4" />;
            case 'adjustment':
                return <AlertCircle className="w-4 h-4" />;
            case 'transfer':
                return <Package className="w-4 h-4 rotate-90" />;
            case 'return':
                return <TrendingUp className="w-4 h-4" />;
            case 'waste':
                return <TrendingDown className="w-4 h-4" />;
            default:
                return <Package className="w-4 h-4" />;
        }
    };

    const getMovementColor = (type: string) => {
        switch (type) {
            case 'purchase':
                return 'text-green-600 bg-green-50 dark:bg-green-900/20';
            case 'order':
                return 'text-red-600 bg-red-50 dark:bg-red-900/20';
            case 'adjustment':
                return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
            case 'transfer':
                return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
            case 'return':
                return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
            case 'waste':
                return 'text-rose-600 bg-rose-50 dark:bg-rose-900/20';
            default:
                return 'text-gray-600 bg-gray-50 dark:bg-gray-800';
        }
    };

    const getMovementLabel = (type: string) => {
        switch (type) {
            case 'purchase':
                return t.stock.movementTypes.purchase;
            case 'order':
                return t.stock.movementTypes.order;
            case 'adjustment':
                return t.stock.movementTypes.adjustment;
            case 'transfer':
                return t.stock.movementTypes.transfer;
            case 'return':
                return t.stock.movementTypes.return;
            case 'waste':
                return t.stock.movementTypes.waste;
            default:
                return t.stock.movementTypes.generic;
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{t.stock.loadingHistory}</span>
            </div>
        );
    }

    if (movements.length === 0) {
        return (
            <div className="py-8 text-center">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t.stock.noMovementsFound} {t.stock.until.toLowerCase()} {formatDate(auditDate)}
                </p>
            </div>
        );
    }

    // Calcular balance esperado
    const totalChange = movements.reduce((sum, m) => sum + m.quantity, 0);

    return (
        <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t.stock.movementHistory} ({t.stock.lastMovements.replace('{count}', movements.length.toString())})
                </h4>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                    {t.stock.until} {formatDate(auditDate)}
                </div>
            </div>

            <div className="space-y-3">
                {movements.map((movement) => (
                    <div
                        key={movement.id}
                        className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                        {/* Icon */}
                        <div className={`p-2 rounded-lg ${getMovementColor(movement.type)}`}>
                            {getMovementIcon(movement.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                                            {getMovementLabel(movement.type)}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {formatDate(movement.date)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                                        {movement.reference}
                                    </p>
                                    {movement.notes && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            {movement.notes}
                                        </p>
                                    )}
                                </div>

                                {/* Quantity */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {movement.quantity > 0 ? (
                                        <TrendingUp className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <TrendingDown className="w-4 h-4 text-red-600" />
                                    )}
                                    <span className={`text-sm font-semibold ${movement.quantity > 0
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                        }`}>
                                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                        {t.stock.totalVariation}:
                    </span>
                    <span className={`font-semibold ${totalChange > 0
                        ? 'text-green-600'
                        : totalChange < 0
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}>
                        {totalChange > 0 ? '+' : ''}{totalChange} un
                    </span>
                </div>
            </div>
        </div>
    );
};
