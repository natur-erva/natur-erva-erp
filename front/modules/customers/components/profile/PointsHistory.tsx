import React from 'react';
import { CustomerAction } from '../../../core/types/types';
import { Gift, TrendingUp, Star, Share2, Target, Calendar } from 'lucide-react';

interface PointsHistoryProps {
  actions: CustomerAction[];
}

const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case 'completar_perfil':
      return <Target className="w-5 h-5 text-blue-600" />;
    case 'partilhar_produto':
      return <Share2 className="w-5 h-5 text-green-600" />;
    case 'avaliar_produto':
    case 'criar_review':
      return <Star className="w-5 h-5 text-yellow-600" />;
    case 'meta_completa':
      return <Target className="w-5 h-5 text-purple-600" />;
    default:
      return <Gift className="w-5 h-5 text-green-600" />;
  }
};

const getActionLabel = (actionType: string) => {
  const labels: Record<string, string> = {
    completar_perfil: 'Completar Perfil',
    partilhar_produto: 'Partilhar Produto',
    avaliar_produto: 'Avaliar Produto',
    seguir_rede_social: 'Seguir Rede Social',
    participar_promocao: 'Participar Promoçéo',
    criar_review: 'Criar Review',
    criar_conteudo: 'Criar Conteéºdo',
    participar_evento: 'Participar Evento',
    meta_completa: 'Meta Completa',
    purchase: 'Compra',
    referral: 'Indicaçéo',
    bonus: 'Bé³nus'
  };
  return labels[actionType] || actionType;
};

export const PointsHistory: React.FC<PointsHistoryProps> = ({ actions }) => {
  if (actions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Gift className="w-12 h-12 text-gray-400 mx-auto mb-2" />
        <p>Nenhuma açéo registrada ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action, index) => (
        <div
          key={action.id}
          className="group flex items-center justify-between p-5 bg-white dark:bg-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 hover:scale-[1.02]"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center space-x-4 flex-1">
            <div className="p-2.5 bg-gray-100 dark:bg-gray-700 rounded-lg group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
              {getActionIcon(action.actionType)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white mb-1">
                {getActionLabel(action.actionType)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {new Date(action.createdAt).toLocaleDateString('pt-MZ', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 px-4 py-2 rounded-lg border border-green-200 dark:border-green-800">
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="font-bold text-lg text-green-600 dark:text-green-400">+{action.pointsEarned}</span>
          </div>
        </div>
      ))}
    </div>
  );
};


