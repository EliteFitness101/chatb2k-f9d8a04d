-- Keep the canonical payment reference unique constraint and remove duplicate constraints.
-- Catalog audit confirmed no foreign key or function depends on these redundant constraint names.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS unique_payment_reference;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS unique_paystack_reference;
