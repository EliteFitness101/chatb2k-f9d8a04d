import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DomainEventType =
  | "AssessmentStarted"
  | "AssessmentCompleted"
  | "RecommendationGenerated"
  | "OrderCreated"
  | "PaymentReceived"
  | "PaymentVerified"
  | "PaymentFailed"
  | "PaymentRefunded"
  | "FulfillmentAllocated"
  | "FulfillmentTransitioned"
  | "InventoryReserved"
  | "WebhookRejected"
  | "OpsTaskCreated"
  | "OpsTaskAssigned"
  | "OpsTaskTransitioned"
  | "SlaStarted"
  | "SlaWarning"
  | "SlaBreached"
  | "SlaMet"
  | "AlertEscalated"
  | "AlertAcknowledged"
  | "AlertResolved"
  | "HubCapacityRefreshed"
  | "HubReassigned"
  | "InventoryAdjusted"
  | "RecoveryOpened"
  | "RecoveryContacted"
  | "RecoveryConverted"
  | "WebhookReprocessed"
  | "PaymentReconciled"
  | "CustomerSuccessTriggered";

/**
 * Canonical ResoFit event publisher.
 *
 * v3 code previously targeted the retired `domain_events` table. Production
 * now uses `resofit_events` as the shared event contract consumed by the
 * ResoFit ecosystem and adapter layer.
 *
 * Observability must never break a customer journey, so failures are logged
 * locally and deliberately swallowed.
 */
export async function publishEvent(
  event_type: DomainEventType,
  aggregate: string,
  aggregate_id: string | null,
  payload: Record<string, unknown> = {},
) {
  try {
    const rsid = typeof payload.rsid === "string" ? payload.rsid : null;
    const session_id = typeof payload.session_id === "string" ? payload.session_id : null;
    const anonymous_id = typeof payload.anon_id === "string" ? payload.anon_id : null;
    const funnel_origin =
      typeof payload.funnel_origin === "string" ? payload.funnel_origin : "chatb2k";
    const utm =
      payload.utm && typeof payload.utm === "object"
        ? (payload.utm as Record<string, unknown>)
        : {};

    await supabaseAdmin.from("resofit_events").insert({
      event_name: event_type,
      source_system: "chatb2k",
      aggregate_type: aggregate,
      aggregate_id,
      payload: {
        aggregate,
        aggregate_id,
        ...payload,
      } as never,
      rsid,
      session_id,
      anonymous_id,
      funnel_origin,
      utm: utm as never,
    } as never);
  } catch (e) {
    console.error("[events] publish failed", event_type, e);
  }
}

/** Append an immutable audit record using the canonical production schema. */
export async function audit(
  action: string,
  entity: string,
  entity_id: string | null,
  detail: Record<string, unknown> = {},
  actor_id: string | null = null,
) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      action,
      resource: entity,
      user_id: actor_id,
      metadata: {
        entity_id,
        ...detail,
      } as never,
    });
  } catch (e) {
    console.error("[audit] write failed", action, e);
  }
}
