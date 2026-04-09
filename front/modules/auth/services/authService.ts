import { supabase, isSupabaseConfigured, getSupabaseConfig } from '../../core/services/supabaseClient';
import { type User, UserRole } from '../../core/types/types';

// Helper para normalizar telefone
const normalizePhone = (phone: string): string => {
  // Remove espaços, paréªnteses, hé­fens
  let normalized = phone.replace(/[\s\(\)\-]/g, '');
  // Se começar com +258, manté©m; se começar com 258, adiciona +; se começar com 8, adiciona +258
  if (normalized.startsWith('+258')) {
    return normalized;
  } else if (normalized.startsWith('258')) {
    return '+' + normalized;
  } else if (normalized.startsWith('8')) {
    return '+258' + normalized;
  }
  return normalized;
};

// Helper para verificar se é© email ou telefone
const isEmail = (input: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
};

// Helper para validar email
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  if (parts[1].length > 253) return false;

  return true;
};

// Helper para obter roles do usué¡rio com display_name
const getUserRolesWithDisplay = async (userId: string): Promise<Array<{ name: string; displayName: string }>> => {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    // Tentar usar funçéo RPC primeiro
    const { data, error } = await supabase
      .rpc('get_user_roles', { user_uuid: userId });

    if (!error && data && data.length > 0) {
      return data.map((r: any) => ({
        name: r.role_name,
        displayName: r.role_display_name || r.role_name
      })) || [];
    }

    // Se RPC falhar, usar fallback: consulta direta
    if (error) {
      console.warn('RPC get_user_roles falhou, usando fallback:', error);

      // Fallback 1: Buscar roles da tabela user_roles
      const { data: userRolesData, error: userRolesError } = await supabase
        .from('user_roles')
        .select('role_id, roles(name, display_name)')
        .eq('user_id', userId);

      if (!userRolesError && userRolesData && userRolesData.length > 0) {
        return userRolesData
          .map((ur: any) => ({
            name: ur.roles?.name,
            displayName: ur.roles?.display_name || ur.roles?.name
          }))
          .filter((r: any) => r.name) || [];
      }

      // Fallback 2: Buscar role do perfil
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!profileError && profileData?.role) {
        // Buscar display_name da role
        const { data: roleData } = await supabase
          .from('roles')
          .select('display_name')
          .eq('name', profileData.role)
          .single();

        return [{
          name: profileData.role,
          displayName: roleData?.display_name || profileData.role
        }];
      }
    }

    return [];
  } catch (e) {
    console.error('Error in getUserRolesWithDisplay:', e);
    // éšltimo fallback: tentar buscar do perfil diretamente
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileData?.role) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('display_name')
          .eq('name', profileData.role)
          .single();

        return [{
          name: profileData.role,
          displayName: roleData?.display_name || profileData.role
        }];
      }
    } catch (fallbackError) {
      console.error('Fallback també©m falhou:', fallbackError);
    }
    return [];
  }
};

// Helper para obter roles do usué¡rio (mantido para compatibilidade)
const getUserRoles = async (userId: string): Promise<string[]> => {
  const rolesWithDisplay = await getUserRolesWithDisplay(userId);
  return rolesWithDisplay.map(r => r.name);
};

// Helper para determinar role principal (para compatibilidade)
const getPrimaryRole = (roles: string[]): UserRole => {
  if (roles.includes('SUPER_ADMIN')) return UserRole.SUPER_ADMIN;
  if (roles.includes('ADMIN')) return UserRole.ADMIN;
  if (roles.includes('CONTABILISTA')) return UserRole.CONTABILISTA;
  if (roles.includes('GESTOR_STOCK')) return UserRole.GESTOR_STOCK;
  if (roles.includes('GESTOR_VENDAS')) return UserRole.GESTOR_VENDAS;
  if (roles.includes('CLIENTE')) return UserRole.CLIENTE;
  return UserRole.STAFF; // Fallback
};

// Helper para processar callback do popup
const processPopupCallback = async (hash: string): Promise<{ user: User | null, error: string | null }> => {
  if (!isSupabaseConfigured() || !supabase) {
    return { user: null, error: 'Supabase néo configurado.' };
  }

  try {
    // Se hash fornecido, verificar erros
    if (hash) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error) {
        console.error('OAuth error in hash:', error, errorDescription);
        return { user: null, error: errorDescription || error };
      }
    }

    // Processar hash manualmente se fornecido
    if (hash && hash.includes('access_token')) {
      console.log('Processing hash fragment manually...');
      try {
        // Tentar processar o hash diretamente
        const { data, error: hashError } = await supabase.auth.getSession();
        if (hashError) {
          console.error('Error processing hash:', hashError);
        }
      } catch (e) {
        console.error('Exception processing hash:', e);
      }
    }

    // O Supabase deve processar automaticamente o hash fragment
    // Aguardar um pouco para o Supabase processar (aumentado para 2 segundos)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Tentar obter sessão com méºltiplas tentativas
    let session = null;
    let sessionError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await supabase.auth.getSession();
      session = result.data.session;
      sessionError = result.error;

      if (session?.user) {
        console.log(`âœ… Sessão obtida na tentativa ${attempt}`);
        break;
      }

      if (attempt < maxRetries) {
        console.log(`Tentativa ${attempt} falhou, aguardando antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Se ainda néo temos sessão, tentar getUser() como fallback
    if (!session?.user) {
      console.log('Tentando getUser() como fallback...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (user && !userError) {
        console.log('âœ… Usué¡rio obtido via getUser(), mas sem sessão. Tentando obter sessão novamente...');
        // Aguardar mais um pouco e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1500));
        const retryResult = await supabase.auth.getSession();
        session = retryResult.data.session;
        sessionError = retryResult.error;
      }
    }

    if (sessionError) {
      console.error('Session error:', sessionError);
      return { user: null, error: `Erro ao obter sessão: ${sessionError.message || 'Erro desconhecido'}` };
    }

    if (!session?.user) {
      console.error('Nenhuma sessão encontrada apé³s méºltiplas tentativas');
      return { user: null, error: 'Erro ao obter sessão. Por favor, tente fazer login novamente.' };
    }

    // Processar usué¡rio - vamos usar a lé³gica de handleOAuthCallback diretamente aqui
    // para evitar referéªncia circular
    const userId = session.user.id;
    const email = session.user.email || '';
    const name = session.user.user_metadata?.full_name ||
      session.user.user_metadata?.name ||
      email.split('@')[0] ||
      'Utilizador';
    const avatarUrl = session.user.user_metadata?.avatar_url ||
      session.user.user_metadata?.picture ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    // Verificar se perfil jé¡ existe
    let profileData = null;
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!profileError && data) {
        profileData = data;
      }
    } catch (e) {
      // Tabela profiles pode néo existir ainda
    }

    // Criar ou atualizar perfil
    if (!profileData) {
      try {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            name: name,
            avatar_url: avatarUrl,
            role: 'CLIENTE',
            is_active: true,
            last_login: new Date().toISOString()
          })
          .select()
          .single();

        if (!createError && newProfile) {
          profileData = newProfile;
        }
      } catch (e) {
        // Ignorar erro
      }
    } else {
      // Atualizar perfil existente
      try {
        await supabase
          .from('profiles')
          .update({
            name: name,
            avatar_url: avatarUrl,
            last_login: new Date().toISOString()
          })
          .eq('id', userId);
      } catch (e) {
        // Ignorar erro
      }
    }

    // Obter roles
    const roles = await getUserRoles(userId);
    const defaultRole = profileData?.role || 'CLIENTE';
    const primaryRole = getPrimaryRole(roles.length > 0 ? roles : [defaultRole]);

    const finalRole = primaryRole;
    const finalRoles = roles.length > 0 ? roles : [defaultRole];

    const user: User = {
      id: userId,
      email: email,
      phone: profileData?.phone || undefined,
      name: name,
      role: finalRole,
      roles: finalRoles,
      avatar: avatarUrl,
      customerId: profileData?.customer_id || undefined,
      isActive: profileData?.is_active !== false,
      lastLogin: new Date().toISOString(),
      requiresStrongPassword: profileData?.requires_strong_password === true
    };

    return { user, error: null };
  } catch (e: any) {
    console.error('Error processing popup callback:', e);
    return { user: null, error: e.message || 'Erro ao processar autenticaçéo.' };
  }
};

// Helper para monitorar popup OAuth
const monitorOAuthPopup = async (
  popup: Window | null,
  redirectUrl: string
): Promise<{ user: User | null, error: string | null }> => {
  if (!popup) {
    return { user: null, error: 'Popup bloqueado pelo navegador. Por favor, permita popups para este site.' };
  }

  if (!isSupabaseConfigured() || !supabase) {
    return { user: null, error: 'Supabase néo configurado.' };
  }

  // Verificar sessão inicial para comparaçéo
  const { data: { session: initialSession } } = await supabase.auth.getSession();
  const initialUserId = initialSession?.user?.id;

  return new Promise((resolve) => {
    let popupClosedByUser = false;
    let authenticationDetected = false;

    const timeout = setTimeout(() => {
      if (popup && !popup.closed) {
        popup.close();
      }
      if (!authenticationDetected) {
        resolve({ user: null, error: 'Tempo de autenticaçéo expirado. Tente novamente.' });
      }
    }, 5 * 60 * 1000); // 5 minutos

    // Listener para mensagens do popup (se o Supabase usar postMessage)
    const messageHandler = async (event: MessageEvent) => {
      // Verificar origem para segurança
      if (event.origin !== window.location.origin &&
        !event.origin.includes('supabase.co') &&
        !event.origin.includes('google')) {
        return;
      }

      // Verificar se é© uma mensagem de autenticaçéo
      if (event.data?.type === 'supabase-auth' ||
        event.data?.access_token ||
        event.data?.error) {
        console.log('âœ… Mensagem de autenticaçéo recebida do popup');
        clearInterval(checkInterval);
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
        authenticationDetected = true;

        // Aguardar processamento
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const result = await processPopupCallback('');
          popup.close();
          resolve(result);
        } catch (e: any) {
          popup.close();
          resolve({ user: null, error: e.message || 'Erro ao processar autenticaçéo.' });
        }
      }
    };

    window.addEventListener('message', messageHandler);

    const checkInterval = setInterval(async () => {
      // Verificar se popup foi fechado
      if (popup.closed) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);

        if (authenticationDetected) {
          // Autenticaçéo jé¡ foi processada
          return;
        }

        // Popup foi fechado - verificar se houve mudança na sessão
        // Aguardar mais tempo para o Supabase processar completamente (aumentado para 3 segundos)
        console.log('Popup fechado, aguardando processamento do Supabase...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Tentar obter sessão com méºltiplas tentativas
        let newSession = null;
        let sessionError = null;
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const result = await supabase.auth.getSession();
          newSession = result.data.session;
          sessionError = result.error;

          if (newSession?.user) {
            console.log(`âœ… Sessão encontrada na tentativa ${attempt} apé³s popup fechado`);
            break;
          }

          if (attempt < maxRetries) {
            console.log(`Tentativa ${attempt} falhou, aguardando antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (sessionError) {
          console.error('Session error apé³s popup fechado:', sessionError);
          resolve({ user: null, error: `Erro ao verificar autenticaçéo: ${sessionError.message || 'Erro desconhecido'}` });
          return;
        }

        // Se hé¡ uma nova sessão diferente da inicial, autenticaçéo foi bem-sucedida
        if (newSession?.user && newSession.user.id !== initialUserId) {
          console.log('âœ… Nova sessão detectada, processando usué¡rio...');
          authenticationDetected = true;
          // Processar usué¡rio - hash vazio pois jé¡ temos a sessão
          try {
            const result = await processPopupCallback('');
            resolve(result);
          } catch (e: any) {
            console.error('Erro ao processar callback:', e);
            resolve({ user: null, error: e.message || 'Erro ao processar autenticaçéo.' });
          }
        } else if (newSession?.user && newSession.user.id === initialUserId) {
          // Mesma sessão - usué¡rio jé¡ estava logado
          console.log('âš ï¸ Mesma sessão detectada (usué¡rio jé¡ estava logado)');
          resolve({ user: null, error: 'Vocéª jé¡ esté¡ autenticado.' });
        } else {
          // Nenhuma mudança na sessão - usué¡rio cancelou ou erro
          console.log('âš ï¸ Nenhuma sessão encontrada apé³s popup fechado');
          resolve({ user: null, error: 'Autenticaçéo cancelada ou néo conclué­da. Por favor, tente novamente.' });
        }
        return;
      }

      // Tentar verificar se popup redirecionou para nossa URL (pode falhar por cross-origin)
      try {
        if (popup.location.href) {
          const popupUrl = popup.location.href;
          console.log('Verificando URL do popup:', popupUrl.substring(0, 100) + '...');

          // Verificar se conté©m tokens de autenticaçéo (hash fragment ou query params)
          if (popupUrl.includes('#access_token=') || popupUrl.includes('#error=') ||
            popupUrl.includes('code=') || popupUrl.includes('access_token=') ||
            popupUrl.includes('error=')) {
            console.log('âœ… Tokens de autenticaçéo detectados no popup!');
            clearInterval(checkInterval);
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            authenticationDetected = true;

            // Extrair hash fragment se existir
            const hash = popupUrl.includes('#') ? popupUrl.split('#')[1] : '';
            const queryParams = popupUrl.includes('?') ? popupUrl.split('?')[1].split('#')[0] : '';

            // Aguardar um pouco antes de processar para garantir que o Supabase processou
            await new Promise(resolve => setTimeout(resolve, 1500));

            processPopupCallback(hash || queryParams).then((result) => {
              console.log('Resultado do processamento:', result.error ? 'Erro: ' + result.error : 'Sucesso');
              popup.close();
              resolve(result);
            }).catch((error) => {
              console.error('Erro ao processar callback:', error);
              popup.close();
              resolve({ user: null, error: error.message || 'Erro ao processar autenticaçéo.' });
            });
            return;
          }
        }
      } catch (e) {
        // Cross-origin error - popup ainda néo redirecionou para nosso domé­nio
        // Isso é© normal durante o processo OAuth, continuar monitorando
        // Quando o popup fechar, verificaremos a sessão
      }
    }, 500); // Verificar a cada 500ms
  });
};

export const authService = {

  // Login function - suporta email ou telefone
  async signIn(identifier: string, password: string): Promise<{ user: User | null, error: string | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        user: null,
        error: 'Supabase não está configurado. Configure via Settings > Connection Settings ou variáveis de ambiente (.env)'
      };
    }

    try {
      let authData: any = null;
      let authError: any = null;

      // Tentar login com email primeiro
      if (isEmail(identifier)) {
        const result = await supabase.auth.signInWithPassword({
          email: identifier,
          password
        });
        authData = result.data;
        authError = result.error;
      } else {
        // Se néo é© email, tentar encontrar usué¡rio pelo telefone
        const phone = normalizePhone(identifier);

        // Buscar perfil pelo telefone
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, phone, email')
          .eq('phone', phone)
          .single();

        if (profileError || !profileData) {
          // Se néo encontrou pelo telefone, tentar buscar pelo customer
          const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('id, phone, email')
            .eq('phone', phone)
            .single();

          if (customerError || !customerData) {
            // Mensagem gené©rica para néo expor Informações
            return { user: null, error: 'Credenciais invé¡lidas. Verifique seu email e senha e tente novamente.' };
          }

          // Buscar perfil associado ao cliente
          const { data: customerProfile, error: cpError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('customer_id', customerData.id)
            .single();

          if (cpError || !customerProfile) {
            return { user: null, error: 'Credenciais invé¡lidas. Verifique seu email e senha e tente novamente.' };
          }

          // Tentar login com o email do perfil
          const result = await supabase.auth.signInWithPassword({
            email: customerProfile.email || customerData.email || '',
            password
          });
          authData = result.data;
          authError = result.error;
        } else {
          // Login com email do perfil encontrado
          if (!profileData.email) {
            return { user: null, error: 'Credenciais invé¡lidas. Verifique seu email e senha e tente novamente.' };
          }

          const result = await supabase.auth.signInWithPassword({
            email: profileData.email,
            password
          });
          authData = result.data;
          authError = result.error;
        }
      }

      // Mensagens gené©ricas para néo expor Informações sensé­veis
      if (authError) {
        // Néo expor detalhes especé­ficos do erro
        if (authError.message.includes('Invalid login credentials') ||
          authError.message.includes('Email not confirmed') ||
          authError.message.includes('User not found')) {
          return { user: null, error: 'Credenciais invé¡lidas. Verifique seu email e senha e tente novamente.' };
        }
        return { user: null, error: 'Erro ao fazer login. Tente novamente mais tarde.' };
      }
      if (!authData.user) return { user: null, error: 'Erro ao obter utilizador.' };

      // 2. Fetch extra profile data (Role, Name, Avatar, Phone, Multi-tenant fields)
      let profileData = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (!error) {
          profileData = data;
        } else if (error.code !== '42P01' && error.code !== 'PGRST116') {
          console.error('Profile fetch error:', error.message);
        }
      } catch (e) {
        // Silently fail if profile table issues
      }

      // 3. Obter roles do novo sistema com display_name
      const rolesWithDisplay = await getUserRolesWithDisplay(authData.user.id);
      const roles = rolesWithDisplay.map(r => r.name);
      const primaryRole = getPrimaryRole(roles.length > 0 ? roles : [profileData?.role || 'STAFF']);

      const finalRole = primaryRole;
      const finalRoles = roles.length > 0 ? roles : [profileData?.role || 'STAFF'];

      // Obter display_name da role principal
      let roleDisplayName: string | undefined;
      if (rolesWithDisplay.length > 0) {
        // Usar o display_name da primeira role (role principal)
        roleDisplayName = rolesWithDisplay[0].displayName;
      } else if (profileData?.role) {
        // Tentar buscar display_name da role do perfil
        try {
          const { data: roleData } = await supabase
            .from('roles')
            .select('display_name')
            .eq('name', profileData.role)
            .single();
          roleDisplayName = roleData?.display_name || profileData.role;
        } catch (e) {
          roleDisplayName = profileData.role;
        }
      } else {
        roleDisplayName = 'Staff';
      }

      const name = profileData?.name || authData.user.email?.split('@')[0] || 'Utilizador';

      // 4. Atualizar last_login
      if (profileData) {
        await supabase
          .from('profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('id', authData.user.id);
      }

      const user: User = {
        id: authData.user.id,
        email: authData.user.email || '',
        phone: profileData?.phone || undefined,
        name: name,
        role: finalRole,
        roles: finalRoles,
        roleDisplayName: roleDisplayName,
        avatar: profileData?.avatar_url || `https://ui-avatars.com/api/?name=${name}&background=random`,
        customerId: profileData?.customer_id || undefined,
        isActive: profileData?.is_active !== false,
        lastLogin: new Date().toISOString(),
        isSuperAdmin: profileData?.is_super_admin === true,
        requiresStrongPassword: profileData?.requires_strong_password === true
      };

      return { user, error: null };

    } catch (e: any) {
      // Néo expor detalhes do erro
      console.error('Login error:', e);
      return { user: null, error: 'Erro ao fazer login. Tente novamente mais tarde.' };
    }
  },

  // Logout function
  // Usa scope: 'local' para evitar 403 quando a sessão está expirada (não chama o servidor)
  async signOut() {
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Fallback: limpar storage manualmente se signOut falhar (ex: sessão corrompida)
        try {
          const config = getSupabaseConfig();
          if (config?.url) {
            const match = config.url.match(/https:\/\/([^.]+)\.supabase\.co/);
            if (match?.[1]) {
              const key = `sb-${match[1]}-auth-token`;
              if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
            }
          }
        } catch {}
      }
    }
  },

  // Get current session on page load
  async getCurrentUser(): Promise<User | null> {
    if (!isSupabaseConfigured() || !supabase) return null;

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      // Tratar erro de refresh token inválido
      if (error) {
        // Se o erro for de refresh token inválido, limpar sessão
        if (error.message?.includes('Invalid Refresh Token') ||
          error.message?.includes('Refresh Token Not Found') ||
          error.message?.includes('JWT')) {
          console.warn('Refresh token inválido, limpando sessão:', error.message);
          try {
            await supabase.auth.signOut();
          } catch (signOutError) {
            // Ignorar erros ao fazer signOut
          }
          return null;
        }
        console.error('Erro ao obter sessão:', error);
        return null;
      }

      if (!session?.user) return null;

      // Fetch Profile (incluindo campos multi-tenant)
      let profileData = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (!error) profileData = data;
      } catch (e) {
        // Ignore missing table
      }

      // Obter roles do novo sistema com display_name
      const rolesWithDisplay = await getUserRolesWithDisplay(session.user.id);
      const roles = rolesWithDisplay.map(r => r.name);
      const primaryRole = getPrimaryRole(roles.length > 0 ? roles : [profileData?.role || 'STAFF']);

      const finalRole = primaryRole;
      const finalRoles = roles.length > 0 ? roles : [profileData?.role || 'STAFF'];

      // Obter display_name da role principal
      let roleDisplayName: string | undefined;
      if (rolesWithDisplay.length > 0) {
        // Usar o display_name da primeira role (role principal)
        roleDisplayName = rolesWithDisplay[0].displayName;
      } else if (profileData?.role) {
        // Tentar buscar display_name da role do perfil
        try {
          const { data: roleData } = await supabase
            .from('roles')
            .select('display_name')
            .eq('name', profileData.role)
            .single();
          roleDisplayName = roleData?.display_name || profileData.role;
        } catch (e) {
          roleDisplayName = profileData.role;
        }
      } else {
        roleDisplayName = 'Staff';
      }

      const name = profileData?.name || session.user.email?.split('@')[0] || 'Utilizador';

      return {
        id: session.user.id,
        email: session.user.email || '',
        phone: profileData?.phone || undefined,
        name: name,
        role: finalRole,
        roles: finalRoles,
        roleDisplayName: roleDisplayName,
        avatar: profileData?.avatar_url || `https://ui-avatars.com/api/?name=${name}&background=random`,
        customerId: profileData?.customer_id || undefined,
        isActive: profileData?.is_active !== false,
        lastLogin: profileData?.last_login || undefined,
        requiresStrongPassword: profileData?.requires_strong_password === true
      };
    } catch (e) {
      return null;
    }
  },

  // Verificar se usué¡rio tem permissão
  async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) return false;

    try {
      const { data, error } = await supabase
        .rpc('user_has_permission', {
          user_uuid: userId,
          permission_name: permissionName
        });

      if (error) {
        console.error('Error checking permission:', error);
        return false;
      }

      return data === true;
    } catch (e) {
      console.error('Error in hasPermission:', e);
      return false;
    }
  },

  // Login com Google OAuth usando popup
  async signInWithGooglePopup(): Promise<{ user: User | null, error: string | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: 'Supabase néo configurado.' };
    }

    try {
      // Construir URL de redirect baseada no ambiente atual
      const hostname = window.location.hostname.toLowerCase();
      const isDev = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.endsWith('.local');

      const PRODUCTION_DOMAIN = 'quintanicy.com';

      let redirectUrl: string;

      if (isDev) {
        // Usar a porta atual do navegador em vez de forçar 5173
        const protocol = window.location.protocol;
        const port = window.location.port;
        const hostname = window.location.hostname;
        const pathname = window.location.pathname || '/';

        // Se não houver porta na URL (porta padrão), usar hostname completo
        if (port) {
          redirectUrl = `${protocol}//${hostname}:${port}${pathname}`;
        } else {
          redirectUrl = `${protocol}//${hostname}${pathname}`;
        }
      } else {
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const pathname = window.location.pathname || '/';
        redirectUrl = `${protocol}//${PRODUCTION_DOMAIN}${pathname}`;
        redirectUrl = redirectUrl.replace(/:\d+/, '');
      }

      // Obter URL OAuth sem redirecionar
      const { error, data } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account', // Forçar seleçéo de conta
          },
          skipBrowserRedirect: true // Néo redirecionar, apenas obter URL
        }
      });

      if (error) {
        console.error('OAuth error:', error);
        return { user: null, error: error.message };
      }

      if (!data?.url) {
        return { user: null, error: 'Erro ao gerar URL de autenticaçéo.' };
      }

      // Abrir popup
      const width = 500;
      const height = 600;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        data.url,
        'google-login',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes,location=no,directories=no,status=no`
      );

      // Monitorar popup
      return await monitorOAuthPopup(popup, redirectUrl);
    } catch (e: any) {
      console.error('OAuth exception:', e);
      return { user: null, error: e.message || 'Erro ao iniciar login com Google.' };
    }
  },

  // Login com Google OAuth (mé©todo original - mantido para compatibilidade)
  async signInWithGoogle(): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: 'Supabase néo configurado.' };
    }

    try {
      // Construir URL de redirect baseada no ambiente atual
      // IMPORTANTE: Sempre usar a URL do FRONTEND, nunca do backend
      // Detecçéo mais robusta de produçéo
      const hostname = window.location.hostname.toLowerCase();
      const isDev = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.endsWith('.local');

      // Domé­nio de produçéo fixo
      const PRODUCTION_DOMAIN = 'quintanicy.com';

      let redirectUrl: string;

      if (isDev) {
        // Usar a porta atual do navegador em vez de forçar 5173
        const protocol = window.location.protocol;
        const pathname = window.location.pathname || '/';
        const port = window.location.port;
        const hostname = window.location.hostname;

        // Se não houver porta na URL (porta padrão), usar hostname completo
        if (port) {
          redirectUrl = `${protocol}//${hostname}:${port}${pathname}`;
        } else {
          redirectUrl = `${protocol}//${hostname}${pathname}`;
        }

        console.log('ðŸ”§ Development mode: Using current port');
      } else {
        // Em PRODUé‡éƒO: SEMPRE usar o domé­nio de produçéo fixo
        // Néo confiar no hostname atual, pode estar vindo de um proxy ou configuraçéo errada
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const pathname = window.location.pathname || '/';

        // SEMPRE usar o domé­nio de produçéo, independente do hostname atual
        redirectUrl = `${protocol}//${PRODUCTION_DOMAIN}${pathname}`;

        // Garantir que néo hé¡ porta na URL
        redirectUrl = redirectUrl.replace(/:\d+/, '');

        console.log('ðŸŒ Production mode: Using fixed production domain:', PRODUCTION_DOMAIN);
      }

      // Validaçéo CRéTICA: garantir que nunca usa localhost ou porta 3000
      // Mesmo em produçéo, se por algum motivo o cé³digo chegou aqui com localhost, corrigir
      if (redirectUrl.includes('localhost') || redirectUrl.includes('127.0.0.1') || redirectUrl.includes(':3000')) {
        console.error('âŒ ERRO CRéTICO: Redirect URL conté©m localhost ou porta 3000!');
        if (isDev) {
          // Em dev, usar a porta atual do navegador
          const currentPort = window.location.port;
          const hostname = window.location.hostname;
          const protocol = window.location.protocol;
          const pathname = window.location.pathname || '/';

          if (currentPort) {
            redirectUrl = `${protocol}//${hostname}:${currentPort}${pathname}`;
          } else {
            redirectUrl = `${protocol}//${hostname}${pathname}`;
          }
        } else {
          // Em produçéo, forçar domé­nio de produçéo
          const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
          redirectUrl = `${protocol}//${PRODUCTION_DOMAIN}${window.location.pathname || '/'}`;
          redirectUrl = redirectUrl.replace(/:\d+/, '');
        }
        console.log('âœ… Corrigido para:', redirectUrl);
      }

      // Logs detalhados para debug
      console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
      console.log('ðŸ” OAuth Configuration:');
      console.log('  Current URL:', window.location.href);
      console.log('  Hostname:', hostname);
      console.log('  Environment:', isDev ? 'development' : 'production');
      console.log('  Production Domain:', PRODUCTION_DOMAIN);
      console.log('  Redirect URL:', redirectUrl);
      console.log('  Contains localhost?', redirectUrl.includes('localhost'));
      console.log('  Contains :3000?', redirectUrl.includes(':3000'));
      console.log('  Contains production domain?', redirectUrl.includes(PRODUCTION_DOMAIN));
      console.log('  âš ï¸ Usando mesma base de dados em dev e prod');
      console.log('  âš ï¸ Certifique-se de que AMBAS URLs estéo no Supabase Dashboard');
      console.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');

      // Validaçéo FINAL antes de enviar ao Supabase
      // Garantir que redirectUrl esté¡ correto
      if (!isDev && (redirectUrl.includes('localhost') || redirectUrl.includes(':3000'))) {
        console.error('âŒ ERRO FINAL: Redirect URL ainda conté©m localhost ou :3000!');
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        redirectUrl = `${protocol}//${PRODUCTION_DOMAIN}${window.location.pathname || '/'}`;
        redirectUrl = redirectUrl.replace(/:\d+/, '');
        console.log('âœ… URL final corrigida:', redirectUrl);
      }

      const { error, data } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          // Forçar o uso da nossa URL, ignorando configurações do Dashboard
          skipBrowserRedirect: false
        }
      });

      if (data?.url) {
        console.log('âœ… OAuth URL generated by Supabase:', data.url);

        // Verificar se a URL gerada pelo Supabase conté©m problemas
        if (data.url.includes('localhost:3000') || (!isDev && data.url.includes('localhost'))) {
          console.error('âš ï¸ ATENé‡éƒO CRéTICA: URL gerada pelo Supabase conté©m localhost:3000 ou localhost!');
          console.error('   Isso indica que o Supabase Dashboard tem uma URL configurada incorretamente.');
          console.error('   A URL que enviamos foi:', redirectUrl);
          console.error('   Mas o Supabase gerou:', data.url);
          console.error('   Aé‡éƒO NECESSéRIA:');
          console.error('   1. Acesse: https://supabase.com/dashboard/project/[seu-projeto]/auth/url-configuration');
          console.error('   2. Configure "Site URL" para: https://quintanicy.com');
          console.error('   3. Adicione em "Redirect URLs": https://quintanicy.com/**');
          console.error('   4. Remova qualquer URL com localhost:3000');
        }

        // Em produçéo, verificar se a URL gerada usa o domé­nio correto
        if (!isDev && !data.url.includes(PRODUCTION_DOMAIN)) {
          console.warn('âš ï¸ URL gerada pelo Supabase néo conté©m o domé­nio de produçéo esperado');
          console.warn('   Esperado:', PRODUCTION_DOMAIN);
          console.warn('   URL gerada:', data.url);
        }
      }

      if (error) {
        console.error('OAuth error:', error);
        return { error: error.message };
      }

      return { error: null };
    } catch (e: any) {
      console.error('OAuth exception:', e);
      return { error: e.message || 'Erro ao iniciar login com Google.' };
    }
  },

  // Processar callback OAuth e criar/atualizar perfil
  async handleOAuthCallback(): Promise<{ user: User | null, error: string | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: 'Supabase néo configurado.' };
    }

    try {
      // O Supabase processa automaticamente o hash fragment (#access_token=...)
      // Precisamos aguardar um pouco para o Supabase processar
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verificar sessão apé³s processar o hash
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
        return { user: null, error: 'Erro ao processar autenticaçéo. Tente novamente.' };
      }

      if (!session?.user) {
        // Tentar obter usué¡rio diretamente
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.log('No session or user found, waiting for OAuth callback...');
          return { user: null, error: null }; // Ainda processando
        }
        // Se temos usué¡rio mas néo sessão, criar sessão manualmente néo é© possé­vel
        // O Supabase deve criar a sessão automaticamente
        return { user: null, error: null };
      }

      const userId = session.user.id;
      const email = session.user.email || '';
      const name = session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        email.split('@')[0] ||
        'Utilizador';
      const avatarUrl = session.user.user_metadata?.avatar_url ||
        session.user.user_metadata?.picture ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

      // Verificar se perfil jé¡ existe
      let profileData = null;
      try {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (!profileError && data) {
          profileData = data;
        }
      } catch (e) {
        // Tabela profiles pode néo existir ainda
      }

      // Criar ou atualizar perfil
      if (!profileData) {
        // Criar novo perfil para usué¡rio Google
        try {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              name: name,
              avatar_url: avatarUrl,
              role: 'CLIENTE', // Role padréo para novos usué¡rios Google
              is_active: true,
              last_login: new Date().toISOString()
            })
            .select()
            .single();

          if (!createError && newProfile) {
            profileData = newProfile;
            console.log('âœ… Perfil criado com role CLIENTE:', newProfile);
          } else if (createError && createError.code === '23505') {
            // Perfil jé¡ existe (criado por trigger) - atualizar para CLIENTE
            console.log('âš ï¸ Perfil jé¡ existe (criado por trigger), atualizando role para CLIENTE...');
            const { data: updatedProfile, error: updateError } = await supabase
              .from('profiles')
              .update({
                role: 'CLIENTE',
                name: name,
                avatar_url: avatarUrl,
                is_active: true,
                last_login: new Date().toISOString()
              })
              .eq('id', userId)
              .select()
              .single();

            if (!updateError && updatedProfile) {
              profileData = updatedProfile;
              console.log('âœ… Perfil atualizado para role CLIENTE:', updatedProfile);
            } else {
              console.error('Error updating profile role:', updateError);
              // Tentar buscar o perfil existente
              const { data: existingProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
              if (existingProfile) {
                profileData = existingProfile;
              }
            }
          } else {
            console.error('Error creating profile:', createError);
          }
        } catch (e) {
          console.error('Error in profile creation:', e);
          // Tentar buscar perfil existente em caso de erro
          try {
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
            if (existingProfile) {
              profileData = existingProfile;
              // Se o perfil existente tem role diferente de CLIENTE, atualizar
              if (existingProfile.role !== 'CLIENTE' && email !== 'admin@quintanicy.com') {
                await supabase
                  .from('profiles')
                  .update({ role: 'CLIENTE' })
                  .eq('id', userId);
                profileData.role = 'CLIENTE';
              }
            }
          } catch (fetchError) {
            console.error('Error fetching existing profile:', fetchError);
          }
        }
      } else {
        // Atualizar perfil existente
        // IMPORTANTE: Se o perfil foi criado por trigger com role STAFF, atualizar para CLIENTE
        try {
          const updateData: any = {
            name: name,
            avatar_url: avatarUrl,
            last_login: new Date().toISOString()
          };

          // Se o perfil existente tem role STAFF e néo é© admin, atualizar para CLIENTE
          if (profileData.role === 'STAFF' && email !== 'admin@quintanicy.com') {
            console.log('âš ï¸ Perfil existente tem role STAFF, atualizando para CLIENTE...');
            updateData.role = 'CLIENTE';
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating profile:', updateError);
          } else {
            // Buscar perfil atualizado
            const { data: updatedProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();

            if (updatedProfile) {
              profileData = updatedProfile;
              console.log('âœ… Perfil atualizado:', {
                role: updatedProfile.role,
                name: updatedProfile.name
              });
            }
          }
        } catch (e) {
          console.error('Error updating profile:', e);
        }
      }

      // Obter roles do sistema
      const roles = await getUserRoles(userId);

      // Para novos usué¡rios Google, garantir que recebem role CLIENTE
      const defaultRole = profileData?.role || 'CLIENTE';
      const primaryRole = getPrimaryRole(roles.length > 0 ? roles : [defaultRole]);

      // Force ADMIN for specific email
      const isHardcodedAdmin = email === 'admin@quintanicy.com';
      const finalRole = isHardcodedAdmin ? UserRole.ADMIN : primaryRole;
      const finalRoles = isHardcodedAdmin ? ['ADMIN'] : (roles.length > 0 ? roles : [defaultRole]);

      // Log para debug
      console.log('ðŸ‘¤ User roles after OAuth:', {
        userId,
        email,
        profileRole: profileData?.role,
        systemRoles: roles,
        finalRole,
        finalRoles,
        isClientOnly: finalRole === UserRole.CLIENTE || (finalRoles.length === 1 && finalRoles[0] === 'CLIENTE')
      });

      const user: User = {
        id: userId,
        email: email,
        phone: profileData?.phone || undefined,
        name: name,
        role: finalRole,
        roles: finalRoles,
        avatar: avatarUrl,
        customerId: profileData?.customer_id || undefined,
        isActive: profileData?.is_active !== false,
        lastLogin: new Date().toISOString(),
        requiresStrongPassword: profileData?.requires_strong_password !== false
      };

      return { user, error: null };
    } catch (e: any) {
      return { user: null, error: e.message || 'Erro ao processar autenticaçéo Google.' };
    }
  },

  // Recuperaçéo de senha
  async resetPassword(email: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: 'Supabase néo configurado.' };
    }

    if (!validateEmail(email)) {
      return { error: 'Email invé¡lido.' };
    }

    try {
      // Construir URL de redirect para reset de senha
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      let redirectUrl: string;

      if (isDev) {
        // Usar a porta atual do navegador
        const protocol = window.location.protocol;
        const port = window.location.port;
        const hostname = window.location.hostname;

        if (port && port !== '80' && port !== '443') {
          redirectUrl = `${protocol}//${hostname}:${port}/reset-password`;
        } else {
          redirectUrl = `${protocol}//${hostname}/reset-password`;
        }
      } else {
        redirectUrl = `${window.location.protocol}//${window.location.hostname}/reset-password`;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Erro ao enviar email de recuperaçéo.' };
    }
  },

  // Criar conta (sign up)
  async signUp(email: string, password: string, name: string, phone?: string): Promise<{ user: User | null, error: string | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { user: null, error: 'Supabase néo configurado.' };
    }

    // Validaçéµes
    if (!validateEmail(email)) {
      return { user: null, error: 'Email invé¡lido.' };
    }

    if (password.length < 6) {
      return { user: null, error: 'Senha deve ter pelo menos 6 caracteres.' };
    }

    if (!name || name.trim().length < 2) {
      return { user: null, error: 'Nome deve ter pelo menos 2 caracteres.' };
    }

    try {
      // Criar usué¡rio no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            name: name.trim(),
            phone: phone?.trim()
          }
        }
      });

      if (authError) {
        // Verificar se é© erro de email jé¡ cadastrado
        const errorMessage = authError.message || '';
        if (errorMessage.includes('already registered') ||
          errorMessage.includes('already exists') ||
          errorMessage.includes('email address has already been registered') ||
          errorMessage.includes('User already registered') ||
          errorMessage.includes('already been taken')) {
          return {
            user: null,
            error: 'Este email jé¡ esté¡ cadastrado. Use "Fazer login" ao invé©s de "Criar conta". Se esqueceu sua senha, use "Esqueceu a senha?".'
          };
        }
        return { user: null, error: authError.message };
      }

      if (!authData.user) {
        return { user: null, error: 'Erro ao criar usué¡rio.' };
      }

      // O trigger do banco criaré¡ o perfil automaticamente com role STAFF
      // Precisamos atualizar para CLIENTE
      const userId = authData.user.id;

      // Aguardar um pouco para o trigger criar o perfil
      await new Promise(resolve => setTimeout(resolve, 500));

      // Atualizar perfil para role CLIENTE (signUp já exige senha forte no modal, marcar como não precisar de troca)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          role: 'CLIENTE',
          name: name.trim(),
          phone: phone?.trim() || null,
          is_active: true,
          requires_strong_password: false
        })
        .eq('id', userId);

      if (profileError) {
        console.error('Error updating profile role:', profileError);
        // Continuar mesmo se falhar, o usué¡rio pode atualizar depois
      }

      // Buscar perfil criado
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Criar objeto User (novo registo com senha forte não exige modal)
      const user: User = {
        id: userId,
        email: email.trim(),
        phone: phone?.trim() || undefined,
        name: name.trim(),
        role: UserRole.CLIENTE,
        roles: ['CLIENTE'],
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name.trim())}&background=random`,
        isActive: true,
        requiresStrongPassword: false
      };

      return { user, error: null };
    } catch (e: any) {
      return { user: null, error: e.message || 'Erro ao criar conta.' };
    }
  },

  // Atualizar perfil do usué¡rio
  async updateProfile(userId: string, data: { name?: string; phone?: string; avatar_url?: string }): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, error: 'Supabase néo configurado' };
    }

    try {
      const updateData: any = {};

      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }
      if (data.phone !== undefined) {
        updateData.phone = data.phone?.trim() || null;
      }
      if (data.avatar_url !== undefined) {
        updateData.avatar_url = data.avatar_url;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        console.error('Erro ao atualizar perfil:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e: any) {
      console.error('Erro ao atualizar perfil:', e);
      return { success: false, error: e.message || 'Erro ao atualizar perfil' };
    }
  }
};

