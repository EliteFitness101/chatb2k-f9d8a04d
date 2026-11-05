# Jumia catalogue reconciliation — evidence baseline

**Captured:** 2026-11-05  
**Registry:** ResoFlex Edge Node project `xtgteviwtoupbfvorrmk`  
**Source:** `JUMIA_NG` / Jumia Nigeria  
**Consumer commerce authority:** main ResoFit project `vbqjvmnhdtdhmeeudqnn`

## Current registry facts

The Edge Node contains 58 Jumia discovery rows. The full row-level snapshots are committed with this PR:

- `docs/commerce/jumia-58-registry-snapshot.csv` — all 45 Edge Node registry columns, including IDs, page URLs, prices, stock/rights/authorization fields, variants, delivery, ratings, source metadata and timestamps.
- `docs/commerce/jumia-58-main-commerce-offers.csv` — all 58 main-project offer mirrors, including external IDs, links, prices, availability, checkout metadata and source metadata.
- `docs/commerce/jumia-58-supplier-products.csv` — all 58 main-project supplier mirror rows, including raw payload, supplier price, stock quantity, media rights and resale status.

The registry read returned:

- 58/58 have a source URL, but 0/58 have a canonical direct product URL.
- 58/58 are `category_page_only_unverified`; the recorded links are category surfaces, not product detail pages.
- 58/58 have a historical source price; the prices are discovery snapshots from September 2026 and are not verified live selling prices.
- The 58 rows collapse to 55 normalized titles. Three probable duplicate groups need manual identity confirmation: 5-in-1 resistance band (2), yoga mat (2), and Roll Max 4-wheel ab roller (2).
- 0 seller names, 0 brand values, 0 image URLs, 0 variants, 0 verified pickup locations, and 0 verified delivery/COD/returns/warranty details.
- 0 are resale-authorized, 0 are publish-eligible, and all have unknown stock.
- The main-project `supplier_products` mirror also has 58 rows: all 58 are `resale_status=pending`, `stock_qty=0`, and have a source URL. The matching main-project `commerce_offers` mirror has 58 Jumia rows, all `availability=unknown` and `discovery_only=true`.
- The source registry explicitly records `resale_authorized=false`, `media_authorized=false`, and `automated_collection_authorized=false`.

The existing source policy therefore blocks automated Jumia crawling and media reuse until written permission or an authorized API/feed and its evidence URL are recorded. Do not use Firecrawl or direct fetch to bypass this source-level authorization gate.

The main project's public `catalog-public/search` implementation currently queries `commerce_offers` without excluding discovery-only rows. The 58 Jumia offers are marked `discovery_only=true`, `availability=unknown`, `stock_verified=false`, and point to category pages. The PR's main-project `catalog-public` snapshot adds an allow-list: internal offers must be enabled, available and priced; external offers additionally require verified direct product links, checkout flow, and stock evidence. Jumia discovery rows therefore stay out of public search until those gates are satisfied.

## Additive change in this PR

- Preserve the deployed Edge Node v6 implementation as a version-controlled source snapshot under `infra/supabase/edge-node/`, targeting the Edge Node project explicitly.
- Add an admin-only, read-only `export_registry` action with pagination and optional `source_code` filter. It returns the complete registry row metadata for CEO/admin reconciliation.
- Expand the existing main-project `orchestration-resoflex-commerce-intelligence` route allow-list to include only the actions already implemented by the Edge Node plus `export_registry`.
- Preserve the main-project `catalog-public` v51 implementation with a fail-closed public-search filter for commerce offers; unverified discovery-only Jumia links are not returned to public search.
- Add a public `collections` resource that returns only published `commerce_collection_v1` manifests and expose `fulfillment_mode` in canonical product responses.
- Seed five review-only draft hybrid manifests: Home Gym Starter, Mobility & Yoga, Strength Evolution, Performance Gym, and Elite Creator Fitness Launch.
- Seed a sixth hidden master manifest containing all 58 Jumia discovery candidates for admin reconciliation. It is draft-only and has no prices or checkout.
- Jumia candidate items remain hidden-price and non-purchasable; first-party physical products are gated on inventory refresh; Elite101 USD services use a separate checkout.
- Add a manual smoke workflow that verifies the 58-row Jumia export through the existing ChatB2K ecosystem router and, when a publishable/anon key is configured, verifies that public search excludes Jumia links while retaining first-party product results. The workflow prints only aggregate checks, not product data or secrets.

## Commerce boundary

The main ResoFit catalogue remains the authority for customer-visible products and checkout. Current `products` catalogue snapshot: 539 rows, 138 published; modes: digital 73 (25 published), hybrid 24 (22 published), physical 437 (87 published), service 5 (4 published).

Two published first-party physical products are currently in the inventory source as available: the 9.1ft adjustable jump rope (₦5,999) and the 11-piece resistance-band set (₦14,999). Each has seven 1,000-unit location rows, including Port Harcourt, Lagos, Aba, Umuahia, Ottawa, China and Jersey City. Those rows are `user_confirmed` / `ceo_confirmed_minimum` and were last updated 2026-09-16; treat them as historical user-confirmed inventory, not a live supplier stock feed or proof of pickup/delivery at every location. The main project also has 68 `commerce_offers`, including the same 58 Jumia discovery offers; all 58 Jumia offers are `availability=unknown`, `discovery_only=true`, and `stock_verified=false`. The Jumia `commerce_sources` record is enabled for discovery but is `platform_recommendation_only`, with resale/media authorization false and stock verification not connected.

Jumia candidates remain discovery-only. Do not copy them into the customer-facing `products` table, create a Paystack SKU, publish a product page, or place them in a purchasable bundle until all of the following are evidenced per item:

1. Direct product detail URL and exact product/variant identity.
2. Current price/currency, seller identity, brand, SKU/GTIN where available.
3. Live availability and quantity/stock evidence.
4. Express resale/fulfilment authorization and evidence URL.
5. Media rights for any reused image/video; otherwise use original ResoFit-created creative.
6. Product-specific shipping fee/ETA, Jumia Express status, pickup locations, COD availability, returns and warranty terms.
7. ResoFit SKU mapping and approved resale price/margin.
8. A ResoFit-owned checkout/fulfilment contract that does not imply Jumia checkout integration or stock ownership.

The `experience_page_registry` currently contains zero registered experience pages, so there are no canonical dynamic collection manifests/pages yet. The current `chatb2k-commerce-recommendations` v3 endpoint recommends only published first-party `products`; it does not ingest the Jumia `commerce_offers`. The existing `paystack-init` v67 accepts only published first-party product SKUs with classified fulfillment modes; physical/hybrid items require available ResoFit inventory and a delivery address. It does not create Jumia supplier checkout sessions.

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
- `chatb2k126` and `chatb2k173`: absent from both the live `chatb2k_orchestration_nodes` table and `resofit_v12_engine_registry`; do not claim they are registered or synced until provisioned with roles, event contracts, health and heartbeat evidence.

## Release gates

1. Deploy the main-project `catalog-public` function snapshot to `vbqjvmnhdtdhmeeudqnn` and verify public search no longer returns Jumia discovery offers.
2. Apply the route allow-list migration only after reviewing the Vercel/CI checks.
3. Deploy the Edge Node function to project `xtgteviwtoupbfvorrmk` (not the main `vbqjvmnhdtdhmeeudqnn` project).
4. Run the manual registry smoke workflow; require exactly 58 rows and all discovery-only safety checks. Run the public-search smoke when the publishable/anon key is configured.
5. Reconcile the individual 58 records against an authorized feed or written supplier evidence.
6. Only then prepare customer-facing collection/page/checkout changes. Vercel preview and production readiness remain separate gates.
