import { appSystemConfig } from '../../../config/appConfig';
import api from './apiClient';

export interface SystemSettings {
  system_name?: string;
  logo_light?: string;
  logo_dark?: string;
  logo_icon?: string;
  favicon?: string;
  primary_color?: string;
  secondary_color?: string;
  theme_font?: string;
  theme_radius?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_address?: string;
  company_website?: string;
  [key: string]: unknown;
}

const CACHE_KEY = 'sys_logo_settings';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const invalidateLogoCache = (): void => {
  localStorage.removeItem(CACHE_KEY);
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }

    const config = await api.get<any>('/tax/config');
    const base = appSystemConfig as SystemSettings;
    const settings: SystemSettings = {
      ...base,
      ...(config.logoUrl ? { logo_light: config.logoUrl, logo_dark: config.logoUrl } : {}),
      ...(config.logoIconUrl ? { logo_icon: config.logoIconUrl, favicon: config.logoIconUrl } : {}),
      ...(config.themePrimaryColor ? { primary_color: config.themePrimaryColor } : {}),
      ...(config.themeFont ? { theme_font: config.themeFont } : {}),
      ...(config.themeRadius ? { theme_radius: config.themeRadius } : {}),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: settings }));
    return settings;
  } catch {
    return appSystemConfig as SystemSettings;
  }
};

export const saveSystemSettings = async (_settings: SystemSettings): Promise<boolean> => {
  return true;
};

export const updateFavicon = (faviconUrl: string): void => {
  if (!faviconUrl) return;

  const getFaviconType = (url: string): string => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.ico')) return 'image/x-icon';
    if (lowerUrl.includes('.png')) return 'image/png';
    if (lowerUrl.includes('.svg')) return 'image/svg+xml';
    if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) return 'image/jpeg';
    if (lowerUrl.includes('.webp')) return 'image/webp';
    if (lowerUrl.includes('.gif')) return 'image/gif';
    return 'image/png';
  };

  const existingFavicons = document.querySelectorAll("link[rel*='icon']");
  existingFavicons.forEach(link => {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('data:')) link.remove();
  });

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = getFaviconType(faviconUrl);
  link.href = faviconUrl;
  const firstLink = document.head.querySelector('link');
  if (firstLink) {
    document.head.insertBefore(link, firstLink);
  } else {
    document.head.appendChild(link);
  }

  const shortcutLink = document.createElement('link');
  shortcutLink.rel = 'shortcut icon';
  shortcutLink.type = getFaviconType(faviconUrl);
  shortcutLink.href = faviconUrl;
  document.head.appendChild(shortcutLink);

  const appleIcon = document.querySelector("link[rel='apple-touch-icon']");
  if (appleIcon) {
    appleIcon.setAttribute('href', faviconUrl);
  } else {
    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = faviconUrl;
    document.head.appendChild(appleLink);
  }
};

export const updatePageTitle = (title: string): void => {
  document.title = title;
};
