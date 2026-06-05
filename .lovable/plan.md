
# Production Patch Plan — Revenue OS, Trust, Fulfillment, SEO

Non-destructive. Reuses existing catalog, ProductCard, routes (`/`, `/products/$slug`, `/paystack`, `/checkout`, `/success`), and analytics events. No UI rebuild, no new design system.

---

## 1. Revenue attribution (RSID + UTM)

**New:** `src/lib/attribution.ts`
- `getRSID()` — read/write `rf_rsid` from `localStorage`, generate with `crypto.randomUUID()`.
- `captureUTM()` — on first paint, read `utm_*` from `location.search`, persist to `localStorage` under `rf_utm` (only overwrite if new utm_source present).
- `getAttribution()` → `{ rsid, utm }`.

**Edit:** `src/routes/index.tsx` — extend existing `track()` helper to merge `getAttribution()` into every event payload. Call `captureUTM()` inside the existing `useEffect` that fires `landing_view`. Pass `rsid` in the Paystack init metadata via the existing checkout flow.

**Edit:** `src/lib/paystack.functions.ts` — accept optional `rsid`, `utm`, `variant`, `source` in `InitSchema`; pass them into Paystack `metadata` and persist into a new `revenue_events` row on webhook.

## 2. Database — revenue_events + funnel_events

**Migration:** create two tables with RLS (admin-only read, service_role write), proper GRANTs.
- `revenue_events(id, reference, amount_minor, currency, email, rsid, utm jsonb, product_sku, variant, source, occurred_at)`
- `funnel_events(id, rsid, event_name, props jsonb, occurred_at)`

Both: `GRANT SELECT TO authenticated` gated by `has_role(auth.uid(),'admin')` policy; `GRANT ALL TO service_role`.

## 3. Paystack webhook — extend, do not duplicate

**Edit:** existing `src/routes/api/public/paystack-webhook.ts` (do NOT create `/api/paystack/webhook` — that conflicts with existing route). On `charge.success`, in addition to current `orders.status='paid'` update, insert into `revenue_events` with `metadata.rsid/utm/sku/variant/source` from Paystack metadata.

## 4. Security cleanup (blocking findings)

- **Delete** `src/routes/api/public/_webhook-selftest.ts` (flagged: unauthenticated DB write).
- **Edit** `src/lib/paystack.functions.ts`:
  - `getOrderByReference`: switch to user-scoped `requireSupabaseAuth` OR restrict columns to non-PII (`status, reference, amount_minor, currency, assigned_hub_id`) so success page can still render.
  - `verifyPaystackTransaction`: keep but only update status when Paystack response is `success`; never write `failed` from this path (let webhook own failure state).
- **Migration:** tighten RLS on `orders`, `order_items`, `profiles` (drop public SELECT; admin or owner only). Add column-restrictive trigger on `profiles` to block client writes to `xp`, `points`, `tier`.

## 5. Fulfillment estimator

**New:** `src/components/site/FulfillmentEstimate.tsx` — small badge component.
- Uses existing `getGeo()` serverFn (already returns `suggestedHub`).
- Renders: "Ships from {hub} • Est. delivery {window}" where window = NG→"1–3 business days", US→"5–8 business days", else→"7–14 business days".

**Edit:** mount above primary CTA in `src/routes/index.tsx` (hero block) and `src/routes/products.$slug.tsx` (next to price/CTA). No layout changes beyond inserting one component.

## 6. Trust component

**New:** `src/components/site/NigerianEcommerceTrustCheck.tsx` — extracts the 4 trust badges already inline in `index.tsx` into a reusable component (Paystack secure / 24–48h insured delivery / WhatsApp support / Premium guarantee). Same styling/tokens.

**Edit:** `src/routes/index.tsx` replaces inline badges with `<NigerianEcommerceTrustCheck />`. `src/routes/products.$slug.tsx` renders it above CTA.

## 7. Product SEO metadata

**New:** `src/lib/product-seo.ts` — `Record<slug, { title, description, ogImage, alt }>` for all 9 slugs, written in obsidian + gold brand voice.

**Edit:** `src/routes/products.$slug.tsx` — extend existing `head()` to use product-seo entries (title, description, og:title, og:description, og:image from existing `/images/products/{slug}.jpg`, canonical, JSON-LD `Product` schema with price + SKU). Image `alt` from `product-seo`.

Existing per-product dedicated route already exists (`/products/$slug`), so no new routes needed — requirement #6 is already satisfied; we extend.

## 8. Checkout SKU accuracy

**Edit:** `src/lib/catalog.ts` — add `paystackSku` / `shopifySku` fields per product (defaults to existing `sku`). Used by `initPaystackTransaction` (already uses `productBySku` correctly — verify mapping for bundle).

No checkout UI changes. Currency routing already correct (NGN→Paystack via geo).

## 9. Admin revenue dashboard

**New route:** `src/routes/_authenticated/admin.revenue.tsx`
- `requireSupabaseAuth` + `has_role(uid,'admin')` check via new serverFn `getRevenueDashboard` in `src/lib/admin.functions.ts`.
- ServerFn queries `revenue_events` for: today's revenue, order count, conv rate (paid/funnel_events 'landing_view'), grouped by `utm_source`, grouped by `product_sku`, latest 20 payments.
- UI: reuses existing `glass`, `font-display`, gold tokens. No new design system. Simple grid of cards + table.

## 10. Analytics compatibility

Preserve all existing events: `landing_view`, `metabolic_reset_click`, `assessment_started`, `checkout_started`, `whatsapp_click`, `scroll_depth_50`, `scroll_depth_90`. Extend payloads with `{rsid, utm}` only. Mirror to `funnel_events` table via a fire-and-forget serverFn `recordFunnelEvent` (best-effort, no UI block).

---

## Files (created / edited)

```text
NEW
  src/lib/attribution.ts
  src/lib/product-seo.ts
  src/lib/admin.functions.ts
  src/components/site/FulfillmentEstimate.tsx
  src/components/site/NigerianEcommerceTrustCheck.tsx
  src/routes/_authenticated/admin.revenue.tsx
  supabase/migrations/<ts>_revenue_os.sql

EDIT
  src/routes/index.tsx                       (extend track(), add components)
  src/routes/products.$slug.tsx              (SEO head + trust + fulfillment)
  src/lib/catalog.ts                         (optional sku variant fields)
  src/lib/paystack.functions.ts              (rsid/utm pass-through, security fix)
  src/routes/api/public/paystack-webhook.ts  (insert revenue_events)

DELETE
  src/routes/api/public/_webhook-selftest.ts
```

## Out of scope (per "minimal change")

- No redesign of hero / cards / footer
- No new fonts/colors
- No replacement of `index.tsx` content
- No removal of existing routes
- Existing edge-only Shopify rail untouched

---

## Sequence

1. Migration (blocking — wait for approval) — tables + RLS tightening
2. After migration runs: write all NEW files in parallel
3. Edit existing routes/lib files in parallel
4. Delete self-test route
5. Verify build, hit webhook with a real Paystack event in staging
