-- Global-presentment / local-settlement reconciliation ledger.
-- Additive only: does not change existing product prices, Paystack charge currency,
-- orders, payments, or fulfillment authority.
CREATE TABLE IF NOT EXISTS public.payment_currency_ledger (
  payment_reference text PRIMARY KEY,
  paystack_transaction_id bigint,
  customer_email text,
  display_currency text NOT NULL CHECK (display_currency ~ '^[A-Z]{3}$'),
  display_amount_minor bigint NOT NULL CHECK (display_amount_minor >= 0),
  charged_currency text NOT NULL CHECK (charged_currency ~ '^[A-Z]{3}$'),
  charged_amount_minor bigint NOT NULL CHECK (charged_amount_minor >= 0),
  settlement_currency text CHECK (settlement_currency IS NULL OR settlement_currency ~ '^[A-Z]{3}$'),
  settlement_amount_minor bigint CHECK (settlement_amount_minor IS NULL OR settlement_amount_minor >= 0),
  settlement_fee_minor bigint CHECK (settlement_fee_minor IS NULL OR settlement_fee_minor >= 0),
  settlement_reference text,
  fx_rate_to_ngn numeric(20,8),
  fx_rate_source text,
  fx_rate_observed_at timestamptz,
  payment_status text NOT NULL DEFAULT 'success'
    CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded', 'chargeback')),
  reconciliation_status text NOT NULL DEFAULT 'awaiting_settlement'
    CHECK (reconciliation_status IN ('awaiting_settlement', 'matched', 'variance', 'needs_review')),
  reconciled_at timestamptz,
  provider_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_currency_ledger_reconciliation_idx
  ON public.payment_currency_ledger (reconciliation_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS payment_currency_ledger_transaction_idx
  ON public.payment_currency_ledger (paystack_transaction_id)
  WHERE paystack_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_currency_ledger_settlement_idx
  ON public.payment_currency_ledger (settlement_reference)
  WHERE settlement_reference IS NOT NULL;

ALTER TABLE public.payment_currency_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_currency_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_currency_ledger TO service_role;

COMMENT ON TABLE public.payment_currency_ledger IS
  'Server-only audit ledger separating displayed price, Paystack charged amount, and verified payout settlement. FX fields must come from a documented source; never infer settlement from display price.';
COMMENT ON COLUMN public.payment_currency_ledger.fx_rate_to_ngn IS
  'Recorded NGN reporting conversion rate, not an assumed Paystack payout rate. Populate only with a timestamped, identified rate source.';
