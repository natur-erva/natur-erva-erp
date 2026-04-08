/**
 * Serviço de configuração e cliente Supabase
 * 
 * Sistema de configuração em camadas:
 * 1. Variáveis de ambiente (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
 * 2. localStorage (para configuração dinâmica via UI)
 * 3. null (requer configuração)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig, ConfigInfo, SupabaseClientInstance } from '../types/supabaseConfig';
import { ConfigSource } from '../types/supabaseConfig';
import { validateSupabaseConfig } from '../utils/supabaseConfigValidator';

// Chaves do localStorage
const STORAGE_KEY_URL = 'naturerva_supabase_url';
const STORAGE_KEY_KEY = 'naturerva_supabase_key';
const STORAGE_KEY_GOOGLE_CLIENT_ID = 'naturerva_google_client_id';

// Instância singleton do cliente
let clientInstance: SupabaseClientInstance = null;
let currentConfigSource: ConfigSource = ConfigSource.NONE;

/**
 * Obtém configuração das variáveis de ambiente
 */
const getConfigFromEnv = (): SupabaseConfig | null => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    return {
      url: url.trim(),
      anonKey: anonKey.trim(),
      serviceRoleKey: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim(),
      googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
    };
  }

  return null;
};

/**
 * Obtém configuração do localStorage
 */
const getConfigFromLocalStorage = (): SupabaseConfig | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = localStorage.getItem(STORAGE_KEY_URL);
  const key = localStorage.getItem(STORAGE_KEY_KEY);

  if (url && key) {
    return {
      url: url.trim(),
      anonKey: key.trim(),
      googleClientId: localStorage.getItem(STORAGE_KEY_GOOGLE_CLIENT_ID)?.trim() || undefined
    };
  }

  return null;
};

/**
 * Obtém a configuração do Supabase seguindo a ordem de prioridade:
 * 1. Variáveis de ambiente
 * 2. localStorage
 * 3. null
 */
export const getSupabaseConfig = (): SupabaseConfig | null => {
  // Prioridade 1: Variáveis de ambiente
  const envConfig = getConfigFromEnv();
  if (envConfig) {
    return envConfig;
  }

  // Prioridade 2: localStorage
  const storageConfig = getConfigFromLocalStorage();
  if (storageConfig) {
    return storageConfig;
  }

  // Prioridade 3: Nenhuma configuração
  return null;
};

/**
 * Obtém informações sobre a configuração atual
 */
export const getConfigInfo = (): ConfigInfo => {
  const envConfig = getConfigFromEnv();
  if (envConfig) {
    return {
      config: envConfig,
      source: ConfigSource.ENV,
      isConfigured: true
    };
  }

  const storageConfig = getConfigFromLocalStorage();
  if (storageConfig) {
    return {
      config: storageConfig,
      source: ConfigSource.LOCAL_STORAGE,
      isConfigured: true
    };
  }

  return {
    config: null,
    source: ConfigSource.NONE,
    isConfigured: false
  };
};

/**
 * Verifica se a configuração atual vem de variáveis de ambiente (read-only)
 */
export const isConfigFromEnv = (): boolean => {
  return getConfigFromEnv() !== null;
};

/**
 * Salva configuração no localStorage
 * Nota: Se estiver usando variáveis de ambiente, esta função não terá efeito
 */
export const saveSupabaseConfig = (
  url: string,
  key: string,
  googleClientId?: string
): void => {
  // Se estiver usando variáveis de ambiente, não permitir sobrescrever
  if (isConfigFromEnv()) {
    throw new Error('Não é possível alterar configuração quando usando variáveis de ambiente. Configure via arquivo .env');
  }

  // Validar campos obrigatórios
  if (!url || !key) {
    throw new Error('URL e Key são obrigatórios');
  }

  // Validar configuração antes de salvar
  const config: SupabaseConfig = {
    url: url.trim(),
    anonKey: key.trim(),
    googleClientId: googleClientId?.trim()
  };

  const validation = validateSupabaseConfig(config);
  if (!validation.isValid) {
    throw new Error(`Configuração inválida: ${validation.errors.join('; ')}`);
  }

  // Salvar no localStorage
  localStorage.setItem(STORAGE_KEY_URL, config.url);
  localStorage.setItem(STORAGE_KEY_KEY, config.anonKey);

  // Salvar Google Client ID se fornecido
  if (googleClientId !== undefined) {
    if (googleClientId.trim() !== '') {
      localStorage.setItem(STORAGE_KEY_GOOGLE_CLIENT_ID, googleClientId.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_GOOGLE_CLIENT_ID);
    }
  }
};

/**
 * Obtém Google Client ID
 */
export const getGoogleClientId = (): string => {
  // Prioridade: env > localStorage
  const envId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (envId) {
    return envId.trim();
  }

  if (typeof window !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY_GOOGLE_CLIENT_ID) || '';
  }

  return '';
};

/**
 * Obtém Service Role Key apenas de variáveis de ambiente
 */
export const getServiceRoleKey = (): string => {
  const envKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  return envKey ? envKey.trim() : '';
};

/**
 * Limpa configuração do localStorage
 * Nota: Não remove variáveis de ambiente
 */
export const clearSupabaseConfig = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_KEY);
  localStorage.removeItem(STORAGE_KEY_GOOGLE_CLIENT_ID);
};

/**
 * Remove sessão do Supabase do localStorage (garante logout ao recarregar)
 */
export const clearSupabaseAuthStorage = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && ((key.startsWith('sb-') && key.includes('-auth-token')) || key === 'supabase.auth.token')) {
      keys.push(key);
    }
  }
  keys.forEach(k => localStorage.removeItem(k));
};

/**
 * Cria uma nova instância do cliente Supabase
 */
const createSupabaseClient = (config: SupabaseConfig): SupabaseClientInstance => {
  try {
    return createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  } catch (error) {
    console.error('Erro ao criar cliente Supabase:', error);
    return null;
  }
};

/**
 * Obtém ou cria a instância singleton do cliente Supabase
 */
export const getSupabaseClient = (): SupabaseClientInstance => {
  // Se já existe uma instância e a configuração não mudou, retornar existente
  if (clientInstance) {
    const configInfo = getConfigInfo();
    if (configInfo.isConfigured && configInfo.source === currentConfigSource) {
      return clientInstance;
    }
  }

  // Obter configuração
  const config = getSupabaseConfig();
  if (!config) {
    console.warn('[Supabase] Nenhuma configuração encontrada. Configure via Settings > Connection Settings ou variáveis de ambiente.');
    clientInstance = null;
    currentConfigSource = ConfigSource.NONE;
    return null;
  }

  // Validar configuração antes de criar cliente
  const validation = validateSupabaseConfig(config);
  if (!validation.isValid) {
    console.error('[Supabase] Configuração inválida:', validation.errors);
    clientInstance = null;
    currentConfigSource = ConfigSource.NONE;
    return null;
  }

  // Criar nova instância
  try {
    clientInstance = createSupabaseClient(config);
    currentConfigSource = getConfigInfo().source;
    return clientInstance;
  } catch (error) {
    console.error('[Supabase] Erro ao criar cliente:', error);
    clientInstance = null;
    currentConfigSource = ConfigSource.NONE;
    return null;
  }
};

/**
 * Reinicializa o cliente Supabase (útil após mudança de configuração)
 */
export const reinitializeClient = (): SupabaseClientInstance => {
  // Limpar instância existente
  clientInstance = null;
  currentConfigSource = ConfigSource.NONE;

  // Criar nova instância
  return getSupabaseClient();
};

/**
 * Verifica se o Supabase está configurado
 */
export const isSupabaseConfigured = (): boolean => {
  return getSupabaseClient() !== null;
};

/**
 * Cria cliente admin com service role key
 * Nota: Use com cuidado - service role key bypassa RLS
 */
export const getAdminClient = (): SupabaseClientInstance => {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    return null;
  }

  try {
    return createClient(config.url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  } catch (error) {
    console.error('Erro ao criar cliente admin Supabase:', error);
    return null;
  }
};

// Exportar instância para compatibilidade com código existente
// Usar Proxy para sempre retornar o cliente atualizado (lazy loading)
let _supabaseProxy: any = null;

// Função helper para obter o cliente atualizado
const getCurrentClient = (): SupabaseClientInstance => {
  return getSupabaseClient();
};

export const supabase = (() => {
  if (_supabaseProxy) {
    return _supabaseProxy;
  }

  // Criar Proxy que sempre busca o cliente atualizado
  _supabaseProxy = new Proxy({} as SupabaseClientInstance, {
    get(target, prop) {
      const client = getCurrentClient();
      
      // Se não há cliente, retornar null para propriedades importantes
      if (!client) {
        // Para verificações de existência, retornar null
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined; // Para evitar que seja tratado como Promise
        }
        // Retornar funções vazias que retornam null para evitar erros
        if (typeof prop === 'string') {
          if (prop === 'from' || prop === 'auth' || prop === 'rpc' || prop === 'storage') {
            return () => {
              console.warn('[Supabase] Cliente não configurado. Configure via Settings > Connection Settings ou variáveis de ambiente.');
              return null;
            };
          }
        }
        return null;
      }
      
      const value = (client as any)[prop];
      // Se for uma função, garantir que o contexto seja mantido
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    },
    // Interceptar verificações de truthiness
    has(target, prop) {
      const client = getCurrentClient();
      if (!client) return false;
      return prop in client;
    },
    // Para verificações como 'if (supabase)'
    getOwnPropertyDescriptor(target, prop) {
      const client = getCurrentClient();
      if (!client) return undefined;
      return Object.getOwnPropertyDescriptor(client, prop);
    }
  });

  // Fazer o Proxy ser falsy quando não há cliente (para verificações como 'if (supabase)')
  // Isso é feito através de Symbol.toPrimitive
  Object.defineProperty(_supabaseProxy, Symbol.toPrimitive, {
    value: function(hint: string) {
      const client = getCurrentClient();
      if (!client) {
        return null; // Retorna null quando convertido para primitivo
      }
      return hint === 'number' ? 1 : hint === 'string' ? '[object SupabaseClient]' : true;
    }
  });

  // Sobrescrever valueOf e toString para retornar null quando não configurado
  // Isso permite que verificações como 'if (supabase)' funcionem corretamente
  Object.defineProperty(_supabaseProxy, 'valueOf', {
    value: function() {
      const client = getCurrentClient();
      return client ? client : null;
    }
  });

  Object.defineProperty(_supabaseProxy, 'toString', {
    value: function() {
      const client = getCurrentClient();
      return client ? '[object SupabaseClient]' : 'null';
    }
  });

  return _supabaseProxy;
})();

/**
 * Função de diagnóstico para verificar configuração atual
 * Execute no console: window.diagnoseSupabaseConfig()
 */
if (typeof window !== 'undefined') {
  (window as any).diagnoseSupabaseConfig = () => {
    console.log('=== Diagnóstico de Configuração Supabase ===');
    const configInfo = getConfigInfo();
    console.log('Origem:', configInfo.source);
    console.log('Configurado:', configInfo.isConfigured);
    
    if (configInfo.config) {
      console.log('URL:', configInfo.config.url);
      console.log('Anon Key (primeiros 20 chars):', configInfo.config.anonKey.substring(0, 20) + '...');
      
      const validation = validateSupabaseConfig(configInfo.config);
      console.log('Validação:', validation.isValid ? '✅ Válida' : '❌ Inválida');
      if (!validation.isValid) {
        console.error('Erros:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Avisos:', validation.warnings);
      }
    } else {
      console.warn('❌ Nenhuma configuração encontrada');
    }
    
    const client = getSupabaseClient();
    console.log('Cliente inicializado:', client ? '✅ Sim' : '❌ Não');
    
    // Verificar localStorage
    if (typeof window !== 'undefined') {
      const lsUrl = localStorage.getItem(STORAGE_KEY_URL);
      const lsKey = localStorage.getItem(STORAGE_KEY_KEY);
      console.log('\n=== localStorage ===');
      console.log('URL:', lsUrl || '(não definido)');
      console.log('Key:', lsKey ? lsKey.substring(0, 20) + '...' : '(não definido)');
    }
    
    // Verificar variáveis de ambiente
    console.log('\n=== Variáveis de Ambiente ===');
    console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL || '(não definido)');
    console.log('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? import.meta.env.VITE_SUPABASE_ANON_KEY.substring(0, 20) + '...' : '(não definido)');
    
    console.log('\n=== Fim do Diagnóstico ===');
  };
}
