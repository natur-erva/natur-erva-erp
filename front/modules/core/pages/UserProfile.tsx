import React, { useState, useRef } from 'react';
import { User } from '../../core/types/types';
import { authService } from '../../auth/services/authService';
import { uploadAvatar } from '../../media/services/imageService';
import { Camera, Save, Loader2, Moon, Sun, LogOut } from 'lucide-react';
import { Toast } from '../../core/components/ui/Toast';
import { Avatar } from '../../core/components/ui/Avatar';
import { PageShell } from '../../core/components/layout/PageShell';

interface UserProfileProps {
  currentUser: User;
  onBack?: () => void;
  onUpdate?: (updatedUser: User) => void;
  showToast?: (message: string, type: Toast['type'], duration?: number) => void;
  onLogout?: () => void;
  toggleTheme?: () => void;
  isDarkMode?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  currentUser,
  onBack,
  onUpdate,
  showToast,
  onLogout,
  toggleTheme,
  isDarkMode = true
}) => {
  const [name, setName] = useState(currentUser.name || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [avatar, setAvatar] = useState(currentUser.avatar || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast?.('Tipo de arquivo néo suportado. Use JPEG, PNG, WEBP ou GIF.', 'error');
      return;
    }

    // Validar tamanho (mé¡ximo 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast?.('Arquivo muito grande. Tamanho mé¡ximo: 2MB.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const avatarUrl = await uploadAvatar(file, currentUser.id);
      if (avatarUrl) {
        setAvatar(avatarUrl);
        showToast?.('Foto atualizada com sucesso!', 'success');
      } else {
        showToast?.('Erro ao fazer upload da foto. Tente novamente.', 'error');
      }
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      showToast?.(error.message || 'Erro ao fazer upload da foto.', 'error');
    } finally {
      setIsUploading(false);
      // Limpar o input para permitir selecionar o mesmo arquivo novamente
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showToast?.('O nome é© obrigaté³rio.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.updateProfile(currentUser.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        avatar_url: avatar || undefined
      });

      if (result.success) {
        showToast?.('Perfil atualizado com sucesso!', 'success');

        // Atualizar o usué¡rio localmente
        const updatedUser: User = {
          ...currentUser,
          name: name.trim(),
          phone: phone.trim() || undefined,
          avatar: avatar || currentUser.avatar
        };

        onUpdate?.(updatedUser);

        // Recarregar o usué¡rio atual para garantir sincronizaçéo
        const refreshedUser = await authService.getCurrentUser();
        if (refreshedUser) {
          onUpdate?.(refreshedUser);
        }
      } else {
        showToast?.(result.error || 'Erro ao atualizar perfil.', 'error');
      }
    } catch (error: any) {
      console.error('Erro ao salvar perfil:', error);
      showToast?.(error.message || 'Erro ao atualizar perfil.', 'error');
    } finally {
      setIsLoading(false);
    }
  };


  // Açéµes do cabeçalho (modo claro/escuro e logout)
  const headerActions = (
    <div className="flex gap-2 flex-wrap">
      {toggleTheme && (
        <button
          onClick={toggleTheme}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
          aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4" />
              <span className="hidden sm:inline">Modo Claro</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span className="hidden sm:inline">Modo Escuro</span>
            </>
          )}
        </button>
      )}
      {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center space-x-2 px-4 py-2 border border-red-300 dark:border-red-600 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors min-h-[44px]"
          aria-label="Sair"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <PageShell
        title="Meu Perfil"
        description="Gerencie suas Informações pessoais"
        actions={headerActions}
      >
        {/* Card Principal */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 sm:p-8">
            {/* Avatar Section */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative">
                <div className="relative shadow-lg ring-4 ring-white dark:ring-gray-800">
                  <Avatar
                    src={avatar}
                    alt={currentUser.name}
                    name={name || currentUser.name}
                    size="xl"
                  />
                </div>
                <button
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="absolute bottom-0 right-0 p-3 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Alterar foto"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
                Clique no é­cone da cé¢mera para alterar sua foto
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
                Formatos: JPEG, PNG, WEBP, GIF â€¢ Mé¡ximo: 2MB
              </p>
            </div>

            {/* Form Fields */}
            <div className="space-y-6">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                  placeholder="Seu nome completo"
                  required
                />
              </div>

              {/* Email (readonly) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={currentUser.email}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  O email néo pode ser alterado
                </p>
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                  placeholder="+258 XX XXX XXXX"
                />
              </div>

              {/* Role (readonly) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Funçéo
                </label>
                <input
                  type="text"
                  value={currentUser.roleDisplayName || currentUser.role}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleSave}
                disabled={isLoading || !name.trim()}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    </div>
  );
};



