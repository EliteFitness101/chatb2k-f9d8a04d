# Jumia catalogue reconciliation — evidence baseline

**Captured:** 2026-11-05  
**Registry:** ResoFlex Edge Node project `xtgteviwtoupbfvorrmk`  
**Source:** `JUMIA_NG` / Jumia Nigeria  
**Consumer commerce authority:** main ResoFit project `vbqjvmnhdtdhmeeudqnn`

## Current registry facts

The Edge Node contains 58 Jumia discovery rows. The registry read returned:

- 58/58 have a source URL, but 0/58 have a canonical direct product URL.
- 58/58 are `category_page_only_unverified`; the recorded links are category surfaces, not product detail pages.
- 58/58 have a historical source price; the prices are discovery snapshots from September 2026 and are not verified live selling prices.
- 0 seller names, 0 brand values, 0 image URLs, 0 variants, 0 verified pickup locations, and 0 verified delivery/COD/returns/warranty details.
- 0 are resale-authorized, 0 are publish-eligible, and all have unknown stock.
- The source registry explicitly records `resale_authorized=false`, `media_authorized=false`, and `automated_collection_authorized=false`.

The existing source policy therefore blocks automated Jumia crawling and media reuse until written permission or an authorized API/feed and its evidence URL are recorded. Do not use Firecrawl or direct fetch to bypass this source-level authorization gate.

## Additive change in this PR

- Preserve the deployed Edge Node v6 implementation as a version-controlled source snapshot under `infra/supabase/edge-node/`, targeting the Edge Node project explicitly.
- Add an admin-only, read-only `export_registry` action with pagination and optional `source_code` filter. It returns the complete registry row metadata for CEO/admin reconciliation.
- Expand the existing main-project `orchestration-resoflex-commerce-intelligence` route allow-list to include only the actions already implemented by the Edge Node plus `export_registry`.
- Add a manual smoke workflow that verifies the 58-row Jumia export through the existing ChatB2K ecosystem router. It prints only aggregate checks, not product PII or secrets.

## Commerce boundary

The main ResoFit catalogue remains the authority for customer-visible products and checkout. Current `products` catalogue snapshot: 539 rows, 138 published; modes: digital 73 (25 published), hybrid 24 (22 published), physical 437 (87 published), service 5 (4 published).

Jumia candidates remain discovery-only. Do not copy them into the customer-facing `products` table, create a Paystack SKU, publish a product page, or place them in a purchasable bundle until all of the following are evidenced per item:

1. Direct product detail URL and exact product/variant identity.
2. Current price/currency, seller identity, brand, SKU/GTIN where available.
3. Live availability and quantity/stock evidence.
4. Express resale/fulfilment authorization and evidence URL.
5. Media rights for any reused image/video; otherwise use original ResoFit-created creative.
6. Product-specific shipping fee/ETA, Jumia Express status, pickup locations, COD availability, returns and warranty terms.
7. ResoFit SKU mapping and approved resale price/margin.
8. A ResoFit-owned checkout/fulfilment contract that does not imply Jumia checkout integration or stock ownership.

## Hybrid collection design after verification

Use one canonical collection manifest and stable product/offer IDs across `elite.resofit.fit/shop`, `shop.resofit.fit`, `store.resofit.fit`, and `resofit.fit/shop`. Keep domain routing as presentation, not separate catalogues.

Proposed collection families:

- **BIGO / Creator Launch:** verified physical creator equipment + Elite101 onboarding, creator profile, live-host setup and digital guides.
- **TikTok / Short-form Studio:** lighting, phone tracking, microphones and creator workflow services.
- **YouTube Studio:** microphone, tripod, lighting, gimbal and video-production services.
- **ResoFlex Home Gym:** resistance bands, mats, rollers and verified weights + Reset/Meal Move/NaijaFit digital plans.
- **ResoFlex Performance:** approved strength/cardio equipment + coaching and Fitness Evolution programme.

Each collection item must expose explicit `fulfillment_mode`, seller/vendor, source evidence, current price, resale price and margin policy, inventory source, delivery method, pickup eligibility, returns/warranty, payment authority, and fulfillment owner. Mixed carts must be rejected unless each line item has a supported fulfillment contract. `paystack-init` remains the only payment initializer; physical/hybrid checkout requires available ResoFit inventory and a delivery address. Do not represent Jumia Express or pickup as available until verified.

## Orchestration ownership

- `chatb2k110`: orchestration/routing intelligence.
- `chatb2k112`: discovery and source intelligence.
- `chatb2k114`: commerce offers/recommendations.
- `chatb2k118`: source ingestion.
- `chatb2k121`: dynamic experience/page generation.
- `chatb2k122`: commerce transaction/fulfilment.
- `chatb2k126` and `chatb2k173`: not present in the current live `chatb2k_orchestration_nodes` query; do not claim they are registered or synced until provisioned and verified.

## Release gates

1. Merge/apply the route allow-list migration only after reviewing the Vercel/CI checks.
2. Deploy the Edge Node function to project `xtgteviwtoupbfvorrmk` (not the main `vbqjvmnhdtdhmeeudqnn` project).
3. Run the manual registry smoke workflow; require exactly 58 rows and all discovery-only safety checks.
4. Reconcile the individual 58 records against an authorized feed or written supplier evidence.
5. Only then prepare customer-facing collection/page/checkout changes. Vercel preview and production readiness remain separate gates.
