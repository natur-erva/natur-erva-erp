/**
 * Modal para criar nova auditoria de stock
 */
import React, { useState, useMemo } from 'react';
import { ModalPortal } from '../../../core/components/ui/ModalPortal';
import { X, ClipboardCheck, Calendar, FileText } from 'lucide-react';
import { Product, StockAuditScope } from '../../../core/types/types';
import { stockAuditService } from '../../services/stockAuditService';
import { useLanguage } from '../../../core/contexts/LanguageContext';
import { getTodayDateString } from '../../../core/utils/dateUtils';


interface CreateAuditModalProps {
    open: boolean;
    onClose: () => void;
    products: Product[];
    onSuccess: () => void;
    showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const CreateAuditModal: React.FC<CreateAuditModalProps> = ({
    open,
    onClose,
    products,
    onSuccess,
    showToast
}) => {
    const { t } = useLanguage();
    const [auditDate, setAuditDate] = useState<string>(() => getTodayDateString());
    const [description, setDescription] = useState<string>('');
    const [scope, setScope] = useState<StockAuditScope>(StockAuditScope.ALL);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [creating, setCreating] = useState(false);

    // Categorias únicas dos produtos
    const categories = useMemo(() => {
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        return Array.from(cats).sort();
    }, [products]);

    // Reset form
    const resetForm = () => {
        setAuditDate(getTodayDateString());
        setDescription('');
        setScope(StockAuditScope.ALL);
        setSelectedProductIds([]);
        setSelectedCategory('');
    };

    // Toggle product selection
    const toggleProduct = (productId: string) => {
        setSelectedProductIds(prev =>
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    // Select all products
    const selectAllProducts = () => {
        setSelectedProductIds(products.map(p => p.id));
    };

    // Deselect all products
    const deselectAllProducts = () => {
        setSelectedProductIds([]);
    };

    // Submeter auditoria
    const handleSubmit = async () => {
        if (!auditDate) {
            showToast(t.stock.selectDateWarning, 'warning');
            return;
        }

        if (scope === StockAuditScope.SELECTED && selectedProductIds.length === 0) {
            showToast(t.stock.selectProductWarning, 'warning');
            return;
        }

        if (scope === StockAuditScope.CATEGORY && !selectedCategory) {
            showToast(t.stock.selectCategoryWarning, 'warning');
            return;
        }

        setCreating(true);
        try {
            let scopeFilter: any = null;

            if (scope === StockAuditScope.SELECTED) {
                scopeFilter = { productIds: selectedProductIds };
            } else if (scope === StockAuditScope.CATEGORY) {
                scopeFilter = { category: selectedCategory };
            }

            const result = await stockAuditService.createAudit(
                auditDate,
                description.trim() || undefined,
                scope,
                scopeFilter,
                products
            );

            if (result.audit) {
                showToast(t.stock.auditCreatedSuccess, 'success');
                onSuccess();
                resetForm();
                onClose();
            } else {
                showToast(result.error || t.stock.errorCreatingAudit, 'error');
            }
        } catch (e: any) {
            showToast(e.message || t.stock.errorCreatingAudit, 'error');
        } finally {
            setCreating(false);
        }
    };

    if (!open) return null;

    return (
        <ModalPortal open={open} onClose={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {t.stock.newAudit}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Data */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            <Calendar className="w-4 h-4 inline mr-1" />
                            {t.stock.auditDateLabel}
                        </label>
                        <input
                            type="date"
                            value={auditDate}
                            onChange={(e) => setAuditDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            <FileText className="w-4 h-4 inline mr-1" />
                            {t.stock.descriptionOptional}
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder={t.stock.descriptionPlaceholder}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        />
                    </div>

                    {/* Âmbito */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t.stock.auditScope}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setScope(StockAuditScope.ALL)}
                                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${scope === StockAuditScope.ALL
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                {t.stock.allProducts}
                            </button>
                            <button
                                type="button"
                                onClick={() => setScope(StockAuditScope.SELECTED)}
                                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${scope === StockAuditScope.SELECTED
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                {t.stock.specificProducts}
                            </button>
                            <button
                                type="button"
                                onClick={() => setScope(StockAuditScope.CATEGORY)}
                                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${scope === StockAuditScope.CATEGORY
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                {t.stock.byCategory}
                            </button>
                        </div>
                    </div>

                    {/* Seleção de Produtos Específicos */}
                    {scope === StockAuditScope.SELECTED && (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t.stock.selectProducts} ({selectedProductIds.length} {t.stock.productsSelected})
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={selectAllProducts}
                                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                    >
                                        {t.stock.selectAll}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={deselectAllProducts}
                                        className="text-xs text-gray-600 hover:text-gray-700 dark:text-gray-400"
                                    >
                                        {t.stock.clear}
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {products.map(product => (
                                    <label
                                        key={product.id}
                                        className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedProductIds.includes(product.id)}
                                            onChange={() => toggleProduct(product.id)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-900 dark:text-white">
                                            {product.name}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Seleção de Categoria */}
                    {scope === StockAuditScope.CATEGORY && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t.common.category}
                            </label>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">{t.stock.selectCategoryPlaceholder}</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Info */}
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            <strong>{t.common.notes}:</strong> {t.stock.creationNote}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        {t.common.cancel}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={creating}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                        {creating ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                {t.stock.creatingAudit}
                            </>
                        ) : (
                            <>
                                <ClipboardCheck className="w-4 h-4" />
                                {t.stock.createAudit}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </ModalPortal>
    );
};
