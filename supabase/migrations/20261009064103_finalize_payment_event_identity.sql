-- APPLY ONLY AFTER the event_key-aware Paystack webhook code is deployed.
-- This removes the legacy one-row-per-payment-reference constraints so paid, failed,
-- and refunded events for the same transaction can be processed independently.
UPDATE public.payment_event_processing
SET event_key = COALESCE(event_key, 'legacy:' || id::text),
    event_type = COALESCE(event_type, 'legacy'),
    attempt_count = GREATEST(attempt_count, 1),
    updated_at = COALESCE(updated_at, now())
WHERE event_key IS NULL OR event_type IS NULL;

ALTER TABLE public.payment_event_processing
  ALTER COLUMN event_key SET NOT NULL,
  ALTER COLUMN event_type SET NOT NULL;

ALTER TABLE public.payment_event_processing
  DROP CONSTRAINT IF EXISTS payment_event_processing_paystack_ref_key;

ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS unique_payment_event_reference;

-- This composite index was pre-created before the app rollout for safe ON CONFLICT inference.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_reference_event_key
  ON public.payment_events (paystack_ref, event);
