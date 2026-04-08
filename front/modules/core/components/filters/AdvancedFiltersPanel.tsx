import React from 'react';

export interface AdvancedFiltersPanelProps {
  title?: string;
  description?: string;
  isOpen: boolean;
  isStickyOnMobile?: boolean;
  stickyTopClassName?: string;
  className?: string;
  children: React.ReactNode;
}

export const AdvancedFiltersPanel: React.FC<AdvancedFiltersPanelProps> = ({
  title = 'Filtros Avançados',
  description = 'Filtros adicionais para busca mais especé­fica',
  isOpen,
  isStickyOnMobile = false,
  stickyTopClassName = 'top-[45px]',
  className = '',
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={[
        'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-2 mb-2',
        isStickyOnMobile ? `sticky ${stickyTopClassName} z-30` : '',
        className,
      ].join(' ')}
    >
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      {children}
    </div>
  );
};



