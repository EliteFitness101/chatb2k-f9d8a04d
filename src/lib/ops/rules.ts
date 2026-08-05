/**
 * Pure operations rules — shared by servers, workers and the dashboard.
 * No I/O here so every rule is deterministic and unit-testable.
 */
import type { AdminPermission } from "@/lib/rbac";

export const TASK_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_TYPES = [
  "inventory_restock",
  "hub_reassignment",
  "failed_payment_followup",
  "manual_refund_review",
  "fulfillment_exception",
  "support_escalation",
  "compliance_review",
  "checkout_recovery",
  "recommendation_followup",
  "renewal_reminder",
  "alternative_offer",
  "sla_breach",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  inventory_restock: "Inventory restock required",
  hub_reassignment: "Hub reassignment required",
  failed_payment_followup: "Failed payment follow-up",
  manual_refund_review: "Manual refund review",
  fulfillment_exception: "Fulfillment exception",
  support_escalation: "Customer support escalation",
  compliance_review: "Compliance review",
  checkout_recovery: "Abandoned checkout recovery",
  recommendation_followup: "Send personalised recommendation",
  renewal_reminder: "Membership renewal reminder",
  alternative_offer: "Schedule alternative offer",
  sla_breach: "SLA breach remediation",
};

/** Hours allowed before a task of each priority is due. */
export const PRIORITY_DUE_HOURS: Record<TaskPriority, number> = {
  critical: 2,
  high: 8,
  normal: 24,
  low: 72,
};

export function dueDateFor(priority: TaskPriority, from: Date = new Date()): Date {
  return new Date(from.getTime() + PRIORITY_DUE_HOURS[priority] * 3600_000);
}

/* ------------------------------------------------------------------ SLA */

export const SLA_TYPES = [
  "payment_verification",
  "inventory_reservation",
  "hub_assignment",
  "picking",
  "packing",
  "dispatch",
  "delivery",
  "support_response",
] as const;
export type SlaType = (typeof SLA_TYPES)[number];

export interface SlaDefinition {
  type: SlaType;
  label: string;
  warnMinutes: number;
  breachMinutes: number;
  taskType: TaskType;
}

export const SLA_DEFINITIONS: Record<SlaType, SlaDefinition> = {
  payment_verification: {
    type: "payment_verification",
    label: "Payment verification",
    warnMinutes: 10,
    breachMinutes: 30,
    taskType: "failed_payment_followup",
  },
  inventory_reservation: {
    type: "inventory_reservation",
    label: "Inventory reservation",
    warnMinutes: 15,
    breachMinutes: 60,
    taskType: "inventory_restock",
  },
  hub_assignment: {
    type: "hub_assignment",
    label: "Hub assignment",
    warnMinutes: 30,
    breachMinutes: 120,
    taskType: "hub_reassignment",
  },
  picking: {
    type: "picking",
    label: "Picking",
    warnMinutes: 240,
    breachMinutes: 480,
    taskType: "fulfillment_exception",
  },
  packing: {
    type: "packing",
    label: "Packing",
    warnMinutes: 360,
    breachMinutes: 720,
    taskType: "fulfillment_exception",
  },
  dispatch: {
    type: "dispatch",
    label: "Dispatch",
    warnMinutes: 720,
    breachMinutes: 1440,
    taskType: "fulfillment_exception",
  },
  delivery: {
    type: "delivery",
    label: "Delivery",
    warnMinutes: 4320,
    breachMinutes: 10080,
    taskType: "fulfillment_exception",
  },
  support_response: {
    type: "support_response",
    label: "Support response",
    warnMinutes: 60,
    breachMinutes: 240,
    taskType: "support_escalation",
  },
};

export type SlaState = "running" | "warning" | "breached" | "met" | "missed";

export interface SlaTimerLike {
  status: string;
  warn_at: string;
  due_at: string;
  completed_at?: string | null;
}

/** Deterministic state of a timer at a point in time. */
export function slaState(timer: SlaTimerLike, now: Date = new Date()): SlaState {
  if (timer.completed_at) {
    return new Date(timer.completed_at) <= new Date(timer.due_at) ? "met" : "missed";
  }
  const t = now.getTime();
  if (t >= new Date(timer.due_at).getTime()) return "breached";
  if (t >= new Date(timer.warn_at).getTime()) return "warning";
  return "running";
}

export function slaWindow(type: SlaType, startedAt: Date = new Date()) {
  const def = SLA_DEFINITIONS[type];
  return {
    started_at: startedAt.toISOString(),
    warn_at: new Date(startedAt.getTime() + def.warnMinutes * 60_000).toISOString(),
    due_at: new Date(startedAt.getTime() + def.breachMinutes * 60_000).toISOString(),
  };
}

/* -------------------------------------------------------- Hub capacity */

export interface HubCapacityMetrics {
  hub_id: string;
  hub_name: string;
  available_units: number;
  pending_orders: number;
  active_workload: number;
  dispatch_backlog: number;
  utilization: number;
  avg_fulfillment_minutes: number | null;
}

/** Workload a single hub can absorb before it is considered saturated. */
export const HUB_WORKLOAD_CAPACITY = 25;
export const HUB_UTILIZATION_WARNING = 0.8;
export const HUB_UTILIZATION_CRITICAL = 1;

export function utilizationFor(activeWorkload: number, capacity = HUB_WORKLOAD_CAPACITY) {
  if (capacity <= 0) return 0;
  return Number((activeWorkload / capacity).toFixed(4));
}

export interface HubRecommendation {
  hub_id: string;
  recommendation: "steady" | "monitor" | "reassign";
  reason: string;
  target_hub_id: string | null;
}

/**
 * Recommend reassignment when a hub is saturated or out of stock and a
 * materially less loaded hub exists.
 */
export function recommendReassignments(hubs: HubCapacityMetrics[]): HubRecommendation[] {
  const sorted = [...hubs].sort((a, b) => a.utilization - b.utilization);
  return hubs.map((h) => {
    const target =
      sorted.find(
        (c) =>
          c.hub_id !== h.hub_id &&
          c.utilization <= h.utilization - 0.25 &&
          c.utilization < HUB_UTILIZATION_WARNING &&
          c.available_units > 0,
      ) ?? null;

    const starved = h.available_units <= 0 && h.pending_orders > 0;
    if ((h.utilization >= HUB_UTILIZATION_CRITICAL || starved) && target) {
      return {
        hub_id: h.hub_id,
        recommendation: "reassign" as const,
        reason: starved
          ? `No available stock with ${h.pending_orders} pending order(s)`
          : `Utilisation ${(h.utilization * 100).toFixed(0)}% exceeds capacity`,
        target_hub_id: target.hub_id,
      };
    }
    if (h.utilization >= HUB_UTILIZATION_WARNING || starved) {
      return {
        hub_id: h.hub_id,
        recommendation: "monitor" as const,
        reason: starved
          ? "Stock exhausted — restock required"
          : `Utilisation ${(h.utilization * 100).toFixed(0)}% approaching capacity`,
        target_hub_id: null,
      };
    }
    return {
      hub_id: h.hub_id,
      recommendation: "steady" as const,
      reason: "Within capacity",
      target_hub_id: null,
    };
  });
}

/* ----------------------------------------------------- Revenue recovery */

export const RECOVERY_KINDS = [
  "abandoned_checkout",
  "failed_payment",
  "expired_payment_link",
  "incomplete_subscription",
] as const;
export type RecoveryKind = (typeof RECOVERY_KINDS)[number];

export const RECOVERY_STATUSES = ["pending", "contacted", "recovered", "lost"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const RECOVERY_TASK_PRIORITY: Record<RecoveryKind, TaskPriority> = {
  abandoned_checkout: "normal",
  failed_payment: "high",
  expired_payment_link: "normal",
  incomplete_subscription: "high",
};

export interface RecoveryRowLike {
  kind: string;
  status: string;
  amount_minor: number;
}

export interface RecoveryStats {
  kind: string;
  total: number;
  recovered: number;
  lost: number;
  conversion: number;
  recovered_amount_minor: number;
  at_risk_amount_minor: number;
}

export function recoveryStats(rows: RecoveryRowLike[]): RecoveryStats[] {
  const byKind = new Map<string, RecoveryStats>();
  for (const r of rows) {
    const s =
      byKind.get(r.kind) ??
      ({
        kind: r.kind,
        total: 0,
        recovered: 0,
        lost: 0,
        conversion: 0,
        recovered_amount_minor: 0,
        at_risk_amount_minor: 0,
      } satisfies RecoveryStats);
    s.total += 1;
    const amount = Number(r.amount_minor ?? 0);
    if (r.status === "recovered") {
      s.recovered += 1;
      s.recovered_amount_minor += amount;
    } else if (r.status === "lost") {
      s.lost += 1;
    } else {
      s.at_risk_amount_minor += amount;
    }
    s.conversion = s.total > 0 ? s.recovered / s.total : 0;
    byKind.set(r.kind, s);
  }
  return [...byKind.values()].sort((a, b) => b.total - a.total);
}

/* --------------------------------------------------- Alert escalation */

export interface EscalationPolicyLike {
  category: string;
  level: string;
  auto_acknowledge: boolean;
  escalate_after_minutes: number;
  escalate_to: string | null;
  create_task: boolean;
  task_type: string | null;
  task_priority: string;
  active: boolean;
}

export interface AlertLike {
  id: string;
  level: string;
  category: string;
  title: string;
  status: string;
  entity: string | null;
  entity_id: string | null;
  created_at: string;
  escalation_level?: number | null;
  task_id?: string | null;
}

export type EscalationAction =
  | { kind: "acknowledge"; alertId: string }
  | {
      kind: "escalate";
      alertId: string;
      escalationLevel: number;
      assignTo: string | null;
      createTask: boolean;
      taskType: TaskType;
      taskPriority: TaskPriority;
    };

function matchPolicy(policies: EscalationPolicyLike[], alert: AlertLike) {
  return (
    policies.find((p) => p.active && p.category === alert.category && p.level === alert.level) ??
    null
  );
}

/** Decide what should happen to an open alert right now. */
export function evaluateAlert(
  alert: AlertLike,
  policies: EscalationPolicyLike[],
  now: Date = new Date(),
): EscalationAction | null {
  if (alert.status === "resolved") return null;
  const policy = matchPolicy(policies, alert);
  if (!policy) return null;

  const ageMinutes = (now.getTime() - new Date(alert.created_at).getTime()) / 60_000;

  if (ageMinutes >= policy.escalate_after_minutes && (alert.escalation_level ?? 0) < 1) {
    return {
      kind: "escalate",
      alertId: alert.id,
      escalationLevel: (alert.escalation_level ?? 0) + 1,
      assignTo: policy.escalate_to,
      createTask: policy.create_task && !alert.task_id,
      taskType: (policy.task_type as TaskType) ?? "support_escalation",
      taskPriority: (policy.task_priority as TaskPriority) ?? "high",
    };
  }

  if (policy.auto_acknowledge && alert.status === "open") {
    return { kind: "acknowledge", alertId: alert.id };
  }
  return null;
}

/* ------------------------------------------------- Dashboard actions */

export const OPS_ACTIONS = [
  "assign_task",
  "update_task",
  "reassign_hub",
  "reserve_inventory",
  "retry_webhook",
  "retry_payment_reconciliation",
  "acknowledge_alert",
  "resolve_incident",
  "update_recovery",
] as const;
export type OpsAction = (typeof OPS_ACTIONS)[number];

export const ACTION_PERMISSIONS: Record<OpsAction, AdminPermission> = {
  assign_task: "orders.write",
  update_task: "orders.write",
  reassign_hub: "hub.manage",
  reserve_inventory: "inventory.manage",
  retry_webhook: "payments.manage",
  retry_payment_reconciliation: "payments.manage",
  acknowledge_alert: "audit.read",
  resolve_incident: "audit.read",
  update_recovery: "payments.manage",
};

export function requiredPermission(action: OpsAction): AdminPermission {
  return ACTION_PERMISSIONS[action];
}

export function canRunAction(permissions: AdminPermission[], action: OpsAction): boolean {
  return permissions.includes(ACTION_PERMISSIONS[action]);
}

/** Valid task status transitions. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled", "completed"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}