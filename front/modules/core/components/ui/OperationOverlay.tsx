/**
 * Overlay que mostra progresso durante operações críticas.
 * Previne que o utilizador saia da página durante operações.
 */
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface OperationOverlayProps {
  isVisible: boolean;
  title?: string;
  message?: string;
  progress?: {
    current: number;
    total: number;
  };
}

export const OperationOverlay: React.FC<OperationOverlayProps> = ({
  isVisible,
  title = 'Operação em curso',
  message = 'Por favor aguarde...',
  progress
}) => {
  // Prevenir saída da página durante operação
  useEffect(() => {
    if (!isVisible) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Uma operação está em curso. Se sair agora, os dados podem ficar inconsistentes. Deseja realmente sair?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isVisible]);

  if (!isVisible) return null;

  const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <div className="fixed inset-0 min-h-screen min-w-full z-[9999] flex items-center justify-center modal-overlay">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        {/* Spinner */}
        <div className="flex justify-center mb-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>

        {/* Título */}
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h3>

        {/* Mensagem */}
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          {message}
        </p>

        {/* Barra de progresso (se aplicável) */}
        {progress && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {progress.current} de {progress.total} ({progressPercent}%)
            </p>
          </div>
        )}

        {/* Aviso */}
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-4">
          ⚠️ Não feche nem recarregue a página
        </p>
      </div>
    </div>
  );
};

export default OperationOverlay;
