import { describe, it, expect } from "vitest";
import {
  canTransition,
  canRunAction,
  requiredPermission,
  dueDateFor,
  evaluateAlert,
  recommendReassignments,
  recoveryStats,
  slaState,
  slaWindow,
  utilizationFor,
  SLA_DEFINITIONS,
} from "@/lib/ops/rules";

describe("SLA timers", () => {
  const start = new Date("2026-01-01T00:00:00Z");

  it("derives warn/due windows from the definition", () => {
    const win = slaWindow("payment_verification", start);
    const def = SLA_DEFINITIONS.payment_verification;
    expect(new Date(win.warn_at).getTime() - start.getTime()).toBe(def.warnMinutes * 60_000);
    expect(new Date(win.due_at).getTime() - start.getTime()).toBe(def.breachMinutes * 60_000);
  });

  it("moves running → warning → breached over time", () => {
    const win = slaWindow("payment_verification", start);
    const timer = { status: "running", ...win };
    expect(slaState(timer, new Date("2026-01-01T00:05:00Z"))).toBe("running");
    expect(slaState(timer, new Date("2026-01-01T00:12:00Z"))).toBe("warning");
    expect(slaState(timer, new Date("2026-01-01T00:45:00Z"))).toBe("breached");
  });

  it("marks completion as met or missed against the deadline", () => {
    const win = slaWindow("picking", start);
    expect(
      slaState({ status: "running", ...win, completed_at: "2026-01-01T01:00:00Z" }),
    ).toBe("met");
    expect(
      slaState({ status: "running", ...win, completed_at: "2026-01-02T00:00:00Z" }),
    ).toBe("missed");
  });
});

describe("operations tasks", () => {
  it("allows only legal status transitions", () => {
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("completed", "open")).toBe(false);
    expect(canTransition("cancelled", "in_progress")).toBe(false);
  });

  it("computes due dates from priority", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(dueDateFor("critical", from).toISOString()).toBe("2026-01-01T02:00:00.000Z");
    expect(dueDateFor("low", from).toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("RBAC action mapping", () => {
  it("maps every action to a least-privilege permission", () => {
    expect(requiredPermission("reassign_hub")).toBe("hub.manage");
    expect(canRunAction(["hub.manage"], "reassign_hub")).toBe(true);
    expect(canRunAction(["orders.read"], "reassign_hub")).toBe(false);
    expect(canRunAction([], "retry_webhook")).toBe(false);
  });
});

describe("hub capacity", () => {
  const base = {
    pending_orders: 2,
    dispatch_backlog: 0,
    avg_fulfillment_minutes: null,
  };

  it("computes utilization against capacity", () => {
    expect(utilizationFor(25)).toBe(1);
    expect(utilizationFor(0)).toBe(0);
  });

  it("recommends reassignment for saturated hubs with a lighter target", () => {
    const recs = recommendReassignments([
      { ...base, hub_id: "a", hub_name: "A", available_units: 4, active_workload: 30, utilization: 1.2 },
      { ...base, hub_id: "b", hub_name: "B", available_units: 40, active_workload: 2, utilization: 0.08 },
    ]);
    expect(recs.find((r) => r.hub_id === "a")?.recommendation).toBe("reassign");
    expect(recs.find((r) => r.hub_id === "a")?.target_hub_id).toBe("b");
    expect(recs.find((r) => r.hub_id === "b")?.recommendation).toBe("steady");
  });

  it("flags stock-starved hubs for monitoring when no target exists", () => {
    const recs = recommendReassignments([
      { ...base, hub_id: "a", hub_name: "A", available_units: 0, active_workload: 5, utilization: 0.2 },
    ]);
    expect(recs[0].recommendation).toBe("monitor");
  });
});

describe("recovery statistics", () => {
  it("aggregates conversion and at-risk value per kind", () => {
    const stats = recoveryStats([
      { kind: "abandoned_checkout", status: "recovered", amount_minor: 1000 },
      { kind: "abandoned_checkout", status: "pending", amount_minor: 500 },
      { kind: "failed_payment", status: "lost", amount_minor: 700 },
    ]);
    const ac = stats.find((s) => s.kind === "abandoned_checkout")!;
    expect(ac.total).toBe(2);
    expect(ac.conversion).toBe(0.5);
    expect(ac.recovered_amount_minor).toBe(1000);
    expect(ac.at_risk_amount_minor).toBe(500);
  });
});

describe("alert escalation", () => {
  const policies = [
    {
      category: "payment",
      level: "critical",
      auto_acknowledge: false,
      escalate_after_minutes: 15,
      escalate_to: null,
      create_task: true,
      task_type: "failed_payment_followup",
      task_priority: "critical",
      active: true,
    },
  ];
  const alert = {
    id: "alert-1",
    level: "critical",
    category: "payment",
    title: "Payment failed",
    status: "open",
    entity: "order",
    entity_id: "o1",
    created_at: "2026-01-01T00:00:00Z",
    escalation_level: 0,
    task_id: null,
  };

  it("does not escalate before the policy window", () => {
    expect(evaluateAlert(alert, policies, new Date("2026-01-01T00:05:00Z"))).toBeNull();
  });

  it("escalates once the window elapses and creates a task", () => {
    const action = evaluateAlert(alert, policies, new Date("2026-01-01T00:30:00Z"));
    expect(action).toMatchObject({ kind: "escalate", escalationLevel: 1, createTask: true });
  });

  it("is idempotent — an already escalated alert is not re-escalated", () => {
    const action = evaluateAlert(
      { ...alert, escalation_level: 1 },
      policies,
      new Date("2026-01-01T05:00:00Z"),
    );
    expect(action).toBeNull();
  });

  it("ignores resolved alerts", () => {
    expect(
      evaluateAlert({ ...alert, status: "resolved" }, policies, new Date("2026-02-01T00:00:00Z")),
    ).toBeNull();
  });
});