import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent } from "@/lib/events.server";
import { raiseAlert } from "@/lib/alerts.server";
import { ensureTask } from "@/lib/ops/tasks.server";
import { SLA_DEFINITIONS, slaState, slaWindow, type SlaType } from "@/lib/ops/rules";

/** Start (or restart) an SLA timer for an entity. Never throws. */
export async function startSla(
  type: SlaType,
  entity: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  try {
    const win = slaWindow(type);
    await supabaseAdmin.from("sla_timers").upsert(
      {
        sla_type: type,
        entity,
        entity_id: entityId,
        ...win,
        completed_at: null,
        status: "running",
        detail: detail as never,
      },
      { onConflict: "sla_type,entity,entity_id" },
    );
    await publishEvent("SlaStarted", entity, entityId, { sla_type: type });
  } catch (e) {
    console.error("[sla] start failed", type, e);
  }
}

/** Stop a timer; records whether the deadline was met. */
export async function completeSla(type: SlaType, entity: string, entityId: string) {
  try {
    const { data: timer } = await supabaseAdmin
      .from("sla_timers")
      .select("id, warn_at, due_at, status")
      .eq("sla_type", type)
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!timer) return;
    const completedAt = new Date();
    const state = slaState(
      { status: timer.status, warn_at: timer.warn_at, due_at: timer.due_at, completed_at: completedAt.toISOString() },
      completedAt,
    );
    await supabaseAdmin
      .from("sla_timers")
      .update({ completed_at: completedAt.toISOString(), status: state })
      .eq("id", timer.id);
    await publishEvent(state === "met" ? "SlaMet" : "SlaBreached", entity, entityId, {
      sla_type: type,
      state,
    });
  } catch (e) {
    console.error("[sla] complete failed", type, e);
  }
}

/**
 * Worker step: sweep running timers, emit warning/breach events, raise alerts
 * and generate remediation tasks. Idempotent — status guards prevent repeats.
 */
export async function evaluateSlaTimers(now: Date = new Date()) {
  const { data: timers } = await supabaseAdmin
    .from("sla_timers")
    .select("id, sla_type, entity, entity_id, warn_at, due_at, status, completed_at")
    .in("status", ["running", "warning"])
    .is("completed_at", null)
    .limit(500);

  let warned = 0;
  let breached = 0;

  for (const t of timers ?? []) {
    const state = slaState(t, now);
    if (state === t.status) continue;

    if (state === "warning") {
      await supabaseAdmin.from("sla_timers").update({ status: "warning" }).eq("id", t.id);
      await publishEvent("SlaWarning", t.entity, t.entity_id, { sla_type: t.sla_type });
      await raiseAlert(
        "warning",
        "sla",
        `${SLA_DEFINITIONS[t.sla_type as SlaType]?.label ?? t.sla_type} approaching SLA`,
        { sla_type: t.sla_type },
        t.entity,
        t.entity_id,
      );
      warned += 1;
    } else if (state === "breached") {
      await supabaseAdmin.from("sla_timers").update({ status: "breached" }).eq("id", t.id);
      await publishEvent("SlaBreached", t.entity, t.entity_id, { sla_type: t.sla_type });
      await raiseAlert(
        "critical",
        "sla",
        `${SLA_DEFINITIONS[t.sla_type as SlaType]?.label ?? t.sla_type} SLA breached`,
        { sla_type: t.sla_type },
        t.entity,
        t.entity_id,
      );
      await ensureTask({
        type: SLA_DEFINITIONS[t.sla_type as SlaType]?.taskType ?? "sla_breach",
        priority: "critical",
        title: `SLA breach — ${SLA_DEFINITIONS[t.sla_type as SlaType]?.label ?? t.sla_type}`,
        sourceEvent: "SlaBreached",
        entity: t.entity,
        entityId: t.entity_id,
        dedupeKey: `sla:${t.sla_type}:${t.entity}:${t.entity_id}`,
        detail: { sla_type: t.sla_type, due_at: t.due_at },
      });
      breached += 1;
    }
  }

  return { scanned: (timers ?? []).length, warned, breached };
}