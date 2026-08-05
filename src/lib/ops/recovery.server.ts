import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent, audit } from "@/lib/events.server";
import { ensureTask } from "@/lib/ops/tasks.server";
import {
  RECOVERY_TASK_PRIORITY,
  recoveryStats,
  type RecoveryKind,
} from "@/lib/ops/rules";

export interface RecoveryInput {
  kind: RecoveryKind;
  reference?: string | null;
  email?: string | null;
  rsid?: string | null;
  amountMinor?: number;
  currency?: string;
  dedupeKey: string;
  detail?: Record<string, unknown>;
}

/** Open a recovery workflow + its follow-up task. Idempotent by dedupe key. */
export async function openRecovery(input: RecoveryInput) {
  const { data: existing } = await supabaseAdmin
    .from("recovery_workflows")
    .select("id")
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existing) return existing.id;

  const taskId = await ensureTask({
    type: input.kind === "abandoned_checkout" ? "checkout_recovery" : "failed_payment_followup",
    priority: RECOVERY_TASK_PRIORITY[input.kind],
    title: `Recover ${input.kind.replace(/_/g, " ")}${input.reference ? ` — ${input.reference}` : ""}`,
    sourceEvent: "RecoveryOpened",
    entity: "recovery",
    entityId: input.reference ?? input.dedupeKey,
    dedupeKey: `recovery-task:${input.dedupeKey}`,
    detail: { kind: input.kind, email: input.email ?? null },
  });

  const { data, error } = await supabaseAdmin
    .from("recovery_workflows")
    .insert({
      kind: input.kind,
      reference: input.reference ?? null,
      email: input.email ?? null,
      rsid: input.rsid ?? null,
      amount_minor: input.amountMinor ?? 0,
      currency: input.currency ?? "NGN",
      status: "pending",
      task_id: taskId,
      dedupe_key: input.dedupeKey,
      detail: (input.detail ?? {}) as never,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") console.error("[recovery] open failed", error);
    return null;
  }

  await publishEvent("RecoveryOpened", "recovery", data.id, {
    kind: input.kind,
    reference: input.reference ?? null,
  });
  await audit("recovery.opened", "recovery", data.id, { kind: input.kind });
  return data.id;
}

/** Mark every open recovery for a reference as converted. */
export async function markRecovered(reference: string) {
  const { data: rows } = await supabaseAdmin
    .from("recovery_workflows")
    .select("id, task_id")
    .eq("reference", reference)
    .neq("status", "recovered");
  for (const r of rows ?? []) {
    await supabaseAdmin
      .from("recovery_workflows")
      .update({ status: "recovered", recovered_at: new Date().toISOString() })
      .eq("id", r.id);
    if (r.task_id) {
      const { transitionTask } = await import("@/lib/ops/tasks.server");
      await transitionTask(r.task_id, "completed", null, { reason: "payment recovered" });
    }
    await publishEvent("RecoveryConverted", "recovery", r.id, { reference });
  }
  return { converted: (rows ?? []).length };
}

/**
 * Worker step: turn abandoned checkouts and failed payments into recovery
 * workflows, and expire stale payment links.
 */
export async function generateRecoveryWorkflows(now: Date = new Date()) {
  const since = new Date(now.getTime() - 48 * 3600_000).toISOString();
  let opened = 0;

  const { data: abandoned } = await supabaseAdmin
    .from("funnel_events")
    .select("id, rsid, props, occurred_at")
    .eq("event_name", "checkout_abandoned")
    .gte("occurred_at", since)
    .limit(200);
  for (const a of abandoned ?? []) {
    const props = (a.props ?? {}) as Record<string, unknown>;
    const id = await openRecovery({
      kind: "abandoned_checkout",
      rsid: a.rsid,
      email: typeof props.email === "string" ? props.email : null,
      reference: typeof props.reference === "string" ? props.reference : null,
      amountMinor: Number(props.amount_minor ?? 0),
      dedupeKey: `abandoned:${a.id}`,
      detail: props,
    });
    if (id) opened += 1;
  }

  const { data: failed } = await supabaseAdmin
    .from("payments")
    .select("id, reference, provider, amount_minor, currency, created_at")
    .eq("status", "failed")
    .gte("created_at", since)
    .limit(200);
  for (const p of failed ?? []) {
    const id = await openRecovery({
      kind: "failed_payment",
      reference: p.reference,
      amountMinor: Number(p.amount_minor ?? 0),
      currency: p.currency,
      dedupeKey: `failed-payment:${p.id}`,
      detail: { provider: p.provider },
    });
    if (id) opened += 1;
  }

  // Payment links that never progressed past creation within 24h.
  const staleBefore = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("payments")
    .select("id, reference, amount_minor, currency, created_at")
    .eq("status", "created")
    .lte("created_at", staleBefore)
    .gte("created_at", since)
    .limit(200);
  for (const p of stale ?? []) {
    const id = await openRecovery({
      kind: "expired_payment_link",
      reference: p.reference,
      amountMinor: Number(p.amount_minor ?? 0),
      currency: p.currency,
      dedupeKey: `expired-link:${p.id}`,
    });
    if (id) opened += 1;
  }

  return { opened };
}

/** Aggregated recovery conversion for the dashboard. */
export async function recoveryMetrics() {
  const { data } = await supabaseAdmin
    .from("recovery_workflows")
    .select("id, kind, status, amount_minor, currency, reference, email, attempts, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []).map((r) => ({ ...r, amount_minor: Number(r.amount_minor ?? 0) }));
  return { rows, stats: recoveryStats(rows) };
}