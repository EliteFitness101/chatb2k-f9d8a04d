# Global display currency and NGN reconciliation

## Ownership

- Customer UI and offer presentation: `EliteFitness101/elite101` (`https://elite.resofit.fit`).
- Payment orchestration and event pipeline: `EliteFitness101/chatb2k-f9d8a04d`.
- Canonical payment authority and financial records: ResoFit production Supabase `resonance-fitness` (`vbqjvmnhdtdhmeeudqnn`) and Paystack.
- Paystack secret keys remain server-side. ChatB2K is not a second payment authority.

## Currency rules

1. The customer-facing display currency is not evidence of the currency charged.
2. The verified Paystack transaction is the source of truth for `charged_currency` and `charged_amount_minor`.
3. The actual settlement currency, amount, fees, and settlement reference must be populated from Paystack settlement/settlement-transaction records or the verified payout statement. Do not infer them from the cardholder's currency or an exchange-rate widget.
4. When the checkout is priced in NGN, international card issuers may convert their cardholder's currency; the merchant receives the NGN amount charged less Paystack fees. This is the preferred NGN-settlement route.
5. Paystack also supports USD transactions for eligible Nigerian businesses, but USD payouts require a verified USD domiciliary account. A USD charge must not be described as NGN-settled unless actual conversion and payout evidence proves that.
6. The ledger's `fx_rate_to_ngn` is a reporting/management conversion only unless a settlement record proves it is the actual payout conversion. Every rate must include source and observation timestamp. Never hardcode a rate or silently fall back to a stale rate.
7. Do not use a third-party market FX rate as “Paystack's rate”. Paystack's published international-card model has the cardholder bank convert to the merchant's local currency when the product is priced in NGN; it is not a merchant-side Paystack FX quote API.

## Ledger lifecycle

- `charge.success`: signature-verified webhook records displayed amount/currency (if server-supplied metadata exists) and actual charged amount/currency; status becomes `awaiting_settlement`.
- Settlement importer/reconciliation job: fetches Paystack settlement and settlement transactions using a server-only secret, matches transaction/reference and fees, records actual settlement currency/amount and settlement ID, and marks `matched` or `variance`.
- Missing, late, duplicated, or contradictory data is idempotently retried and escalated to `needs_review`; never creates a second charge or fulfillment.
- Refunds and disputes update payment status without deleting the original charge/settlement audit.
- Customer UI must display a clear final charge currency and amount before redirecting to Paystack. Do not imply a USD price is charged as USD when the backend initializes NGN.

## Production gates

- Apply the additive migration to canonical production Supabase only after reviewing the migration diff.
- Confirm Paystack dashboard international-payment enablement and settlement account configuration.
- Add/verify a settlement importer with idempotency, pagination, retry, and alerting.
- Run tests for NGN international-card payments, USD charge if enabled, duplicate webhooks, failed charge, refund, chargeback, delayed settlement, and settlement variance.
- Verify with a real low-value live transaction and actual settlement evidence before status A / production verified.
