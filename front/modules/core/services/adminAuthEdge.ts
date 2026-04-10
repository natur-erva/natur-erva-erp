import { FunctionsHttpError, type SupabaseClient, type User as AuthUser } from '@supabase/supabase-js';
import type { User } from '../types/types';
import { getSupabaseConfig } from './supabaseClient';

type OkResponse =
  | { ok: true; user?: AuthUser; users?: EdgeListUser[] }
  | { ok: true }
  | { ok: false; error: string };

/** Resposta de list_users / get_user (alinhado com o estado em Users.tsx). */
export interface EdgeListUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  roles: string[];
  avatar?: string;
  customerId?: string;
  isActive: boolean;
  lastLogin?: string;
  isSuperAdmin?: boolean;
}

/**
 * A Edge Function valida o JWT com `getUser()`; `getSession()` pode devolver um access_token
 * já expirado (cache). Garantimos token válido: `getUser()` OK → usar sessão; senão → `refreshSession()`.
 */
async function getAccessTokenForEdge(supabase: SupabaseClient): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userData.user && !userError) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  }

  const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
  const token = refreshed.session?.access_token;
  if (token) return token;

  throw new Error(
    refErr?.message ||
      userError?.message ||
      'Sessão inválida ou expirada. Inicie sessão novamente para usar a gestão de utilizadores.'
  );
}

async function readFunctionsHttpErrorMessage(err: unknown): Promise<string | null> {
  if (!(err instanceof FunctionsHttpError)) return null;
  try {
    const body = await err.context.json();
    if (body && typeof body === 'object' && body !== null && 'error' in body) {
      const e = (body as { error?: unknown }).error;
      if (typeof e === 'string' && e.trim()) return e;
    }
  } catch {
    /* ignorar */
  }
  return null;
}

/**
 * Operações de gestão de utilizadores via Edge Function (service role só no servidor).
 * Envia explicitamente o JWT: com `verify_jwt: true`, o gateway rejeita (401) se o header
 * Authorization não estiver presente ou não for propagado correctamente pelo cliente.
 */
export async function invokeAdminAuthUsers(
  supabase: SupabaseClient,
  body: Record<string, unknown>
): Promise<OkResponse> {
  const accessToken = await getAccessTokenForEdge(supabase);
  const config = getSupabaseConfig();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`
  };
  if (config?.anonKey) {
    headers.apikey = config.anonKey;
  }

  const { data, error } = await supabase.functions.invoke<OkResponse>('admin-auth-users', {
    body,
    headers
  });

  if (error) {
    const httpDetail = await readFunctionsHttpErrorMessage(error);
    const msg = error.message || '';
    const fromBody =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: string }).error || '')
        : '';
    const primary = httpDetail || fromBody || msg || 'Erro ao chamar admin-auth-users';
    const hint =
      /401|Unauthorized|non-2xx|Sessão inválida|Não autenticado/i.test(primary)
        ? ' Se o problema persistir, confirme que VITE_SUPABASE_URL e a chave anon são do mesmo projecto onde iniciou sessão.'
        : '';
    throw new Error(primary + hint);
  }

  if (!data) {
    throw new Error('Resposta vazia da função admin-auth-users');
  }

  if ('ok' in data && data.ok === false && 'error' in data) {
    throw new Error((data as { error: string }).error);
  }

  return data;
}

export async function edgeListUsers(supabase: SupabaseClient): Promise<EdgeListUser[]> {
  const res = await invokeAdminAuthUsers(supabase, { action: 'list_users' });
  if (res.ok && 'users' in res && Array.isArray(res.users)) {
    return res.users;
  }
  return [];
}

export function edgeListUsersToAppUsers(rows: EdgeListUser[]): User[] {
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role as User['role'],
    roles: u.roles,
    avatar: u.avatar,
    customerId: u.customerId,
    isActive: u.isActive,
    lastLogin: u.lastLogin,
    isSuperAdmin: u.isSuperAdmin
  }));
}

export async function edgeCreateUserFull(
  supabase: SupabaseClient,
  params: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role_ids: string[];
    is_active?: boolean;
    is_super_admin?: boolean;
  }
): Promise<AuthUser> {
  const res = await invokeAdminAuthUsers(supabase, {
    action: 'create_user_full',
    email: params.email,
    password: params.password,
    name: params.name,
    phone: params.phone ?? null,
    role_ids: params.role_ids,
    is_active: params.is_active,
    is_super_admin: params.is_super_admin
  });
  if (res.ok && 'user' in res && res.user) return res.user;
  throw new Error('Utilizador não criado');
}

export async function edgeUpdateUserFull(
  supabase: SupabaseClient,
  params: {
    target_user_id: string;
    name?: string;
    email?: string;
    phone?: string | null;
    password?: string;
    role_ids?: string[];
    is_active?: boolean;
    is_super_admin?: boolean;
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    action: 'update_user_full',
    target_user_id: params.target_user_id
  };
  if (params.name !== undefined) body.name = params.name;
  if (params.email !== undefined) body.email = params.email;
  if (params.phone !== undefined) body.phone = params.phone;
  if (params.password !== undefined) body.password = params.password;
  if (params.role_ids !== undefined) body.role_ids = params.role_ids;
  if (params.is_active !== undefined) body.is_active = params.is_active;
  if (params.is_super_admin !== undefined) body.is_super_admin = params.is_super_admin;

  await invokeAdminAuthUsers(supabase, body);
}

export async function edgeDeleteUserFull(supabase: SupabaseClient, targetUserId: string): Promise<void> {
  await invokeAdminAuthUsers(supabase, {
    action: 'delete_user_full',
    target_user_id: targetUserId
  });
}

/** Apenas email/senha em auth (legado; preferir update_user_full). */
export async function edgeUpdateAuthUser(
  supabase: SupabaseClient,
  targetUserId: string,
  updates: { email?: string; password?: string }
): Promise<AuthUser | undefined> {
  const res = await invokeAdminAuthUsers(supabase, {
    action: 'update_auth_user',
    target_user_id: targetUserId,
    email: updates.email,
    password: updates.password
  });
  if (res.ok && 'user' in res && res.user) return res.user;
  return undefined;
}
