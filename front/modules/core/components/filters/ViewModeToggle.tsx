import React from 'react';
import { LayoutGrid, Table } from 'lucide-react';

export type ViewMode = 'cards' | 'table';

export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  size?: 'compact' | 'md';
  className?: string;
  ariaLabel?: string;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  value,
  onChange,
  size = 'compact',
  className = '',
  ariaLabel = 'Alternar modo de visualizaçéo',
}) => {
  const isCompact = size === 'compact';

  const buttonBaseClassName =
    'rounded-lg transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand-500';
  const buttonSizeClassName = isCompact ? 'px-3 py-2' : 'px-3 py-2';
  const iconClassName = isCompact ? 'w-4 h-4' : 'w-4 h-4';
  const activeClassName = 'bg-white dark:bg-gray-600 text-brand-600 dark:text-brand-400 shadow-sm';
  const inactiveClassName =
    'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200';

  const getButtonClassName = (isActive: boolean) =>
    [buttonBaseClassName, buttonSizeClassName, isActive ? activeClassName : inactiveClassName].join(
      ' '
    );

  return (
    <div
      className={[
        // Container no mesmo â€œpeso visualâ€ dos inputs/botéµes da toolbar
        'flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 flex-shrink-0',
        className,
      ].join(' ')}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={getButtonClassName(value === 'cards')}
        aria-pressed={value === 'cards'}
        title="Cards"
      >
        <LayoutGrid className={iconClassName} />
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={getButtonClassName(value === 'table')}
        aria-pressed={value === 'table'}
        title="Tabela"
      >
        <Table className={iconClassName} />
      </button>
    </div>
  );
};



