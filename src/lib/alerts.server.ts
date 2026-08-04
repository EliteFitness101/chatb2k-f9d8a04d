import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AlertLevel } from "@/lib/rbac";

/**
 * Raise an operational alert. Never throws — alerting must not break the
 * pipeline it observes.
 */
export async function raiseAlert(
  level: AlertLevel,
  category: string,
  title: string,
  detail: Record<string, unknown> = {},
  entity: string | null = null,
  entityId: string | null = null,
) {
  try {
    await supabaseAdmin.from("ops_alerts").insert({
      level,
      category,
      title,
      detail: detail as never,
      entity,
      entity_id: entityId,
    });
  } catch (e) {
    console.error("[alerts] raise failed", category, e);
  }
}