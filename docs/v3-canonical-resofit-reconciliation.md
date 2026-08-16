# ResoFit v3.0 — Canonical Production Reconciliation

## Production backend

The production ChatB2K experience must use the canonical ResoFit Supabase project:

- Project ref: `vbqjvmnhdtdhmeeudqnn`
- Project name: `resonance-fitness`
- Region: `eu-west-1`
- Status at verification: `ACTIVE_HEALTHY`

Do **not** point production at the separate `tlsrcdtnyhfiuuygtopl` project unless it is explicitly approved as a new environment.

## Why this patch exists

The ChatB2K repository contains the earlier v3 commerce migrations (`assessments`, `assessment_answers`, `health_profiles`, `recommendation_results`, `orders`, `domain_events`, etc.), but the canonical production database has since evolved. The live schema now exposes the ResoFit financial/event model including:

- `payments`
- `payment_events`
- `payment_event_processing`
- `payment_webhook_logs`
- `revenue_events`
- `resofit_events`
- `resofit_event_contracts`
- `resoflex_subscribers`
- `resoflex_upsells`
- `customer_preferences`
- `product_intelligence`
- `products`
- `user_roles`
- `permissions`
- `role_permissions`

Therefore the old v3 migrations must not be replayed blindly against production.

## Critical funnel after this patch

```text
chatb2k.resofit.fit
  -> ChatB2K assessment
  -> customer_preferences snapshot
  -> resofit_events: AssessmentCompleted
  -> resofit_events: RecommendationGenerated
  -> /checkout
  -> canonical payments row (pending)
  -> Paystack initialize
  -> signed Paystack webhook
  -> payment_events + payment_event_processing
  -> finalize_payment_success RPC
  -> canonical payments success
  -> revenue_events
  -> resofit_events: PaymentVerified
  -> audit_logs
  -> downstream ResoFit adapter/event processing
```

## ₦380,000 Apex rule

The client and server retain the NGN-base threshold of `38,000,000` kobo. The server computes the Paystack amount from the canonical product catalog and never trusts a client-provided amount.

## Required production Vercel variables

Set these in **Production** for the ChatB2K Vercel project:

- `SUPABASE_URL=https://vbqjvmnhdtdhmeeudqnn.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<server-only secret>`
- `SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>`
- `VITE_SUPABASE_URL=https://vbqjvmnhdtdhmeeudqnn.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>`
- `VITE_SUPABASE_PROJECT_ID=vbqjvmnhdtdhmeeudqnn`
- `PAYSTACK_PUBLIC_KEY=<production pk_live key>`
- `PAYSTACK_SECRET_KEY=<production sk_live key>`
- `VITE_SITE_URL=https://chatb2k.resofit.fit`
- `NODE_ENV=production`

Never commit or paste secret values into GitHub source files.

## Webhook URL

Paystack production webhook should point to the deployed application route:

`https://chatb2k.resofit.fit/api/public/webhooks/paystack`

The webhook must use the same production Paystack secret configured in Vercel. Signature verification is HMAC-SHA512 over the raw request body.

## Remaining release blocker

This reconciliation intentionally does **not** claim fulfillment completion. The current canonical schema evidence confirms the financial/event layer, but the repository's older fulfillment implementation still targets the retired `orders`/`fulfillment_orders` model. A separate adapter-level fulfillment reconciliation must be completed before declaring the full payment → verified → fulfillment → delivery chain production-complete.
