import { evaluateSlaTimers } from "@/lib/ops/sla.server";
import { refreshHubCapacity } from "@/lib/ops/hub-capacity.server";
import { generateRecoveryWorkflows } from "@/lib/ops/recovery.server";
import { evaluateAlertEscalation, cleanupStaleAlerts } from "@/lib/ops/escalation.server";
import { runCustomerSuccessAutomation } from "@/lib/ops/customer-success.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent } from "@/lib/events.server";
import { raiseAlert } from "@/lib/alerts.server";
import { ensureTask } from "@/lib/ops/tasks.server";

export const AUTOMATION_JOBS = [
  "sla",
  "tasks",
  "alerts",
  "inventory",
  "capacity",
  "recovery",
  "analytics",
] as const;
export type AutomationJob = (typeof AUTOMATION_JOBS)[number];

/** Inventory health check → restock tasks + alerts. */
export async function inventoryHealthCheck() {
  const { data } = await supabaseAdmin
    .from("inventory_items")
    .select("id, sku, on_hand, reserved, reorder_level, hub_id");
  const low = (data ?? []).filter((i) => i.on_hand - i.reserved <= i.reorder_level);
  const day = new Date().toISOString().slice(0, 10);
  for (const i of low) {
    await ensureTask({
      type: "inventory_restock",
      priority: i.on_hand - i.reserved <= 0 ? "critical" : "high",
      title: `Restock ${i.sku}`,
      sourceEvent: "InventoryHealthCheck",
      entity: "inventory_item",
      entityId: i.id,
      dedupeKey: `restock:${i.id}:${day}`,
      detail: { sku: i.sku, available: i.on_hand - i.reserved, reorder_level: i.reorder_level },
    });
    if (i.on_hand - i.reserved <= 0) {
      await raiseAlert(
        "critical",
        "inventory",
        `${i.sku} out of stock`,
        { sku: i.sku, hub_id: i.hub_id },
        "inventory_item",
        i.id,
      );
    }
  }
  return { low_skus: low.length };
}

/** Lightweight analytics aggregation into the domain event stream. */
export async function aggregateAnalytics() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const iso = since.toISOString();
  const [tasks, breaches, recoveries] = await Promise.all([
    supabaseAdmin.from("ops_tasks").select("status").gte("created_at", iso),
    supabaseAdmin.from("sla_timers").select("id", { count: "exact", head: true }).eq("status", "breached"),
    supabaseAdmin.from("recovery_workflows").select("status").gte("created_at", iso),
  ]);
  const summary = {
    tasks_created_today: (tasks.data ?? []).length,
    tasks_open: (tasks.data ?? []).filter((t) => t.status === "open").length,
    sla_breaches: breaches.count ?? 0,
    recoveries_today: (recoveries.data ?? []).length,
    recovered_today: (recoveries.data ?? []).filter((r) => r.status === "recovered").length,
  };
  await publishEvent("HubCapacityRefreshed", "analytics", null, summary);
  return summary;
}

/** Run the background automation sweep. Individual job failures are isolated. */
export async function runAutomation(jobs: AutomationJob[] = [...AUTOMATION_JOBS]) {
  const results: Record<string, unknown> = {};
  const runners: Record<AutomationJob, () => Promise<unknown>> = {
    sla: evaluateSlaTimers,
    tasks: runCustomerSuccessAutomation,
    alerts: async () => ({
      ...(await evaluateAlertEscalation()),
      ...(await cleanupStaleAlerts()),
    }),
    inventory: inventoryHealthCheck,
    capacity: refreshHubCapacity,
    recovery: generateRecoveryWorkflows,
    analytics: aggregateAnalytics,
  };

  for (const job of jobs) {
    try {
      results[job] = await runners[job]();
    } catch (e) {
      console.error("[automation] job failed", job, e);
      results[job] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return results;
}