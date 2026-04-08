
/**
 * Convert hex color to RGB object
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : null;
};

/**
 * Mix two colors
 * @param color1 Hex color 1
 * @param color2 Hex color 2
 * @param weight Weight of color 2 (0 to 1)
 */
const mixColors = (color1: string, color2: string, weight: number): string => {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    if (!rgb1 || !rgb2) return color1;

    const r = Math.round(rgb1.r * (1 - weight) + rgb2.r * weight);
    const g = Math.round(rgb1.g * (1 - weight) + rgb2.g * weight);
    const b = Math.round(rgb1.b * (1 - weight) + rgb2.b * weight);

    const rr = (r.toString(16).length === 1 ? '0' : '') + r.toString(16);
    const gg = (g.toString(16).length === 1 ? '0' : '') + g.toString(16);
    const bb = (b.toString(16).length === 1 ? '0' : '') + b.toString(16);

    return `#${rr}${gg}${bb}`;
};

/**
 * Generate a tint (lighter version mixed with white)
 */
export const tint = (hex: string, weight: number): string => {
    return mixColors(hex, '#ffffff', weight);
};

/**
 * Generate a shade (darker version mixed with black)
 */
export const shade = (hex: string, weight: number): string => {
    return mixColors(hex, '#000000', weight);
};

/**
 * Calculate appropriate text color (black or white) for a background
 */
export const getContrastColor = (hex: string): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return '#000000';

    // Calculate YIQ brightness
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;

    // Returns black text for bright backgrounds, white for dark
    return yiq >= 128 ? '#000000' : '#ffffff';
};

/**
 * Generate a color palette and apply it to CSS variables
 * @param primaryHex The primary brand color in hex format
 */
export const applyTheme = (primaryHex: string) => {
    if (!primaryHex || !/^#[0-9A-F]{6}$/i.test(primaryHex)) return;

    const root = document.documentElement;

    // Base (500)
    root.style.setProperty('--brand-500', primaryHex);

    // Generate Shades & Tints correctly
    // Tints (Lighter)
    root.style.setProperty('--brand-400', tint(primaryHex, 0.2));
    root.style.setProperty('--brand-300', tint(primaryHex, 0.4));
    root.style.setProperty('--brand-200', tint(primaryHex, 0.6));
    root.style.setProperty('--brand-100', tint(primaryHex, 0.8));
    root.style.setProperty('--brand-50', tint(primaryHex, 0.95)); // Very light tint

    // Shades (Darker)
    root.style.setProperty('--brand-600', shade(primaryHex, 0.1));
    root.style.setProperty('--brand-700', shade(primaryHex, 0.2));
    root.style.setProperty('--brand-800', shade(primaryHex, 0.3));
    root.style.setProperty('--brand-900', shade(primaryHex, 0.4));

    // Contrast Text
    root.style.setProperty('--brand-contrast', getContrastColor(primaryHex));
};

