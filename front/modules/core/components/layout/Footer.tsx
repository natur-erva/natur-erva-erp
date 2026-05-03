import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Phone, Mail, Leaf } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { getSystemSettings, SystemSettings } from '../../../core/services/systemSettingsService';

interface FooterProps {
  isShopMode?: boolean;
}

const FooterComponent: React.FC<FooterProps> = ({ isShopMode = false }) => {
  const [settings, setSettings] = useState<SystemSettings>({});

  useEffect(() => {
    getSystemSettings().then(setSettings).catch(() => {});
  }, []);

  return (
    <footer className="bg-gray-950 text-white mt-16 pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-8">

        {/* Grid: 2 colunas mobile, 4 desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">

          {/* Coluna 1 — Marca (ocupa 2 colunas no mobile) */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4">
              <Logo width={130} height={44} isDarkMode={true} />
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Produtos naturais de qualidade para a sua saúde e bem-estar, selecionados com cuidado.
            </p>
            <div className="flex gap-3 mt-5">
              <a href="https://www.instagram.com/naturervamz/" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-purple-500/20" aria-label="Instagram">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="https://www.facebook.com/naturervamz/" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-blue-500/20" aria-label="Facebook">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="https://wa.me/258874209440" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-green-500/20" aria-label="WhatsApp">
                <Phone className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Coluna 2 — Categorias */}
          <div>
            <h4 className="mb-4 font-semibold text-white text-sm uppercase tracking-wide flex items-center gap-2">
              <Leaf className="h-3.5 w-3.5 text-green-500" />
              Categorias
            </h4>
            <ul className="space-y-2.5 text-gray-400 text-sm">
              <li><Link to="/loja?categoria=Suplementos" className="hover:text-green-400 transition-colors">Suplementos</Link></li>
              <li><Link to="/loja?categoria=Chás e Infusões" className="hover:text-green-400 transition-colors">Chás e Infusões</Link></li>
              <li><Link to="/loja?categoria=Óleos Essenciais" className="hover:text-green-400 transition-colors">Óleos Essenciais</Link></li>
              <li><Link to="/loja?categoria=Cápsulas" className="hover:text-green-400 transition-colors">Cápsulas</Link></li>
              <li><Link to="/loja?categoria=Fitoterapia" className="hover:text-green-400 transition-colors">Fitoterapia</Link></li>
            </ul>
          </div>

          {/* Coluna 3 — Atendimento */}
          <div>
            <h4 className="mb-4 font-semibold text-white text-sm uppercase tracking-wide">Ajuda</h4>
            <ul className="space-y-2.5 text-gray-400 text-sm">
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

          {/* Coluna 4 — Contacto */}
          <div>
            <h4 className="mb-4 font-semibold text-white text-sm uppercase tracking-wide">Contacto</h4>
            <p className="text-gray-400 text-sm mb-4">Receba ofertas exclusivas e novidades</p>
            {settings.company_email && (
              <a href={`mailto:${settings.company_email}`} className="flex items-center gap-2 text-gray-400 text-sm hover:text-green-400 transition-colors mb-4">
                <Mail className="h-4 w-4 text-green-500 flex-shrink-0" />
                {settings.company_email}
              </a>
            )}
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Seu e-mail"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 placeholder-gray-500"
              />
              <button className="bg-green-600 hover:bg-green-500 px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0">
                OK
              </button>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-800 mt-10 pt-6 text-center text-gray-500 text-xs">
          © {new Date().getFullYear()} Natur Erva · Todos os direitos reservados
        </div>
      </div>
    </footer>
  );
};

export const Footer = memo(FooterComponent, (prev, next) => prev.isShopMode === next.isShopMode);
