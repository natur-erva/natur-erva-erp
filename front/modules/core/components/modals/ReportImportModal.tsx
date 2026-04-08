import React, { useState } from 'react';
import { ModalPortal } from '../ui/ModalPortal';
import { X, Search, CheckCircle, RefreshCw } from 'lucide-react';
import { Customer } from '../../../core/types/types';
import { dataService } from '../../../core/services/dataService';
import { Toast } from '../ui/Toast';

interface ReportImportModalProps {
  reportText: string;
  setReportText: (text: string) => void;
  customers: Customer[];
  onClose: () => void;
  onSuccess: () => void;
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
}

export const ReportImportModal: React.FC<ReportImportModalProps> = ({
  reportText,
  setReportText,
  customers,
  onClose,
  onSuccess,
  showToast
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedCustomers, setParsedCustomers] = useState<Array<{
    name: string;
    phone?: string;
    notes: string;
    matchedCustomer?: Customer;
  }>>([]);

  const parseReport = () => {
    if (!reportText.trim()) {
      showToast('Por favor, cole o relaté³rio no campo de texto', 'warning');
      return;
    }

    const lines = reportText.split('\n').filter(line => line.trim());
    const parsed: Array<{ name: string; phone?: string; notes: string; matchedCustomer?: Customer }> = [];
      let currentCustomer: { name: string; phone?: string; notes: string; matchedCustomer?: Customer } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Padréµes para identificar clientes:
      // - "Sr/Sra [Nome] ([telefone])"
      // - "Cliente [nome]"
      // - "[Nome] ([telefone])"
      // - "[Nome] - ([telefone])"
      const patterns = [
        /^(?:Sr|Sra|Sr\.|Sra\.)\s+([^(]+?)\s*\((\d+)\)/i,
        /^Cliente\s+(?:ativa|ativo|corrente)?!?\s*([^(]+?)(?:\s*\((\d+)\))?/i,
        /^([A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+(?:\s+[A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+)*(?:\s+-\s*[A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+)?)\s*\((\d+)\)/,
        /^([A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+(?:\s+[A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+)*)\s*-\s*\(?(\d+)\)?/,
        /^([A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+(?:\s+[A-Zéé‰éé“éšé‡][a-zé¡é©é­é³éºç]+)*)\s*\((\d+)\)/,
      ];

      let matched = false;
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          // Se havia um cliente anterior, salvé¡-lo
          if (currentCustomer && currentCustomer.notes.trim()) {
            parsed.push(currentCustomer);
          }

          const name = match[1].trim();
          const phone = match[2]?.trim();
          
          // Normalizar nomes para comparaçéo (remover acentos e espaços extras)
          const normalizeName = (n: string) => n.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .replace(/\s+/g, ' ');

          // Buscar cliente correspondente
          const matchedCustomer = customers.find(c => {
            const normalizedCustomerName = normalizeName(c.name);
            const normalizedInputName = normalizeName(name);
            
            // Verificar correspondéªncia por nome (parcial ou completo)
            const nameMatch = normalizedCustomerName.includes(normalizedInputName) || 
                            normalizedInputName.includes(normalizedCustomerName) ||
                            // Verificar se partes do nome correspondem
                            normalizedInputName.split(' ').some(part => 
                              part.length > 2 && normalizedCustomerName.includes(part)
                            );
            
            // Verificar correspondéªncia por telefone
            const phoneMatch = phone && (
              c.phone.replace(/\s/g, '').includes(phone.replace(/\s/g, '')) || 
              phone.replace(/\s/g, '').includes(c.phone.replace(/\s/g, ''))
            );
            
            return nameMatch || phoneMatch;
          });

          currentCustomer = {
            name,
            phone,
            notes: '',
            matchedCustomer
          };
          matched = true;
          break;
        }
      }

      // Se néo é© uma linha de identificaçéo de cliente, adicionar como nota
      if (!matched && currentCustomer) {
        if (currentCustomer.notes) {
          currentCustomer.notes += ' ' + line;
        } else {
          currentCustomer.notes = line;
        }
      }
    }

    // Adicionar éºltimo cliente
    if (currentCustomer && currentCustomer.notes.trim()) {
      parsed.push(currentCustomer);
    }

    setParsedCustomers(parsed);
    
    if (parsed.length === 0) {
      showToast('Nenhum cliente encontrado no relaté³rio. Verifique o formato.', 'warning');
    } else {
      showToast(`${parsed.length} cliente(s) identificado(s) no relaté³rio`, 'info');
    }
  };

  const handleProcess = async () => {
    if (parsedCustomers.length === 0) {
      showToast('Por favor, analise o relaté³rio primeiro', 'warning');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const parsed of parsedCustomers) {
        if (!parsed.matchedCustomer) {
          errorCount++;
          continue;
        }

        const customer = parsed.matchedCustomer;
        const existingNotes = customer.notes || '';
        const datePrefix = new Date().toLocaleDateString('pt-PT');
        const newNote = `[${datePrefix}] ${parsed.notes.trim()}`;
        
        const updatedNotes = existingNotes 
          ? `${existingNotes}\n\n${newNote}`
          : newNote;

        const success = await dataService.updateCustomer(customer.id, { notes: updatedNotes });
        
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        showToast(
          `${successCount} cliente(s) atualizado(s) com sucesso${errorCount > 0 ? `. ${errorCount} erro(s).` : ''}`,
          errorCount > 0 ? 'warning' : 'success'
        );
        onSuccess();
      } else {
        showToast('Nenhum cliente foi atualizado. Verifique os erros.', 'error');
      }
    } catch (error: any) {
      showToast('Erro ao processar relaté³rio: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ModalPortal open onClose={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center z-10">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Importar Relaté³rio de Clientes</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cole o relaté³rio e o sistema identificaré¡ automaticamente os clientes</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cole o relaté³rio aqui:
            </label>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              placeholder="Cole aqui o relaté³rio de clientes..."
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={parseReport}
                disabled={!reportText.trim()}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                Analisar Relaté³rio
              </button>
              <button
                onClick={() => {
                  setReportText('');
                  setParsedCustomers([]);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Limpar
              </button>
            </div>
          </div>

          {parsedCustomers.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  Clientes Identificados ({parsedCustomers.length})
                </h4>
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Processar e Salvar
                    </>
                  )}
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {parsedCustomers.map((parsed, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-3 ${
                      parsed.matchedCustomer
                        ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                        : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 dark:text-white">{parsed.name}</span>
                          {parsed.phone && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">({parsed.phone})</span>
                          )}
                          {parsed.matchedCustomer ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs rounded">
                              âœ“ Encontrado: {parsed.matchedCustomer.name}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs rounded">
                              âœ— Néo encontrado
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap">
                          {parsed.notes}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </ModalPortal>
  );
};


