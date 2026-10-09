-- Register the canonical checkout-abandoned event contract.
-- Event rows remain the system of record; downstream delivery adapters are optional.
INSERT INTO public.resofit_event_contracts (
  event_name,
  contract_version,
  required_fields,
  critical
)
VALUES (
  'checkout.abandoned',
  '1.0',
  ARRAY['checkout_id']::text[],
  false
)
ON CONFLICT DO NOTHING;
