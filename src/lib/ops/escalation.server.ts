import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { ensureTask } from "@/lib/ops/tasks.server";
import { evaluateAlert, type AlertLike, type EscalationPolicyLike } from "@/lib/ops/rules";

/**
 * Worker step: apply escalation policies to open alerts — auto-acknowledge,
 * escalate, reassign owner and spawn the linked operational task.
 */
export async function evaluateAlertEscalation(now: Date = new Date()) {
  const [{ data: policies }, { data: alerts }] = await Promise.all([
    supabaseAdmin
      .from("alert_escalation_policies")
      .select(
        "category, level, auto_acknowledge, escalate_after_minutes, escalate_to, create_task, task_type, task_priority, active",
      ),
    supabaseAdmin
      .from("ops_alerts")
      .select("id, level, category, title, status, entity, entity_id, created_at, escalation_level, task_id")
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  const policyList = (policies ?? []) as EscalationPolicyLike[];
  let acknowledged = 0;
  let escalated = 0;
  let tasksCreated = 0;

  for (const raw of alerts ?? []) {
    const alert = raw as AlertLike;
    const action = evaluateAlert(alert, policyList, now);
    if (!action) continue;

    if (action.kind === "acknowledge") {
      await supabaseAdmin
        .from("ops_alerts")
        .update({ status: "acknowledged", acknowledged_at: now.toISOString() })
        .eq("id", alert.id);
      await publishEvent("AlertAcknowledged", "ops_alert", alert.id, { auto: true });
      acknowledged += 1;
      continue;
    }

    let taskId: string | null = alert.task_id ?? null;
    if (action.createTask) {
      taskId = await ensureTask({
        type: action.taskType,
        priority: action.taskPriority,
        title: alert.title,
        sourceEvent: "AlertEscalated",
        entity: alert.entity,
        entityId: alert.entity_id,
        alertId: alert.id,
        assignee: action.assignTo,
        dedupeKey: `alert:${alert.id}`,
        detail: { category: alert.category, level: alert.level },
      });
      if (taskId) tasksCreated += 1;
    }

    await supabaseAdmin
      .from("ops_alerts")
      .update({
        escalation_level: action.escalationLevel,
        escalated_at: now.toISOString(),
        task_id: taskId,
        ...(action.assignTo ? { assigned_to: action.assignTo } : {}),
      })
      .eq("id", alert.id);

    await publishEvent("AlertEscalated", "ops_alert", alert.id, {
      level: action.escalationLevel,
      category: alert.category,
      severity: alert.level,
      notified: alert.level === "critical" ? "critical-channel" : "standard-channel",
    });
    await audit("alert.escalated", "ops_alert", alert.id, {
      escalation_level: action.escalationLevel,
    });
    escalated += 1;
  }

  return { acknowledged, escalated, tasksCreated };
}

/** Worker step: close alerts that have sat resolved-worthy and stale. */
export async function cleanupStaleAlerts(now: Date = new Date(), maxAgeHours = 72) {
  const cutoff = new Date(now.getTime() - maxAgeHours * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("ops_alerts")
    .select("id")
    .eq("status", "acknowledged")
    .eq("level", "info")
    .lte("created_at", cutoff)
    .limit(200);
  for (const a of data ?? []) {
    await supabaseAdmin
      .from("ops_alerts")
      .update({ status: "resolved", resolved_at: now.toISOString() })
      .eq("id", a.id);
    await publishEvent("AlertResolved", "ops_alert", a.id, { auto: true, reason: "stale" });
  }
  return { cleaned: (data ?? []).length };
}