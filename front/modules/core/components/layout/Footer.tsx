import React, { useState, useEffect, memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Instagram, Facebook } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { getSystemSettings, SystemSettings } from '../../../core/services/systemSettingsService';
import { useMobile } from '../../../core/hooks/useMobile';

interface FooterProps {
  isShopMode?: boolean;
}

const FooterComponent: React.FC<FooterProps> = ({ isShopMode = false }) => {
  const [settings, setSettings] = useState<SystemSettings>({});
  const isMobile = useMobile(768);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await getSystemSettings();
        setSettings(loadedSettings);
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      }
    };
    loadSettings();
  }, []);

  // Ocultar footer no mobile se for modo shop
  if (isShopMode && isMobile) {
    return null;
  }

  return (
    <footer className="py-12 border-t border-white/20 dark:border-gray-700/50 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Sobre */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Logo width={120} height={40} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              A Natur-Erva é uma ervanaria dedicada à promoção da saúde e do bem-estar através de ervas medicinais e produtos naturais selecionados com cuidado.
            </p>
            <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
              Saúde/beleza
            </p>
          </div>

          {/* Links Rápidos */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wide">Links Rápidos</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/loja"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                >
                  Loja
                </Link>
              </li>
              <li>
                <Link
                  to="/loja"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                >
                  Loja
                </Link>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wide">Contato</h3>
            <ul className="space-y-3">
              {settings.company_email && (
                <li className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <a href={`mailto:${settings.company_email}`} className="text-sm text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors">
                    {settings.company_email}
                  </a>
                </li>
              )}
              {settings.company_phone && (
                <li className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <a href={`tel:${settings.company_phone.replace(/\s/g, '')}`} className="text-sm text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors">
                    {settings.company_phone}
                  </a>
                </li>
              )}
              {settings.company_address && (
                <li className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {settings.company_address}
                  </span>
                </li>
              )}
              {!settings.company_email && !settings.company_phone && !settings.company_address && (
                <li className="text-sm text-gray-500 dark:text-gray-500">
                  Configure os dados de contato nas configurações do sistema
                </li>
              )}
            </ul>
          </div>

          {/* Redes Sociais */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm uppercase tracking-wide">Redes Sociais</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Siga-nos e fique por dentro das novidades
            </p>
            <div className="flex gap-3">
              <a
                href="https://www.instagram.com/naturervamz/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white hover:scale-110 transition-transform shadow-lg hover:shadow-xl"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.facebook.com/naturervamz"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white hover:scale-110 transition-transform shadow-lg hover:shadow-xl"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-8 mt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
              © {new Date().getFullYear()} Natur Erva. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Política de Privacidade</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600 dark:text-gray-400">Termos de Uso</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

// Memoizar o Footer com comparação customizada
export const Footer = memo(FooterComponent, (prevProps, nextProps) => {
  return prevProps.isShopMode === nextProps.isShopMode;
});
