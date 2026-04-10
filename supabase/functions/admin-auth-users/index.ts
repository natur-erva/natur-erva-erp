import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders as sdkCorsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/** SDK ≥2.95 inclui Allow-Methods/Headers alinhados ao cliente; Max-Age reduz preflights repetidos. */
const corsHeaders: Record<string, string> = {
  ...(sdkCorsHeaders as Record<string, string>),
  "Access-Control-Max-Age": "86400",
};

type Action =
  | "list_users"
  | "get_user"
  | "create_user_full"
  | "update_user_full"
  | "delete_user_full"
  | "update_auth_user"
  | "create_auth_user"
  | "delete_auth_user";

interface Body {
  action: Action;
  target_user_id?: string;
  email?: string;
  password?: string;
  name?: string;
  phone?: string | null;
  role_ids?: string[];
  is_active?: boolean;
  is_super_admin?: boolean;
}

/** Alinhado a canManageUsers (super admin / ADMIN / SUPER_ADMIN em perfil ou user_roles). */
async function assertCanManageUsers(
  admin: SupabaseClient,
  callerId: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from("profiles")
    .select("is_super_admin, role")
    .eq("id", callerId)
    .maybeSingle();

  if (profile?.is_super_admin === true) return true;
  if (profile?.role === "SUPER_ADMIN" || profile?.role === "ADMIN") {
    return true;
  }

  const { data: rows } = await admin
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", callerId);

  for (const row of rows || []) {
    const n = (row as { roles?: { name?: string } }).roles?.name;
    if (n === "SUPER_ADMIN" || n === "ADMIN") return true;
  }
  return false;
}

const STAFF_ROLES_FOR_USERS_PAGE = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "STAFF",
  "CONTABILISTA",
  "GESTOR_STOCK",
  "GESTOR_VENDAS",
  "GESTOR_ENTREGAS",
]);

/** Alinhado a canManageUsers || isStaffUser em useUserPermissions (gestão de utilizadores no ERP). */
async function assertCanUseUsersManagement(
  admin: SupabaseClient,
  callerId: string,
): Promise<boolean> {
  if (await assertCanManageUsers(admin, callerId)) return true;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .maybeSingle();

  const { data: urRows } = await admin
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", callerId);

  const names = new Set<string>();
  if (profile?.role) names.add(profile.role);
  for (const row of urRows || []) {
    const n = (row as { roles?: { name?: string } }).roles?.name;
    if (n) names.add(n);
  }

  const list = [...names];
  if (list.includes("CLIENTE")) return false;

  return list.some((r) => STAFF_ROLES_FOR_USERS_PAGE.has(r));
}

/** Mapa id auth -> email (paginado). */
async function buildAuthEmailMap(
  admin: SupabaseClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.id && u.email) map.set(u.id, u.email);
    }
    if (users.length < perPage) break;
    page++;
  }
  return map;
}

/** user_id -> nomes de roles */
async function buildRolesMap(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (userIds.length === 0) return result;

  const chunkSize = 200;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("user_roles")
      .select("user_id, roles(name)")
      .in("user_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const uid = (row as { user_id: string }).user_id;
      const name = (row as { roles?: { name?: string } }).roles?.name;
      if (!name) continue;
      const arr = result.get(uid) ?? [];
      arr.push(name);
      result.set(uid, arr);
    }
  }
  return result;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ ok: false, error: "Não autenticado" }, 401);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: callerErr,
  } = await supabaseUser.auth.getUser();

  if (callerErr || !caller) {
    return json({ ok: false, error: "Sessão inválida" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const action = body.action;
  if (!action) {
    return json({ ok: false, error: "action obrigatório" }, 400);
  }

  const readOnlyActions = new Set<string>(["list_users", "get_user"]);
  if (readOnlyActions.has(action)) {
    const canRead = await assertCanUseUsersManagement(admin, caller.id);
    if (!canRead) {
      return json({ ok: false, error: "Sem permissão para esta operação" }, 403);
    }
  } else {
    const canMutate = await assertCanManageUsers(admin, caller.id);
    if (!canMutate) {
      return json(
        {
          ok: false,
          error:
            "Apenas administradores podem criar, editar ou alterar credenciais de utilizadores",
        },
        403,
      );
    }
  }

  try {
    if (action === "list_users") {
      const emailMap = await buildAuthEmailMap(admin);

      const { data: profiles, error: pErr } = await admin
        .from("profiles")
        .select("*")
        .order("name");

      if (pErr) {
        return json({ ok: false, error: pErr.message }, 400);
      }

      const ids = (profiles || []).map((p: { id: string }) => p.id);
      const rolesMap = await buildRolesMap(admin, ids);

      const users = (profiles || []).map((profile: Record<string, unknown>) => {
        const id = profile.id as string;
        let roleNames = rolesMap.get(id) ?? [];
        if (roleNames.length === 0 && profile.role) {
          roleNames = [String(profile.role)];
        }
        const primaryRole = roleNames[0] || profile.role || "STAFF";
        const email = emailMap.get(id) || String(profile.email || "");

        const phoneValue = profile.phone as string | null | undefined;
        const finalPhone =
          phoneValue && String(phoneValue).trim().length > 0
            ? String(phoneValue).trim()
            : undefined;

        return {
          id,
          name: String(profile.name || ""),
          email,
          phone: finalPhone,
          role: primaryRole,
          roles: roleNames,
          avatar: profile.avatar_url,
          customerId: profile.customer_id,
          isActive: profile.is_active !== false,
          lastLogin: profile.last_login,
          isSuperAdmin: profile.is_super_admin === true,
        };
      });

      return json({ ok: true, users });
    }

    if (action === "get_user") {
      const targetUserId = body.target_user_id;
      if (!targetUserId) {
        return json({ ok: false, error: "target_user_id obrigatório" }, 400);
      }

      const emailMap = await buildAuthEmailMap(admin);
      const { data: profile, error: pErr } = await admin
        .from("profiles")
        .select("*")
        .eq("id", targetUserId)
        .maybeSingle();

      if (pErr) return json({ ok: false, error: pErr.message }, 400);
      if (!profile) {
        return json({ ok: false, error: "Perfil não encontrado" }, 404);
      }

      const rolesMap = await buildRolesMap(admin, [targetUserId]);
      let roleNames = rolesMap.get(targetUserId) ?? [];
      if (roleNames.length === 0 && profile.role) {
        roleNames = [String(profile.role)];
      }
      const primaryRole = roleNames[0] || profile.role || "STAFF";
      const email = emailMap.get(targetUserId) || String(profile.email || "");

      const phoneValue = profile.phone as string | null | undefined;
      const finalPhone =
        phoneValue && String(phoneValue).trim().length > 0
          ? String(phoneValue).trim()
          : undefined;

      const user = {
        id: targetUserId,
        name: String(profile.name || ""),
        email,
        phone: finalPhone,
        role: primaryRole,
        roles: roleNames,
        avatar: profile.avatar_url,
        customerId: profile.customer_id,
        isActive: profile.is_active !== false,
        lastLogin: profile.last_login,
        isSuperAdmin: profile.is_super_admin === true,
      };

      return json({ ok: true, user });
    }

    if (action === "create_user_full") {
      const email = body.email?.trim();
      const password = body.password;
      const name = body.name?.trim();
      const roleIds = body.role_ids;

      if (!email) return json({ ok: false, error: "email obrigatório" }, 400);
      if (!password || password.length < 6) {
        return json(
          { ok: false, error: "Senha deve ter pelo menos 6 caracteres" },
          400,
        );
      }
      if (!name) return json({ ok: false, error: "nome obrigatório" }, 400);
      if (!roleIds || roleIds.length === 0) {
        return json({ ok: false, error: "Selecione pelo menos um role" }, 400);
      }

      let primaryRoleName = "STAFF";
      const { data: firstRole } = await admin
        .from("roles")
        .select("name")
        .eq("id", roleIds[0])
        .maybeSingle();
      if (firstRole?.name) primaryRoleName = firstRole.name;

      let phoneVal: string | null = null;
      if (body.phone !== undefined && body.phone !== null) {
        const t = String(body.phone).trim();
        phoneVal = t.length > 0 ? t : null;
      }

      const { data: authData, error: authErr } = await admin.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
        });

      if (authErr || !authData?.user) {
        const msg = authErr?.message || "Erro ao criar utilizador";
        if (
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("already been registered")
        ) {
          return json(
            { ok: false, error: `O email "${email}" já está cadastrado.` },
            400,
          );
        }
        return json({ ok: false, error: msg }, 400);
      }

      const uid = authData.user.id;

      const { error: profErr } = await admin.from("profiles").insert({
        id: uid,
        name,
        email,
        phone: phoneVal,
        role: primaryRoleName,
        is_active: body.is_active !== false,
        is_super_admin: body.is_super_admin === true,
      });

      if (profErr) {
        try {
          await admin.auth.admin.deleteUser(uid);
        } catch {
          /* ignore */
        }
        return json({ ok: false, error: profErr.message }, 400);
      }

      const roleAssignments = roleIds.map((roleId) => ({
        user_id: uid,
        role_id: roleId,
      }));

      const { error: rolesErr } = await admin
        .from("user_roles")
        .insert(roleAssignments);

      if (rolesErr) {
        try {
          await admin.from("profiles").delete().eq("id", uid);
        } catch {
          /* ignore */
        }
        try {
          await admin.auth.admin.deleteUser(uid);
        } catch {
          /* ignore */
        }
        return json({ ok: false, error: rolesErr.message }, 400);
      }

      return json({ ok: true, user: authData.user });
    }

    if (action === "update_user_full") {
      const targetUserId = body.target_user_id;
      if (!targetUserId) {
        return json({ ok: false, error: "target_user_id obrigatório" }, 400);
      }

      if (body.email !== undefined || (body.password && body.password.length >= 6)) {
        const updates: Record<string, unknown> = {};
        if (body.email !== undefined && body.email.trim() !== "") {
          updates.email = body.email.trim();
          updates.email_confirm = true;
        }
        if (body.password !== undefined && body.password.length >= 6) {
          updates.password = body.password;
        }
        if (Object.keys(updates).length > 0) {
          const { error: authErr } = await admin.auth.admin.updateUserById(
            targetUserId,
            updates,
          );
          if (authErr) {
            const msg = authErr.message || "";
            if (msg.includes("already registered") || msg.includes("already exists")) {
              return json(
                { ok: false, error: "Este email já está em uso por outro utilizador" },
                400,
              );
            }
            return json({ ok: false, error: msg }, 400);
          }
        }
      }

      const profilePatch: Record<string, unknown> = {};
      if (body.name !== undefined) profilePatch.name = body.name.trim();
      if (body.email !== undefined) profilePatch.email = body.email.trim();
      if (body.phone !== undefined) {
        const t = body.phone === null ? "" : String(body.phone).trim();
        profilePatch.phone = t.length > 0 ? t : null;
      }
      if (body.is_active !== undefined) profilePatch.is_active = body.is_active;
      if (body.is_super_admin !== undefined) {
        profilePatch.is_super_admin = body.is_super_admin;
      }

      if (Object.keys(profilePatch).length > 0) {
        const { error: upErr } = await admin
          .from("profiles")
          .update(profilePatch)
          .eq("id", targetUserId);
        if (upErr) return json({ ok: false, error: upErr.message }, 400);
      }

      if (body.role_ids !== undefined) {
        if (body.role_ids.length === 0) {
          return json(
            { ok: false, error: "Selecione pelo menos um role" },
            400,
          );
        }

        const { error: delErr } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", targetUserId);
        if (delErr) return json({ ok: false, error: delErr.message }, 400);

        const roleAssignments = body.role_ids.map((roleId) => ({
          user_id: targetUserId,
          role_id: roleId,
        }));

        const { error: insErr } = await admin
          .from("user_roles")
          .insert(roleAssignments);
        if (insErr) return json({ ok: false, error: insErr.message }, 400);

        const { data: firstRole } = await admin
          .from("roles")
          .select("name")
          .eq("id", body.role_ids[0])
          .maybeSingle();
        if (firstRole?.name) {
          await admin
            .from("profiles")
            .update({ role: firstRole.name })
            .eq("id", targetUserId);
        }
      }

      return json({ ok: true });
    }

    if (action === "delete_user_full") {
      const targetUserId = body.target_user_id;
      if (!targetUserId) {
        return json({ ok: false, error: "target_user_id obrigatório" }, 400);
      }
      if (targetUserId === caller.id) {
        return json(
          { ok: false, error: "Não pode apagar o seu próprio utilizador" },
          400,
        );
      }

      const { error: r1 } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId);
      if (r1) return json({ ok: false, error: r1.message }, 400);

      const { error: r2 } = await admin
        .from("profiles")
        .delete()
        .eq("id", targetUserId);
      if (r2) return json({ ok: false, error: r2.message }, 400);

      const { error: r3 } = await admin.auth.admin.deleteUser(targetUserId);
      if (r3) return json({ ok: false, error: r3.message }, 400);

      return json({ ok: true });
    }

    if (action === "update_auth_user") {
      const targetUserId = body.target_user_id;
      if (!targetUserId) {
        return json({ ok: false, error: "target_user_id obrigatório" }, 400);
      }

      const updates: Record<string, unknown> = {};
      if (body.email !== undefined && body.email.trim() !== "") {
        updates.email = body.email.trim();
        updates.email_confirm = true;
      }
      if (body.password !== undefined && body.password.length >= 6) {
        updates.password = body.password;
      }

      if (Object.keys(updates).length === 0) {
        return json(
          { ok: false, error: "Indique email e/ou senha (mín. 6 caracteres)" },
          400,
        );
      }

      const { data, error } = await admin.auth.admin.updateUserById(
        targetUserId,
        updates,
      );

      if (error) {
        const msg = error.message || "Erro ao atualizar utilizador";
        if (
          msg.includes("already registered") ||
          msg.includes("already exists")
        ) {
          return json(
            { ok: false, error: "Este email já está em uso por outro utilizador" },
            400,
          );
        }
        return json({ ok: false, error: msg }, 400);
      }

      return json({ ok: true, user: data.user });
    }

    if (action === "create_auth_user") {
      const email = body.email?.trim();
      const password = body.password;
      if (!email) {
        return json({ ok: false, error: "email obrigatório" }, 400);
      }
      if (!password || password.length < 6) {
        return json(
          { ok: false, error: "Senha deve ter pelo menos 6 caracteres" },
          400,
        );
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        const msg = error.message || "Erro ao criar utilizador";
        if (
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("already been registered")
        ) {
          return json(
            {
              ok: false,
              error: `O email "${email}" já está cadastrado.`,
            },
            400,
          );
        }
        return json({ ok: false, error: msg }, 400);
      }

      if (!data.user) {
        return json({ ok: false, error: "Utilizador não criado" }, 500);
      }

      return json({ ok: true, user: data.user });
    }

    if (action === "delete_auth_user") {
      const targetUserId = body.target_user_id;
      if (!targetUserId) {
        return json({ ok: false, error: "target_user_id obrigatório" }, 400);
      }
      if (targetUserId === caller.id) {
        return json(
          { ok: false, error: "Não pode apagar o seu próprio utilizador" },
          400,
        );
      }

      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) {
        return json({ ok: false, error: error.message }, 400);
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error("admin-auth-users:", e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Erro interno" },
      500,
    );
  }
});
