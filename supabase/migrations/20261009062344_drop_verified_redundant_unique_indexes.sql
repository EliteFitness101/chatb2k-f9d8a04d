-- Keep one equivalent unique index for each key; retain the constraint-backed or highest-use equivalent.
DROP INDEX IF EXISTS public.payment_events_paystack_ref_unique;
DROP INDEX IF EXISTS public.payments_paystack_ref_unique;
DROP INDEX IF EXISTS public.products_sku_unique_idx;
DROP INDEX IF EXISTS public.resoflex_subscribers_reference_uidx;
DROP INDEX IF EXISTS public.resoflex_subscribers_rsid_uidx;
DROP INDEX IF EXISTS public.uq_telemetry_completion;
DROP INDEX IF EXISTS public.ux_resofit_telemetry_completed_action;
