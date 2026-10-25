# ResoFit Agent and DevOps Operating Contract

Before changing this repository or any connected ResoFit/ChatB2K system, read this file and `docs/ops/ECOSYSTEM_OPERATING_CONTRACT.md`.

## Required workflow

1. **Observe** the live state and the current source-of-truth records.
2. **Verify** the exact repository, branch, deployment, domain, route, binding, environment variable name, and dependent service before mutation.
3. **Execute** the smallest additive patch that preserves existing capture, commerce, attribution, and publishing flows.
4. **Verify** build, automated checks, live routes, data writes, and downstream reads independently.
5. **Recover** with an evidence-backed rollback or retry plan if a step fails.
6. **Learn and care** by updating the audit record, source registry, event contracts, runbook, and next-action owner.

## Non-negotiable safeguards

- Never claim production active, fixed, synced, published, or verified without current execution evidence.
- Never add hardcoded secrets, require a new secret without checking existing job configuration, or echo secret values.
- Do not replace a working pipeline wholesale or make Dropbox a prerequisite for BIGO capture.
- Preserve all discovered host IDs and capture the full eligible set; do not cap a production host inventory to an arbitrary sample.
- Keep independent publisher organizations/channels isolated: a failure or rate limit for one must not disable other publishers.
- Preserve RSID, session, UTM, product, campaign, and source attribution across redirects and events.
- Use `https://www.resofit.fit` as the canonical public website. API direction is `https://resofit.fit/api/`. The media delivery hostname is `https://media.resofit.fit`; the upload API hostname is `https://upload.resofit.fit`. Verify routing and DNS before describing any endpoint as live.
- Do not use `app.resofit.fit` or preview hostnames as canonical production origins.
- Treat external provider connection, channel IDs, and organization IDs as verified only when returned by the provider or current registry.
- Update records in the existing registry and event contracts rather than creating a parallel source of truth.

## Status vocabulary

- **A — VERIFIED PRODUCTION:** live execution and expected result independently observed.
- **B — EXECUTION UNPROVEN:** source/config exists, but live execution is not verified.
- **C — DEVELOPMENT:** code or configuration is present only in a development or unmerged branch.
- **D — INTEGRATION NOT PROVEN:** one or more external dependencies or downstream steps are unverified.
- **E — CURRENT FAILURE:** a current reproducible failure or failed execution is evidenced.

Every audit entry must include timestamp, owner, repository, branch/commit, deployment, domain/route, dependency, evidence level, result, next action, and recovery plan. Never promote a status without new evidence.
