import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AdminPermission, AdminRole } from "@/lib/rbac";

/**
 * Capability check for the command center. Runs as the calling user so the
 * database (not the client) decides what the operator may see.
 */
export async function hasPermission(
  supabase: SupabaseClient<Database>,
  userId: string,
  permission: AdminPermission,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission: permission,
  });
  if (error) {
    console.error("[rbac] has_permission failed", error);
    return false;
  }
  return data === true;
}

/** All enterprise roles + effective permissions held by a user. */
export async function loadCapabilities(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ roles: AdminRole[]; permissions: AdminPermission[]; legacyAdmin: boolean }> {
  const [assignRes, legacyRes] = await Promise.all([
    supabase.from("admin_role_assignments").select("role").eq("user_id", userId),
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
  ]);
  const roles = (assignRes.data ?? []).map((r) => r.role as AdminRole);
  const legacyAdmin = Boolean(legacyRes.data);

  let permissions: AdminPermission[] = [];
  if (roles.length > 0) {
    const { data } = await supabase
      .from("admin_role_permissions")
      .select("permission, role")
      .in("role", roles);
    permissions = [...new Set((data ?? []).map((p) => p.permission as AdminPermission))];
  }
  if (legacyAdmin) {
    const { data } = await supabase.from("admin_role_permissions").select("permission");
    permissions = [...new Set((data ?? []).map((p) => p.permission as AdminPermission))];
  }
  return { roles, permissions, legacyAdmin };
}