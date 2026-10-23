-- Add settlement evidence fields without changing existing payment records.
ALTER TABLE public.payment_currency_ledger
  ADD COLUMN IF NOT EXISTS settlement_transaction_amount_minor bigint
    CHECK (settlement_transaction_amount_minor IS NULL OR settlement_transaction_amount_minor >= 0),
  ADD COLUMN IF NOT EXISTS settlement_status text
    CHECK (settlement_status IS NULL OR settlement_status IN ('success', 'processing', 'pending', 'failed'));

COMMENT ON COLUMN public.payment_currency_ledger.settlement_transaction_amount_minor IS
  'Gross transaction amount listed inside a successful Paystack settlement; not the allocated net payout after aggregate fees.';
COMMENT ON COLUMN public.payment_currency_ledger.reconciliation_status IS
  'matched means the transaction was found in a successful settlement and gross charge amount/currency matched. It does not imply per-transaction net payout allocation.';
