import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { audit, publishEvent } from "@/lib/events.server";
import {
  canTransition,
  dueDateFor,
  TASK_TYPE_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/ops/rules";

export interface TaskSpec {
  type: TaskType;
  priority: TaskPriority;
  title?: string;
  sourceEvent?: string;
  sourceEventId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  alertId?: string | null;
  assignee?: string | null;
  dedupeKey: string;
  detail?: Record<string, unknown>;
}

/**
 * Idempotently create an operational task. The dedupe key guarantees a single
 * live task per (type, entity) even when workers overlap.
 */
export async function ensureTask(spec: TaskSpec): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("ops_tasks")
    .select("id, status")
    .eq("dedupe_key", spec.dedupeKey)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabaseAdmin
    .from("ops_tasks")
    .insert({
      task_type: spec.type,
      title: spec.title ?? TASK_TYPE_LABELS[spec.type],
      priority: spec.priority,
      status: "open",
      source_event: spec.sourceEvent ?? null,
      source_event_id: spec.sourceEventId ?? null,
      entity: spec.entity ?? null,
      entity_id: spec.entityId ?? null,
      alert_id: spec.alertId ?? null,
      assignee: spec.assignee ?? null,
      dedupe_key: spec.dedupeKey,
      due_at: dueDateFor(spec.priority).toISOString(),
      detail: (spec.detail ?? {}) as never,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null; // concurrent worker won the race
    console.error("[tasks] create failed", spec.type, error);
    return null;
  }

  await supabaseAdmin.from("ops_task_events").insert({
    task_id: data.id,
    from_status: null,
    to_status: "open",
    detail: { source_event: spec.sourceEvent ?? null } as never,
  });
  await publishEvent("OpsTaskCreated", "ops_task", data.id, {
    task_type: spec.type,
    priority: spec.priority,
    entity: spec.entity ?? null,
    entity_id: spec.entityId ?? null,
  });
  await audit("task.created", "ops_task", data.id, { task_type: spec.type });

  // Customer-support workflows carry a response SLA that starts automatically.
  if (spec.type === "support_escalation") {
    const { startSla } = await import("@/lib/ops/sla.server");
    await startSla("support_response", "ops_task", data.id, {
      entity: spec.entity ?? null,
      entity_id: spec.entityId ?? null,
    });
  }
  return data.id;
}

export async function transitionTask(
  taskId: string,
  to: TaskStatus,
  actorId: string | null,
  detail: Record<string, unknown> = {},
) {
  const { data: current } = await supabaseAdmin
    .from("ops_tasks")
    .select("id, status, task_type")
    .eq("id", taskId)
    .maybeSingle();
  if (!current) return { ok: false as const, error: "Task not found" };

  const from = current.status as TaskStatus;
  if (from === to) return { ok: true as const };
  if (!canTransition(from, to))
    return { ok: false as const, error: `Cannot move task from ${from} to ${to}` };

  const { error } = await supabaseAdmin
    .from("ops_tasks")
    .update({
      status: to,
      completed_at: to === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  if (error) return { ok: false as const, error: error.message };

  await supabaseAdmin.from("ops_task_events").insert({
    task_id: taskId,
    from_status: from,
    to_status: to,
    actor_id: actorId,
    detail: detail as never,
  });
  await publishEvent("OpsTaskTransitioned", "ops_task", taskId, { from, to });
  await audit(`task.${to}`, "ops_task", taskId, { from }, actorId);

  if (
    current.task_type === "support_escalation" &&
    (to === "completed" || to === "cancelled")
  ) {
    const { completeSla } = await import("@/lib/ops/sla.server");
    await completeSla("support_response", "ops_task", taskId);
  }
  return { ok: true as const };
}

export async function assignTask(taskId: string, assignee: string | null, actorId: string | null) {
  const { error } = await supabaseAdmin
    .from("ops_tasks")
    .update({ assignee })
    .eq("id", taskId);
  if (error) return { ok: false as const, error: error.message };
  await supabaseAdmin.from("ops_task_events").insert({
    task_id: taskId,
    from_status: null,
    to_status: "assigned",
    actor_id: actorId,
    detail: { assignee } as never,
  });
  await publishEvent("OpsTaskAssigned", "ops_task", taskId, { assignee });
  await audit("task.assigned", "ops_task", taskId, { assignee }, actorId);
  return { ok: true as const };
}