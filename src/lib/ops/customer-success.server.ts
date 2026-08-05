import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishEvent } from "@/lib/events.server";
import { ensureTask } from "@/lib/ops/tasks.server";
import { startSla } from "@/lib/ops/sla.server";

/**
 * Customer success automation driven by the shared ChatB2K / commerce event
 * stream. Every trigger is idempotent through the task dedupe key.
 */
export async function runCustomerSuccessAutomation(now: Date = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  let created = 0;

  // 1. Assessment completed → send personalised recommendation.
  const { data: completed } = await supabaseAdmin
    .from("assessments")
    .select("id, email, user_id, completed_at, rsid")
    .eq("status", "completed")
    .gte("completed_at", since)
    .limit(200);
  for (const a of completed ?? []) {
    const id = await ensureTask({
      type: "recommendation_followup",
      priority: "normal",
      title: `Send personalised recommendation${a.email ? ` to ${a.email}` : ""}`,
      sourceEvent: "AssessmentCompleted",
      entity: "assessment",
      entityId: a.id,
      dedupeKey: `cs-recommendation:${a.id}`,
      detail: { email: a.email, rsid: a.rsid },
    });
    if (id) {
      created += 1;
      await startSla("support_response", "assessment", a.id, { reason: "recommendation delivery" });
      await publishEvent("CustomerSuccessTriggered", "assessment", a.id, {
        workflow: "recommendation_followup",
      });
    }
  }

  // 2. Upsell declined → schedule an alternative offer.
  const { data: declined } = await supabaseAdmin
    .from("upsell_events")
    .select("id, rsid, offer_sku, created_at")
    .eq("accepted", false)
    .gte("created_at", since)
    .limit(200);
  for (const u of declined ?? []) {
    const id = await ensureTask({
      type: "alternative_offer",
      priority: "low",
      title: `Schedule alternative offer for ${u.offer_sku ?? "declined upsell"}`,
      sourceEvent: "UpsellDeclined",
      entity: "upsell_event",
      entityId: u.id,
      dedupeKey: `cs-alt-offer:${u.id}`,
      detail: { rsid: u.rsid, declined_sku: u.offer_sku },
    });
    if (id) created += 1;
  }

  // 3. Membership nearing renewal (30 days after purchase) → reminder.
  const windowStart = new Date(now.getTime() - 27 * 24 * 3600_000).toISOString();
  const windowEnd = new Date(now.getTime() - 25 * 24 * 3600_000).toISOString();
  const { data: memberships } = await supabaseAdmin
    .from("revenue_events")
    .select("id, email, product_sku, amount_minor, occurred_at")
    .eq("status", "success")
    .gte("occurred_at", windowStart)
    .lte("occurred_at", windowEnd)
    .limit(200);
  for (const m of memberships ?? []) {
    if (!m.product_sku?.toUpperCase().includes("ELITE") && !m.product_sku?.toUpperCase().includes("MEMBER"))
      continue;
    const id = await ensureTask({
      type: "renewal_reminder",
      priority: "normal",
      title: `Membership renewal reminder${m.email ? ` — ${m.email}` : ""}`,
      sourceEvent: "MembershipRenewalDue",
      entity: "revenue_event",
      entityId: m.id,
      dedupeKey: `cs-renewal:${m.id}`,
      detail: { email: m.email, sku: m.product_sku },
    });
    if (id) created += 1;
  }

  return { tasks_created: created };
}