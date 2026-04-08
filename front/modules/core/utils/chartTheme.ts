/**
 * Chart theme presets for Recharts (grid, axes, tooltip) and bar/line colors.
 * Aligned with CSS variables in index.html; use getChartTheme() for current theme.
 */

export type ChartThemeId = 'light' | 'dark';

export interface ChartThemeConfig {
  grid: { stroke: string; strokeOpacity: number };
  tick: { fill: string };
  tooltip: {
    contentStyle: { backgroundColor: string; color: string; border: string; borderRadius: string };
    cursor: { fill: string };
    labelStyle?: { color: string };
  };
  colors: {
    ordersBar: string;
    salesBar: string;
    lineChart: string;
    lineChartDot: string;
  };
  /** Per-tier colors for loyalty chart (Bronze, Prata, Ouro, etc.) */
  tierColors: Record<string, string>;
}

const lightTheme: ChartThemeConfig = {
  grid: { stroke: '#e5e7eb', strokeOpacity: 0.6 },
  tick: { fill: '#6b7280' },
  tooltip: {
    contentStyle: {
      backgroundColor: '#1f2937',
      color: '#f9fafb',
      border: 'none',
      borderRadius: '8px',
    },
    cursor: { fill: 'rgba(0,0,0,0.06)' },
    labelStyle: { color: '#9ca3af' },
  },
  colors: {
    ordersBar: '#10b981',
    salesBar: '#2563eb',
    lineChart: '#059669',
    lineChartDot: '#059669',
  },
  tierColors: {
    Bronze: '#b45309',
    Prata: '#6b7280',
    Ouro: '#d97706',
    default: '#8b5cf6',
  },
};

const darkTheme: ChartThemeConfig = {
  grid: { stroke: '#4b5563', strokeOpacity: 0.4 },
  tick: { fill: '#9ca3af' },
  tooltip: {
    contentStyle: {
      backgroundColor: '#374151',
      color: '#f9fafb',
      border: 'none',
      borderRadius: '8px',
    },
    cursor: { fill: 'rgba(255,255,255,0.05)' },
    labelStyle: { color: '#9ca3af' },
  },
  colors: {
    ordersBar: '#34d399',
    salesBar: '#60a5fa',
    lineChart: '#34d399',
    lineChartDot: '#34d399',
  },
  tierColors: {
    Bronze: '#f59e0b',
    Prata: '#9ca3af',
    Ouro: '#fbbf24',
    default: '#a78bfa',
  },
};

export const chartThemes: Record<ChartThemeId, ChartThemeConfig> = {
  light: lightTheme,
  dark: darkTheme,
};

/** Returns current chart theme based on document.documentElement classList 'dark'. */
export function getChartTheme(): ChartThemeConfig {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return isDark ? darkTheme : lightTheme;
}

/** Get fill color for tier bar by tier name (Bronze, Prata, Ouro, etc.). */
export function getTierBarColor(tierName: string): string {
  const theme = getChartTheme();
  return theme.tierColors[tierName] ?? theme.tierColors.default;
}
