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

/** Publish a domain event. Never throws — observability must not break flows. */
export async function publishEvent(
  event_type: DomainEventType,
  aggregate: string,
  aggregate_id: string | null,
  payload: Record<string, unknown> = {},
) {
  try {
    await supabaseAdmin.from("domain_events").insert({
      event_type,
      aggregate,
      aggregate_id,
      payload: payload as never,
    });
  } catch (e) {
    console.error("[events] publish failed", event_type, e);
  }
}

/** Append an immutable audit record. */
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
      entity,
      entity_id,
      actor_id,
      detail: detail as never,
    });
  } catch (e) {
    console.error("[audit] write failed", action, e);
  }
}