import { appSystemConfig } from '../../../config/appConfig';

export interface SystemSettings {
  system_name?: string;
  logo_light?: string;
  logo_dark?: string;
  logo_icon?: string;
  favicon?: string;
  primary_color?: string;
  secondary_color?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_address?: string;
  company_website?: string;
  [key: string]: unknown;
}

/**
 * Obtém todas as configurações do sistema a partir do ficheiro de configuração.
 */
export const getSystemSettings = async (): Promise<SystemSettings> => {
  return Promise.resolve(appSystemConfig as SystemSettings);
};

/**
 * No-op: as configurações passaram a ser apenas em ficheiro de config.
 */
export const saveSystemSettings = async (_settings: SystemSettings): Promise<boolean> => {
  return true;
};

/**
 * Atualiza o favicon dinamicamente
 */
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
    if (!href.startsWith('data:')) {
      link.remove();
    }
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

/**
 * Atualiza o título da página dinamicamente
 */
export const updatePageTitle = (title: string): void => {
  document.title = title;
};
