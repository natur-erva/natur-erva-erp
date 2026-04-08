import { supabase, isSupabaseConfigured } from './supabaseClient';
import { APP_TIMEZONE } from '../utils/dateUtils';
import { ShopVisit, AdminActivityLog } from '../../core/types/types';

/**
 * Utilité¡rio para detectar Informações do dispositivo e navegador
 */
const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const screen = window.screen;
  
  // Detectar dispositivo
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
    deviceType = 'mobile';
  }

  // Detectar navegador
  let browser = 'Unknown';
  let browserVersion = '';
  if (ua.indexOf('Firefox') > -1) {
    browser = 'Firefox';
    browserVersion = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || '';
  } else if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
    browser = 'Chrome';
    browserVersion = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] || '';
  } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
    browser = 'Safari';
    browserVersion = ua.match(/Version\/(\d+\.\d+)/)?.[1] || '';
  } else if (ua.indexOf('Edg') > -1) {
    browser = 'Edge';
    browserVersion = ua.match(/Edg\/(\d+\.\d+)/)?.[1] || '';
  }

  // Detectar OS
  let os = 'Unknown';
  let osVersion = '';
  if (ua.indexOf('Windows') > -1) {
    os = 'Windows';
    osVersion = ua.match(/Windows NT (\d+\.\d+)/)?.[1] || '';
  } else if (ua.indexOf('Mac') > -1) {
    os = 'macOS';
    osVersion = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
  } else if (ua.indexOf('Linux') > -1) {
    os = 'Linux';
  } else if (ua.indexOf('Android') > -1) {
    os = 'Android';
    osVersion = ua.match(/Android (\d+\.\d+)/)?.[1] || '';
  } else if (ua.indexOf('iOS') > -1 || ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) {
    os = 'iOS';
    osVersion = ua.match(/OS (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
  }

  return {
    deviceType,
    browser,
    browserVersion,
    os,
    osVersion,
    screenResolution: `${screen.width}x${screen.height}`,
    language: navigator.language || navigator.languages?.[0] || 'pt',
    timezone: APP_TIMEZONE
  };
};

/**
 * Gerar ou recuperar ID de visitante éºnico
 */
const getVisitorId = (): string => {
  const storageKey = 'naturerva_visitor_id';
  let visitorId = localStorage.getItem(storageKey);
  
  if (!visitorId) {
    visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(storageKey, visitorId);
  }
  
  return visitorId;
};

/**
 * Gerar ou recuperar ID de sessão
 */
const getSessionId = (): string => {
  const storageKey = 'naturerva_session_id';
  const sessionKey = 'naturerva_session_start';
  
  let sessionId = sessionStorage.getItem(storageKey);
  const sessionStart = sessionStorage.getItem(sessionKey);
  const now = Date.now();
  
  // Nova sessão se passou mais de 30 minutos de inatividade ou néo existe
  if (!sessionId || !sessionStart || (now - parseInt(sessionStart)) > 30 * 60 * 1000) {
    sessionId = `session_${now}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(storageKey, sessionId);
    sessionStorage.setItem(sessionKey, now.toString());
  } else {
    // Atualizar timestamp da sessão
    sessionStorage.setItem(sessionKey, now.toString());
  }
  
  return sessionId;
};

/**
 * Obter IP do usué¡rio (via API externa)
 */
const getIpAddress = async (): Promise<string | undefined> => {
  try {
    // Tentar méºltiplas APIs para maior confiabilidade
    const apis = [
      'https://api.ipify.org?format=json',
      'https://ipapi.co/json/',
      'https://api.myip.com'
    ];

    for (const api of apis) {
      try {
        const response = await fetch(api, { signal: AbortSignal.timeout(3000) });
        const data = await response.json();
        return data.ip || data.query || data.ipAddress;
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.warn('Erro ao obter IP:', error);
  }
  return undefined;
};

export const trackingService = {
  /**
   * Registrar visita na loja online
   */
  async trackShopVisit(data: {
    pagePath: string;
    pageTitle?: string;
    customerId?: string;
    userId?: string;
    productsViewed?: string[];
    actions?: Array<{ type: string; timestamp: string; data?: any }>;
    visitDuration?: number;
    metadata?: Record<string, any>;
  }): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      return false;
    }

    try {
      const deviceInfo = getDeviceInfo();
      const visitorId = getVisitorId();
      const sessionId = getSessionId();
      const ipAddress = await getIpAddress();

      const visitData = {
        visitor_id: visitorId,
        customer_id: data.customerId || null,
        user_id: data.userId || null,
        page_path: data.pagePath,
        page_title: data.pageTitle || document.title,
        referrer: document.referrer || null,
        ip_address: ipAddress || null,
        user_agent: navigator.userAgent,
        device_type: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        browser_version: deviceInfo.browserVersion,
        os: deviceInfo.os,
        os_version: deviceInfo.osVersion,
        screen_resolution: deviceInfo.screenResolution,
        language: deviceInfo.language,
        timezone: deviceInfo.timezone,
        session_id: sessionId,
        visit_duration: data.visitDuration || null,
        products_viewed: data.productsViewed || [],
        actions: data.actions || [],
        metadata: data.metadata || {}
      };

      const { error } = await supabase
        .from('shop_visits')
        .insert(visitData);

      if (error) {
        console.error('Erro ao registrar visita:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erro ao rastrear visita:', error);
      return false;
    }
  },

  /**
   * Registrar açéo na loja online (produto visualizado, adicionado ao carrinho, etc.)
   */
  async trackShopAction(actionType: string, data?: any): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      return false;
    }

    try {
      const action = {
        type: actionType,
        timestamp: new Date().toISOString(),
        data: data || {}
      };

      // Buscar éºltima visita da sessão
      const sessionId = getSessionId();
      const { data: visits, error: fetchError } = await supabase
        .from('shop_visits')
        .select('id, actions')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError) {
        console.warn('Erro ao buscar éºltima visita:', fetchError);
        // Continuar mesmo se néo conseguir buscar - néo é© cré­tico
        return true;
      }

      if (visits && visits.length > 0) {
        const lastVisit = visits[0];
        const actions = (lastVisit.actions as any[]) || [];
        actions.push(action);

        const { error } = await supabase
          .from('shop_visits')
          .update({ actions })
          .eq('id', lastVisit.id);

        if (error) {
          console.error('Erro ao atualizar açéµes:', error);
          return false;
        }
      } else {
        // Se néo hé¡ visita anterior, criar uma nova visita mé­nima apenas com a açéo
        // Isso pode acontecer se a açéo for registrada antes da visita inicial
        const deviceInfo = getDeviceInfo();
        const visitorId = getVisitorId();
        const ipAddress = await getIpAddress();

        const visitData = {
          visitor_id: visitorId,
          customer_id: null,
          user_id: null,
          page_path: window.location.pathname,
          page_title: document.title || '',
          referrer: document.referrer || null,
          ip_address: ipAddress || null,
          user_agent: navigator.userAgent,
          device_type: deviceInfo.deviceType,
          browser: deviceInfo.browser,
          browser_version: deviceInfo.browserVersion,
          os: deviceInfo.os,
          os_version: deviceInfo.osVersion,
          screen_resolution: deviceInfo.screenResolution,
          language: deviceInfo.language,
          timezone: deviceInfo.timezone,
          session_id: sessionId,
          visit_duration: null,
          products_viewed: [],
          actions: [action],
          metadata: {
            actionOnly: true // Marca que esta visita foi criada apenas para registrar uma açéo
          }
        };

        const { error: insertError } = await supabase
          .from('shop_visits')
          .insert(visitData);

        if (insertError) {
          console.error('Erro ao criar visita para açéo:', insertError);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Erro ao rastrear açéo:', error);
      return false;
    }
  },

  /**
   * Registrar atividade administrativa
   */
  async trackAdminActivity(data: {
    userId: string;
    pagePath: string;
    pageTitle?: string;
    actionType?: 'view' | 'create' | 'update' | 'delete' | 'export' | 'login' | 'logout' | string;
    actionDetails?: {
      entity?: string;
      entityId?: string;
      changes?: any;
      [key: string]: any;
    };
    duration?: number;
    metadata?: Record<string, any>;
  }): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      return false;
    }

    try {
      const deviceInfo = getDeviceInfo();
      const sessionId = getSessionId();
      const ipAddress = await getIpAddress();

      const activityData = {
        user_id: data.userId,
        page_path: data.pagePath,
        page_title: data.pageTitle || document.title,
        action_type: data.actionType || 'view',
        action_details: data.actionDetails || {},
        ip_address: ipAddress || null,
        user_agent: navigator.userAgent,
        device_type: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        browser_version: deviceInfo.browserVersion,
        os: deviceInfo.os,
        os_version: deviceInfo.osVersion,
        session_id: sessionId,
        duration: data.duration || null,
        metadata: data.metadata || {}
      };

      const { data: insertResult, error } = await supabase
        .from('admin_activity_log')
        .insert(activityData)
        .select();

      if (error) {
        console.error('âŒ Erro ao registrar atividade:', error);
        console.error('ðŸ“‹ Cé³digo do erro:', error.code);
        console.error('ðŸ“‹ Mensagem:', error.message);
        console.error('ðŸ“‹ Detalhes:', error.details);
        console.error('ðŸ“‹ Hint:', error.hint);
        console.error('ðŸ“‹ Dados que tentaram ser inseridos:', JSON.stringify(activityData, null, 2));
        
        // Se for erro de RLS, dar mensagem mais clara
        if (error.code === '42501' || error.message?.includes('row-level security')) {
          console.error('ðŸš¨ ERRO DE RLS DETECTADO!');
          console.error('ðŸ“‹ Execute o script SQL: sql/fixes/');
          console.error('ðŸ“‹ Este erro significa que as polé­ticas RLS estéo bloqueando a inserçéo');
        }
        
        return false;
      }

      if (insertResult && insertResult.length > 0) {
        return true;
      } else {
        console.warn('âš ï¸ Inserçéo retornou sem dados - mas pode ter sido bem-sucedida');
        return true; // Retornar true mesmo sem dados, pois pode ser que o select néo retorne
      }
    } catch (error) {
      console.error('Erro ao rastrear atividade:', error);
      return false;
    }
  },

  /**
   * Buscar visitas da loja online
   */
  async getShopVisits(filters?: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
    pagePath?: string;
    limit?: number;
  }): Promise<ShopVisit[]> {
    if (!isSupabaseConfigured() || !supabase) {
      return [];
    }

    try {
      let query = supabase
        .from('shop_visits')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }

      if (filters?.pagePath) {
        query = query.eq('page_path', filters.pagePath);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Buscar nomes de clientes e usué¡rios separadamente se necessé¡rio
      const customerIds = [...new Set((data || []).map((v: any) => v.customer_id).filter(Boolean))];
      const userIds = [...new Set((data || []).map((v: any) => v.user_id).filter(Boolean))];
      
      const customerMap: Record<string, string> = {};
      const userMap: Record<string, { name?: string; email?: string }> = {};
      
      // Buscar clientes se houver
      if (customerIds.length > 0) {
        try {
          const { data: customers } = await supabase
            .from('customers')
            .select('id, name')
            .in('id', customerIds.filter(Boolean));
          
          customers?.forEach((c: any) => {
            if (c?.id) customerMap[c.id] = c.name;
          });
        } catch (e) {
          console.warn('Erro ao buscar clientes:', e);
        }
      }
      
      // Buscar usué¡rios se houver (via profiles se existir, senéo via auth.users)
      if (userIds.length > 0) {
        try {
          // Filtrar IDs vé¡lidos e usar .in() apenas se houver mais de um, senéo usar .eq()
          const validUserIds = userIds.filter(Boolean);
          if (validUserIds.length === 1) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, name')
              .eq('id', validUserIds[0])
              .single();
            
            if (profile?.id) {
              userMap[profile.id] = { name: profile.name };
            }
          } else if (validUserIds.length > 1) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, name')
              .in('id', validUserIds);
            
            profiles?.forEach((p: any) => {
              if (p?.id) userMap[p.id] = { name: p.name };
            });
          }
        } catch (e) {
          // Se profiles néo existir, néo hé¡ problema - apenas néo teremos os nomes
          console.warn('Erro ao buscar perfis de usué¡rios:', e);
        }
      }

      return (data || []).map((visit: any) => ({
        id: visit.id,
        visitorId: visit.visitor_id,
        customerId: visit.customer_id,
        userId: visit.user_id,
        pagePath: visit.page_path,
        pageTitle: visit.page_title,
        referrer: visit.referrer,
        ipAddress: visit.ip_address,
        userAgent: visit.user_agent,
        deviceType: visit.device_type,
        browser: visit.browser,
        browserVersion: visit.browser_version,
        os: visit.os,
        osVersion: visit.os_version,
        screenResolution: visit.screen_resolution,
        language: visit.language,
        country: visit.country,
        city: visit.city,
        timezone: visit.timezone,
        sessionId: visit.session_id,
        visitDuration: visit.visit_duration,
        productsViewed: visit.products_viewed || [],
        actions: visit.actions || [],
        metadata: visit.metadata || {},
        createdAt: visit.created_at,
        customerName: visit.customer_id ? customerMap[visit.customer_id] : undefined,
        userName: visit.user_id ? userMap[visit.user_id]?.name : undefined
      }));
    } catch (error) {
      console.error('Erro ao buscar visitas:', error);
      return [];
    }
  },

  /**
   * Buscar atividades administrativas
   */
  async getAdminActivities(filters?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
    pagePath?: string;
    actionType?: string;
    limit?: number;
  }): Promise<AdminActivityLog[]> {
    if (!isSupabaseConfigured() || !supabase) {
      return [];
    }

    try {
      let query = supabase
        .from('admin_activity_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.pagePath) {
        query = query.eq('page_path', filters.pagePath);
      }

      if (filters?.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('âŒ Erro ao buscar atividades administrativas:', error);
        throw error;
      }

      const activitiesCount = (data || []).length;
      console.log('ðŸ“Š Tracking: Buscadas', activitiesCount, 'atividades do banco');
      
      if (activitiesCount === 0) {
        console.warn('âš ï¸ Nenhuma atividade encontrada. Verifique:');
        console.warn('  - Filtros aplicados:', filters);
        console.warn('  - Se hé¡ dados na tabela admin_activity_log');
        console.warn('  - Se as polé­ticas RLS permitem SELECT');
      }

      // Buscar nomes de usué¡rios separadamente se necessé¡rio
      const userIds = [...new Set((data || []).map((a: any) => a.user_id).filter(Boolean))];
      const userMap: Record<string, { name?: string; email?: string }> = {};
      
      console.log('ðŸ“Š Tracking: IDs de usué¡rios éºnicos encontrados:', userIds.length);
      
      if (userIds.length > 0) {
        try {
          // Filtrar IDs vé¡lidos e usar .in() apenas se houver mais de um, senéo usar .eq()
          const validUserIds = userIds.filter(Boolean);
          if (validUserIds.length === 1) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, name')
              .eq('id', validUserIds[0])
              .single();
            
            if (profile?.id) {
              userMap[profile.id] = { name: profile.name };
            }
          } else if (validUserIds.length > 1) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, name')
              .in('id', validUserIds);
            
            profiles?.forEach((p: any) => {
              if (p?.id) userMap[p.id] = { name: p.name };
            });
          }
        } catch (e) {
          // Se profiles néo existir, néo hé¡ problema - apenas néo teremos os nomes
          console.warn('Erro ao buscar perfis de usué¡rios:', e);
        }
      }

      return (data || []).map((activity: any) => ({
        id: activity.id,
        userId: activity.user_id,
        pagePath: activity.page_path,
        pageTitle: activity.page_title,
        actionType: activity.action_type,
        actionDetails: activity.action_details || {},
        ipAddress: activity.ip_address,
        userAgent: activity.user_agent,
        deviceType: activity.device_type,
        browser: activity.browser,
        browserVersion: activity.browser_version,
        os: activity.os,
        osVersion: activity.os_version,
        sessionId: activity.session_id,
        duration: activity.duration,
        metadata: activity.metadata || {},
        createdAt: activity.created_at,
        userName: activity.user_id ? userMap[activity.user_id]?.name : undefined
      }));
    } catch (error) {
      console.error('Erro ao buscar atividades:', error);
      return [];
    }
  },

  /**
   * Obter estaté­sticas de visitas
   */
  async getShopVisitStats(filters?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalVisits: number;
    uniqueVisitors: number;
    uniqueSessions: number;
    averageDuration: number;
    topPages: Array<{ path: string; count: number }>;
    topProducts: Array<{ productId: string; count: number }>;
    deviceTypes: Record<string, number>;
    browsers: Record<string, number>;
  }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        totalVisits: 0,
        uniqueVisitors: 0,
        uniqueSessions: 0,
        averageDuration: 0,
        topPages: [],
        topProducts: [],
        deviceTypes: {},
        browsers: {}
      };
    }

    try {
      let query = supabase.from('shop_visits').select('*');

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      const visits = data || [];
      const uniqueVisitors = new Set(visits.map((v: any) => v.visitor_id).filter(Boolean)).size;
      const uniqueSessions = new Set(visits.map((v: any) => v.session_id).filter(Boolean)).size;
      
      const durations = visits
        .map((v: any) => v.visit_duration)
        .filter((d: number) => d && d > 0);
      const averageDuration = durations.length > 0
        ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
        : 0;

      // Top pé¡ginas
      const pageCounts: Record<string, number> = {};
      visits.forEach((v: any) => {
        const path = v.page_path || 'unknown';
        pageCounts[path] = (pageCounts[path] || 0) + 1;
      });
      const topPages = Object.entries(pageCounts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top produtos (també©m contar de açéµes)
      const productCounts: Record<string, number> = {};
      visits.forEach((v: any) => {
        // Produtos visualizados diretamente
        const products = v.products_viewed || [];
        products.forEach((pid: string) => {
          productCounts[pid] = (productCounts[pid] || 0) + 1;
        });
        
        // Produtos de açéµes (product_view, add_to_cart)
        const actions = v.actions || [];
        actions.forEach((action: any) => {
          if (action.data?.productId) {
            const pid = action.data.productId;
            productCounts[pid] = (productCounts[pid] || 0) + 1;
          }
        });
      });
      const topProducts = Object.entries(productCounts)
        .map(([productId, count]) => ({ productId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Tipos de dispositivo
      const deviceTypes: Record<string, number> = {};
      visits.forEach((v: any) => {
        const type = v.device_type || 'unknown';
        deviceTypes[type] = (deviceTypes[type] || 0) + 1;
      });

      // Navegadores
      const browsers: Record<string, number> = {};
      visits.forEach((v: any) => {
        const browser = v.browser || 'unknown';
        browsers[browser] = (browsers[browser] || 0) + 1;
      });

      return {
        totalVisits: visits.length,
        uniqueVisitors,
        uniqueSessions,
        averageDuration: Math.round(averageDuration),
        topPages,
        topProducts,
        deviceTypes,
        browsers
      };
    } catch (error) {
      console.error('Erro ao buscar estaté­sticas:', error);
      return {
        totalVisits: 0,
        uniqueVisitors: 0,
        uniqueSessions: 0,
        averageDuration: 0,
        topPages: [],
        topProducts: [],
        deviceTypes: {},
        browsers: {}
      };
    }
  },

  /**
   * Obter estaté­sticas de atividades administrativas
   */
  async getAdminActivityStats(filters?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalActivities: number;
    uniqueUsers: number;
    topPages: Array<{ path: string; count: number }>;
    topActions: Record<string, number>;
    topUsers: Array<{ userId: string; userName?: string; count: number }>;
  }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        totalActivities: 0,
        uniqueUsers: 0,
        topPages: [],
        topActions: {},
        topUsers: []
      };
    }

    try {
      let query = supabase
        .from('admin_activity_log')
        .select('*');

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      const activities = data || [];
      const uniqueUsers = new Set(activities.map((a: any) => a.user_id)).size;

      // Buscar nomes de usué¡rios separadamente
      const userIds = [...new Set(activities.map((a: any) => a.user_id).filter(Boolean))];
      const userMap: Record<string, string> = {};
      
      if (userIds.length > 0) {
        try {
          // Filtrar IDs vé¡lidos e usar .in() apenas se houver mais de um, senéo usar .eq()
          const validUserIds = userIds.filter(Boolean);
          if (validUserIds.length === 1) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, name')
              .eq('id', validUserIds[0])
              .single();
            
            if (profile?.id) {
              userMap[profile.id] = profile.name;
            }
          } else if (validUserIds.length > 1) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, name')
              .in('id', validUserIds);
            
            profiles?.forEach((p: any) => {
              if (p?.id) userMap[p.id] = p.name;
            });
          }
        } catch (e) {
          console.warn('Erro ao buscar perfis de usué¡rios:', e);
        }
      }

      // Top pé¡ginas
      const pageCounts: Record<string, number> = {};
      activities.forEach((a: any) => {
        const path = a.page_path || 'unknown';
        pageCounts[path] = (pageCounts[path] || 0) + 1;
      });
      const topPages = Object.entries(pageCounts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top açéµes
      const actionCounts: Record<string, number> = {};
      activities.forEach((a: any) => {
        const action = a.action_type || 'view';
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });

      // Top usué¡rios
      const userCounts: Record<string, { count: number; name?: string }> = {};
      activities.forEach((a: any) => {
        const userId = a.user_id;
        if (!userCounts[userId]) {
          userCounts[userId] = { count: 0, name: userMap[userId] };
        }
        userCounts[userId].count++;
      });
      const topUsers = Object.entries(userCounts)
        .map(([userId, data]) => ({ userId, userName: data.name, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalActivities: activities.length,
        uniqueUsers,
        topPages,
        topActions: actionCounts,
        topUsers
      };
    } catch (error) {
      console.error('Erro ao buscar estaté­sticas:', error);
      return {
        totalActivities: 0,
        uniqueUsers: 0,
        topPages: [],
        topActions: {},
        topUsers: []
      };
    }
  }
};

