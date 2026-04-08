import React from 'react';

export interface FilterBarProps {
  children: React.ReactNode;
  isStickyOnMobile?: boolean;
  stickyTopClassName?: string;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  isStickyOnMobile = false,
  stickyTopClassName = 'top-0',
  className = '',
}) => {
  return (
    <div
      className={[
        'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-1 mb-2',
        isStickyOnMobile ? `sticky ${stickyTopClassName} z-30` : '',
        className,
      ].join(' ')}
    >
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
        {children}
      </div>
    </div>
  );
};



