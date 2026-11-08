# Jumia registry reconciliation — read-only snapshot

**Observed:** 2026-11-08  
**Projects:** Edge Node `xtgteviwtoupbfvorrmk`; main commerce mirror `vbqjvmnhdtdhmeeudqnn`.  
**Mode:** Read-only. No database writes, supplier requests, crawling, publication, checkout, or rights changes were performed.

## Live counts

| Measure | Edge Node | Main mirror |
|---|---:|---:|
| Jumia rows | 67 | 67 |
| Distinct Jumia URLs | 17 | 17 |
| Category-only records | 58 | Not represented as a separate status in this query |
| Search-discovered records | 0 | Not represented as a separate status in this query |
| Rows marked publish eligible | 9 | 0 |
| Rows marked resale authorized | 67 | 20 |
| Rows with a verification timestamp | 67 | 88 total offers across all sources |

The 17 distinct Jumia URLs match exactly between the two projects. This is URL-set reconciliation only; it does not prove current price, stock, seller, variants, delivery, COD, fulfillment, authorization, or publish eligibility.

## Material governance discrepancy

The Edge Node source row for `JUMIA_NG` currently reports:
- `resale_authorized=true`
- `media_authorized=true`
- `automated_collection_authorized=true`
- `robots_policy_checked_at=null`
- `last_crawl_at=null`

Its 67 product rows report `resale_status=authorized`, while nine are marked `publish_eligible=true`. Those internal flags are not accompanied by verified supplier-side authorization evidence in this audit. They must not be treated as commercial or image-rights permission.

The main mirror reports 67 Jumia URL rows, 17 unique URLs, zero Jumia offers marked publish eligible, and 20 offers across all sources marked resale authorized. The Edge Node and main mirror therefore do not have equivalent authorization semantics.

## URL set

The Edge Node and main mirror both contain these 17 URLs:

1. https://www.jumia.com.ng/15kg-dumbbell-set-with-barbell-extension-generic-mpg8923902.html
2. https://www.jumia.com.ng/exercise-fitness-accessories/
3. https://www.jumia.com.ng/generic-11xset-resistance-bands-workout-bands-elastic-fitness-exercise-training-tubes-65769742.html
4. https://www.jumia.com.ng/generic-1pc-elastic-training-band-legs-booty-exercise-bands-fitness-resistance-band-70567031.html
5. https://www.jumia.com.ng/generic-3pcs-elastic-training-band-straps-legs-booty-exercise-bands-yoga-fitness-resistance-band-229878674.html
6. https://www.jumia.com.ng/generic-5-in-1-resistance-exercise-bandyoga-pilates-fitness-sports-404448545.html
7. https://www.jumia.com.ng/generic-adjustable-jump-skipping-rope-cable-for-adultskids-126444025.html
8. https://www.jumia.com.ng/generic-adjustable-phone-holder-stand-for-content-creation-netflix-388762336.html
9. https://www.jumia.com.ng/generic-vlogging-kitvideo-maker-kit-mictripodholder-ring-light.-242260862.html
10. https://www.jumia.com.ng/mlp-dumbbells/
11. https://www.jumia.com.ng/mlp-gym-dumbbells/
12. https://www.jumia.com.ng/mlp-resistance-band/
13. https://www.jumia.com.ng/mlp-resistant-band/
14. https://www.jumia.com.ng/mlp-sports-equipment/
15. https://www.jumia.com.ng/mlp-yoga-equipment/
16. https://www.jumia.com.ng/vlogging-kitvideo-maker-kit-mictripodholder-ring-light-generic-mpg9591483.html
17. https://www.jumia.com.ng/yoga/

## Required disposition

- Preserve all 58 legacy category-only rows as discovery snapshots.
- Keep all nine previously fetched direct-page candidates out of publication until each is reconciled to current supplier evidence and authorization.
- Treat supplier-page price, stock, seller, variants, delivery, COD and imagery as time- and destination-specific observations, not durable facts.
- Require documentary resale authorization, image/media licence, lawful collection permission, and a fulfillment arrangement before changing eligibility.
- Do not enable supplier checkout. Preserve first-party Paystack checkout and Elite101's separate checkout.
- No production registry correction is made by this document.

## Next safe work

1. Obtain documentary supplier-side authorization and review applicable collection terms/robots policy.
2. Design an additive, auditable correction plan to separate discovery state from legal authorization state.
3. Reconcile stale source observations without overwriting historical evidence.
4. Only after explicit production authorization, apply approved registry changes and verify public catalogue exclusion.
