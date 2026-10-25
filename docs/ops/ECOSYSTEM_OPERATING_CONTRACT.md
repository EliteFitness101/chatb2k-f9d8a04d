# ResoFit / ChatB2K Ecosystem Operating Contract

This contract applies to every agent, developer, and DevOps run touching this repository or a connected ResoFit service. It is a coordination rule, not evidence of production readiness.

## Required workflow
1. Observe the current production state and source-of-truth records.
2. Verify exact repo, branch/commit, deployment, domain, route, binding, secrets-by-name, and downstream dependencies.
3. Make the smallest additive patch; preserve existing capture, commerce, attribution, and publishing flows.
4. Verify build, tests, live route, data write, and downstream read separately.
5. Recover with an evidence-backed rollback/retry plan.
6. Update existing audit, source registry, event contract, and next-action records.

## Canonical map
- Storefront: `EliteFitness101/shopb2k`
- ChatB2K app: `EliteFitness101/chatb2k-f9d8a04d`
- CEO dashboard: `EliteFitness101/reso-dash`
- Elite NG: `EliteFitness101/elite101`
- Canonical website: `https://www.resofit.fit`
- API direction: `https://resofit.fit/api/`
- Media delivery: `https://media.resofit.fit`
- Media upload: `https://upload.resofit.fit`
- Primary media R2 bucket: `resofit-cdn`; Worker binding expected as `MEDIA_BUCKET`

## Non-negotiable safeguards
- Never mark a route, upload, deployment, publication, payment, or integration fixed/live without current execution evidence.
- Never hardcode or echo secret values; reuse existing configured secrets only after verifying their purpose.
- Do not make Dropbox a prerequisite for BIGO capture. Preserve all discovered eligible host IDs; do not cap production host inventories to arbitrary samples.
- Keep publisher targets isolated by provider, organization ID, channel ID, capabilities, and rate-limit state. A failure on one target must not stop unrelated targets.
- Preserve RSID, session, UTM, campaign, product, and source attribution across internal/external links and events.
- Use the existing ecosystem source registry, event contracts, agent registry, control plane, and automation records. Search before creating a parallel source of truth.
- Respect kill switches, approval gates, rights/QA checks, idempotency, bounded retries, and per-target audit results.
- Video autoplay must be muted; unmute only after user interaction. Set volume to 33% only after explicit interaction.
- Never promote an unmerged branch or preview URL to canonical production.

## Evidence labels
- A — VERIFIED PRODUCTION: current live execution and expected result independently observed.
- B — EXECUTION UNPROVEN: source/config exists but live behavior is not verified.
- C — DEVELOPMENT: unmerged or development-only.
- D — INTEGRATION NOT PROVEN: external dependency or downstream step is unverified.
- E — CURRENT FAILURE: current reproducible failure or failed execution is evidenced.

Each audit record must include timestamp, owner, repository, branch/commit, deployment, route/service, action, status, evidence URI/level, error, next action, and recovery plan.

## Current known blockers (2026-10-25)
- Cloudflare Worker deployment in `EliteFitness101/shopb2k` failed with `No access to the specified service` (GitHub Actions run 40155343154).
- Product smoke test found 20 of 65 tested URLs returning 404 (run 40155343151).
- BIGO highlight rows inspected in Supabase still point to Dropbox; recent R2 URL metadata is null. Nine capture jobs were queued with stale September 28 discovery timestamps.
- The existing `chatb2k-publishing-router` is active at v14 but selects exactly one approved provider route; it does not prove multi-organization fan-out.
- Buffer API rate limiting is evidenced. Recent Telegram publications succeeded; preserve that working route.
- `social-publisher` had repeated HTTP 500 responses during the last-day log window; inspect per-target failures before retrying.
- Do not mark these blockers fixed until each is rerun and independently verified.

## Publisher router contract
Required capabilities: list/verify, get, select, enqueue, schedule, publish, sync status, archive, retry, and audit. Before dispatch, verify the target is active, connected, permitted for the media type, within rate limits, and bound to the correct organization. Use per-target idempotency and independent circuit breakers. Record every target result independently; do not infer a publish from queue acceptance.

## Media upload contract
`POST https://upload.resofit.fit/api/ingest-media?key=<object-key>` accepts authenticated raw bytes in `public/<path>` or `chatb2k/<path>`. It must reject invalid credentials, unsupported media types, unsafe keys, and oversized files. Verify a successful R2 write and then independently GET the resulting CDN URL. Do not fetch arbitrary caller-provided remote URLs from the Worker; capture jobs should stream/download the chosen source and upload the bytes.

## Required post-merge verification
Verify Worker route and binding, authenticated upload/readback, full BIGO host inventory and recent capture, R2 object existence and CDN delivery, all 65 product routes, publisher organization/channel isolation, and sync state in the existing registries. Record results with timestamps and evidence.