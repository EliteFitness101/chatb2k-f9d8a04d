-- Supports idempotent upsert by reference and event type.
-- The legacy unique-per-reference index remains until the new webhook code is deployed.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_reference_event_key
  ON public.payment_events (paystack_ref, event);
