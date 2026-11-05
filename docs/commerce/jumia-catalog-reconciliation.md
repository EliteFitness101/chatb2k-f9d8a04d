# External commerce catalogue reconciliation — current evidence

**Evidence date:** 5 November 2026  
**Edge Node project:** `xtgteviwtoupbfvorrmk`  
**Main commerce project:** `vbqjvmnhdtdhmeeudqnn`  
**Customer-facing domains:** `shop.resofit.fit`, `store.resofit.fit`, `resofit.fit/shop`, `elite.resofit.fit/shop`

## Current Edge Node registry

The registry now contains 592 commerce records across 9 registered source roots:

| Source | Records | Category-only | Search-discovered product candidates | Publish eligible |
|---|---:|---:|---:|---:|
| Jumia Nigeria | 67 | 58 | 9 | 0 |
| Nonsman Online | 1 | 0 | 1 | 0 |
| Olubee Store | 8 | 0 | 8 | 0 |
| ResoFit internal catalogue | 525 | 0 | 0 | Internal catalogue authority |

The 58 original Jumia rows remain `category_page_only_unverified`. Nine new Jumia direct-product-page URLs have been added as `search_discovered_not_fetched` candidates. They have not been fetched by the Edge Node page extractor. The nine Jumia links are direct product URL candidates, not verified live offers.

The 18 new external candidates (9 Jumia, 1 Nonsman, 8 Olubee) all remain:
- `verification_status=DISCOVERED`
- `page_status=search_discovered_not_fetched`
- `stock_state=unknown`, `source_stock_qty=0`
- `resale_status=blocked`
- `image_rights_status=reference_only_unlicensed`
- `publish_eligible=false`

Prices and ratings attached to these candidates are search/listing snapshots only. They are not current supplier quotations, live stock confirmations, or resale-price recommendations. The Edge Node registry is the only place where these 18 candidates have been staged; they have not been mirrored into the main project's customer-facing products, offers or supplier checkout records.

## Jumia direct product-page candidates

These nine direct URLs were identified through public search/direct-page results and staged as discovery candidates:

| Product | Search price snapshot | Direct page |
|---|---:|---|
| Adjustable Phone Holder Stand | ₦3,000 | https://www.jumia.com.ng/generic-adjustable-phone-holder-stand-for-content-creation-netflix-388762336.html |
| Vlogging Kit + Mic + Tripod + Holder/Ring Light | ₦7,900 | https://www.jumia.com.ng/generic-vlogging-kitvideo-maker-kit-mictripodholder-ring-light.-242260862.html |
| Vlogging Kit + Mic + Tripod + Holder/Ring Light (second listing) | ₦7,900 | https://www.jumia.com.ng/vlogging-kitvideo-maker-kit-mictripodholder-ring-light-generic-mpg9591483.html |
| 1PC Elastic Training Band | ₦6,450 | https://www.jumia.com.ng/generic-1pc-elastic-training-band-legs-booty-exercise-bands-fitness-resistance-band-70567031.html |
| 3PCS Elastic Training Band Set | ₦11,295 | https://www.jumia.com.ng/generic-3pcs-elastic-training-band-straps-legs-booty-exercise-bands-yoga-fitness-resistance-band-229878674.html |
| 11-piece Resistance Bands | ₦12,995 | https://www.jumia.com.ng/generic-11xset-resistance-bands-workout-bands-elastic-fitness-exercise-training-tubes-65769742.html |
| 15KG Dumbbell Set with Barbell Extension | ₦31,445 | https://www.jumia.com.ng/15kg-dumbbell-set-with-barbell-extension-generic-mpg8923902.html |
| Adjustable Jump Rope | Price omitted; seller snapshots conflict | https://www.jumia.com.ng/generic-adjustable-jump-skipping-rope-cable-for-adultskids-126444025.html |
| 5-in-1 Resistance Exercise Band | ₦4,655 | https://www.jumia.com.ng/generic-5-in-1-resistance-exercise-bandyoga-pilates-fitness-sports-404448545.html |

The vlogging-kit pair is a duplicate-like listing group and needs seller/SKU comparison before consolidation. The 58 original category-page rows are not replaced or falsely relabelled as direct product pages.

## Additional supplier product candidates

- Nonsman AY-49G Video Making Kit — search snapshot ₦7,800; supplier page last-week snapshot reported 501 units. [Direct page](https://nonsmanonline.com/product/ay-49g-video-making-kit/)
- Olubee 12 Inches Ringlight — ₦16,000. [Direct page](https://olubeestores.com/product/12-inches-ringlight/)
- Olubee Wireless Mic — ₦12,000–₦20,000 variants. [Direct page](https://olubeestores.com/product/wireless-mic/)
- Olubee LED 600 + C08 Tripod + SX31 Wireless Mic — ₦95,000. [Direct page](https://olubeestores.com/product/led-600-c08-tripod-sx31-wireless-mic/)
- Olubee 3-in-1 Wireless Mic — ₦25,000; page snapshot reported out of stock. [Direct page](https://olubeestores.com/product/3-in-1-wireless-mic/)
- Olubee Tripod Selfie Ringlight — ₦13,500; page snapshot reported out of stock. [Direct page](https://olubeestores.com/product/tripod-selfie-ringlight/)
- Olubee SX8 Wireless Mic — ₦25,000; older listing requires refresh. [Direct page](https://olubeestores.com/product/super-efficient-wireless-mic-sx8/)
- Olubee Four-Mic Wireless Mic Series — ₦55,000. [Direct page](https://olubeestores.com/product/wireless-mic-4-mics-series/)
- Olubee LED 600 RGB + C08 Tripod + K95 Wireless Mic — ₦95,000. [Direct page](https://olubeestores.com/product/led-600-rgb-c08-tripod-k95-wireless-mic/)

## Registered source roots

Seven additional supplier source roots are registered in the Edge Node with `integration_mode=search_discovery`. Their automated collection, resale and media authorization flags are all false:

- Nonsman Online — https://nonsmanonline.com
- Olubee Store — https://olubeestores.com
- Wakeys Impex — https://www.wakeys.net
- SomtelShop — https://www.somtel.com.ng
- Simbi Props and Gadgets — https://simbiprops.com
- Ring Light Store — https://ringlightstore.com.ng
- Beejay Empire — https://beejayempire.com

The local vendor leads The Gadgets Envy and Live Streaming Gadgets Ng were found as physical supplier leads but do not yet have a verified product feed or official product catalogue URL recorded in the source registry. They remain contact/qualification leads, not product-source integrations.

## Existing ecosystem sourcing connectors and endpoints

- `chatb2k-sourcing-engine` v33: Gemini search with Firecrawl fallback; provider/domain classification includes Jumia, Konga, Jiji, AliExpress, Alibaba, Amazon, Etsy and registered local storefronts. It stages candidates with stock zero and resale/media authorization false unless supplier approval is recorded.
- `firecrawl-intelligence-gateway` v27: search, scrape, map, crawl, batch scrape, extract, agent and parse actions. It requires authenticated service/admin access. It is not a bypass for source authorization.
- `resoflex-commerce-intelligence` Edge Node v6: `health`, `export_registry`, `crawl`, `ingest_discovery`, `ingest_feed`, `record_comparison`. `ingest_discovery` is the search-candidate path. `crawl` and `ingest_feed` require an authorization evidence URL.
- `resofit-external-discovery-processor` v13: external business/provider discovery; it is not a product-feed substitute.
- Shopify Collective product candidate discovery was checked; the connected Collective flow does not support Nigeria as the merchant country.

## Authorization and page-validation boundary

Public search/direct-page results were used to identify URLs and capture search/listing snapshots. No source HTML was fetched by the ResoFlex Edge Node extractor in this refresh. Jumia source permissions remain `resale_authorized=false`, `media_authorized=false`, `automated_collection_authorized=false`, with no authorization evidence URL. The new supplier roots also have those flags false.

Do not enable crawling, copy third-party product media, set stock available, assign a resale price, publish a product, or generate a checkout offer until a supplier feed/API permission or written authorization and its evidence URL are recorded. A public page URL is not a resale agreement.

## Main ResoFit commerce boundary

The main project's 58 existing Jumia `commerce_offers` remain discovery-only with unknown availability and unverified stock. Its 58 Jumia `supplier_products` remain resale-pending with stock quantity zero. The 18 newly staged Edge Node candidates have not been mirrored to these main-project tables.

The live deployed `catalog-public/search` function v51 has not yet received this PR's new generic eligibility metadata response/filter. This PR's branch adds a fail-closed filter for discovery-only offers and requires external offers to have enabled source, available stock, a positive price, verified direct product URL, verified checkout flow and verified stock evidence. The smoke workflow validates those properties after deployment.

The existing `paystack-init` remains the ResoFit first-party checkout authority. Elite101 creator services retain their separate Elite Media checkout. Do not imply that Jumia Express, pickup, COD, delivery, warranty or returns have been integrated.

## Elite101 product-fit collections

- **Highlight Launch Pack:** phone stand, ring light, microphone and short-form recording kit.
- **Creator Starter:** AY-49G / AY-49 vlogging kit, tripod, phone holder and fill light.
- **Creator Pro:** dual wireless microphones, RGB lighting, tracking tripod and gimbal.
- **Agency Workspace / Agency Production:** higher-grade audio, lighting, tripods, teleprompter and studio accessories.
- **ResoFlex Home Gym:** resistance bands, yoga mats, rollers and dumbbells paired with published ResoFit digital plans.

These are collection merchandising mappings, not published product offers. External candidates remain unpriced in the customer-facing collection until registry evidence and fulfilment are complete.

## Release gates

1. Review and merge PR #83 only after CI and Vercel checks pass.
2. Deploy the Edge Node function to project `xtgteviwtoupbfvorrmk` and apply the main-project route/catalog migration to `vbqjvmnhdtdhmeeudqnn`.
3. Run the authenticated complete-registry export and generic public-search/collection smoke tests.
4. Obtain authorized supplier feeds or written resale/collection permission for each external source.
5. Reconcile direct page, seller, variant, current price, stock, delivery, pickup, COD, return and warranty evidence per product.
6. Mirror only verified, approved candidates into the main ResoFit catalogue and canonical hybrid collection manifests.
7. Publish the manifests only after checkout and fulfilment contracts are smoke-tested.

