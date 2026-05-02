import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Phone, Mail } from 'lucide-react';
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
    <footer className="bg-gray-800 text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

          {/* Coluna 1 — Marca */}
          <div>
            <div className="mb-4">
              <Logo width={140} height={46} />
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Produtos naturais de qualidade para a sua saúde e bem-estar, selecionados com cuidado.
            </p>
            <div className="flex gap-3 mt-5">
              <a
                href="https://www.instagram.com/naturervamz/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white hover:scale-110 transition-transform"
                aria-label="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="https://www.facebook.com/naturervamz/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white hover:scale-110 transition-transform"
                aria-label="Facebook"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://wa.me/258874209440"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center text-white hover:scale-110 transition-transform"
                aria-label="WhatsApp (+258 87 420 9440)"
              >
                <Phone className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Coluna 2 — Categorias */}
          <div>
            <h4 className="mb-4 font-medium text-white">Categorias</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><Link to="/loja?categoria=Suplementos" className="hover:text-green-400 transition-colors">Suplementos</Link></li>
              <li><Link to="/loja?categoria=Chás e Infusões" className="hover:text-green-400 transition-colors">Chás e Infusões</Link></li>
              <li><Link to="/loja?categoria=Óleos Essenciais" className="hover:text-green-400 transition-colors">Óleos Essenciais</Link></li>
              <li><Link to="/loja?categoria=Cápsulas" className="hover:text-green-400 transition-colors">Cápsulas</Link></li>
              <li><Link to="/loja?categoria=Fitoterapia" className="hover:text-green-400 transition-colors">Fitoterapia</Link></li>
            </ul>
          </div>

          {/* Coluna 3 — Atendimento */}
          <div>
            <h4 className="mb-4 font-medium text-white">Atendimento</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><Link to="/loja" className="hover:text-green-400 transition-colors">Sobre Nós</Link></li>
              <li>
                <a href="https://wa.me/258874209440" target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">
                  Fale Connosco
                </a>
              </li>
              <li><Link to="/loja" className="hover:text-green-400 transition-colors">Política de Troca</Link></li>
              <li><Link to="/loja" className="hover:text-green-400 transition-colors">Perguntas Frequentes</Link></li>
            </ul>
          </div>

          {/* Coluna 4 — Contacto / Newsletter */}
          <div>
            <h4 className="mb-4 font-medium text-white">Contacto</h4>
            <p className="text-gray-400 text-sm mb-4">
              Receba ofertas exclusivas e novidades
            </p>
            {settings.company_email && (
              <a href={`mailto:${settings.company_email}`} className="flex items-center gap-2 text-gray-400 text-sm hover:text-green-400 transition-colors mb-3">
                <Mail className="h-4 w-4 text-green-400 flex-shrink-0" />
                {settings.company_email}
              </a>
            )}
            <div className="flex gap-2 mt-2">
              <input
                type="email"
                placeholder="Seu e-mail"
                className="flex-1 px-3 py-2 rounded bg-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm transition-colors whitespace-nowrap">
                Enviar
              </button>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
          <p>© {new Date().getFullYear()} Natur Erva. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

// Memoizar o Footer com comparação customizada
export const Footer = memo(FooterComponent, (prevProps, nextProps) => {
  return prevProps.isShopMode === nextProps.isShopMode;
});
