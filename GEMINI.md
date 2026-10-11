# ChatB2K / ResoFit Ecosystem Instructions

## Role
This repository is the ChatB2K automation and orchestration workspace. Treat repository instructions as context, not as proof of live access or permission.

## Canonical Brand and Routing
- Canonical public production domain: https://www.resofit.fit
- Do not substitute preview, lovable.app, or vercel.app URLs for canonical production URLs.
- Visual direction: matte obsidian black, restrained champagne-gold accents, and glassmorphism.
- Preserve existing workflows and production routes. Audit first; prefer additive, minimal patches.

## Ecosystem Ownership
- ChatB2K: orchestration, ingestion, enrichment, attribution, and automation.
- ResoFit / ResoFlex: wellness products and services.
- Martial-X / RedZone: specialized training and combat conditioning.
- shopb2k is the main ecosystem experience/control repository; resocatalog is the canonical SKU/pricing authority; reso-dash is the trainer dashboard/PWA.
- Commerce systems own price, payment, fulfillment, and entitlement truth. Do not duplicate checkout or entitlement engines.
- Preserve rsid, session, and UTM attribution when data moves between systems.

## Canonical Integrations
- Supabase project ref: vbqjvmnhdtdhmeeudqnn (resonance-fitness). The BIGO workflow targets its bigo-live-pipeline edge function.
- BIGO capture/archive workflow: .github/workflows/bigo-live-automation.yml.
- Dropbox is intended as the canonical BIGO media archive. Do not add a Vercel Blob fallback unless explicitly approved.
- Existing Dropbox-related workflows may refresh OAuth credentials and test shared links/archive writes. Verify actual run results before asserting storage health.
- Gemini is used by existing Supabase edge functions through their deployed environment. A Gemini API key in Supabase does not imply a GitHub Actions secret or local Gemini CLI login.
- Treat Vercel, Neon, Make.com, n8n, Cloudflare, Google Drive, and other integrations as unverified unless current evidence demonstrates their use and health.

## Security and Credential Rules
- Never print, commit, or place API keys, refresh tokens, cookies, personal data, or service-role credentials in logs, prompts, artifacts, or source files.
- Use GitHub Actions secrets for CI credentials, with least privilege.
- Do not expose or echo secret values. Secret names and timestamps alone do not prove credentials are valid.
- Prefer GitHub Actions OIDC for supported service-to-service access; verify the trust policy and actual authenticated request.
- A successful workflow or prompt does not prove end-to-end sync, successful publishing, or production health.

## BIGO Pipeline Guardrails
- Keep source allowlists and verified-host publish gating distinct.
- Storage-only media must not be auto-published.
- Require a verified Dropbox upload and valid HTTPS media reference before downstream ingestion.
- Never report a host as captured or uploaded based solely on a scheduled workflow starting.
- Check actual upload response, destination path, byte size, and downstream ingestion response.

## Gemini / MCP
- GEMINI.md provides repository context only. It does not configure Gemini mobile/desktop apps, local MCP settings, OAuth sessions, or service permissions.
- Configure Gemini CLI and MCP servers separately using current official client/provider documentation.
- Automated repository audits should be read-only. Any schema or infrastructure writes require explicit authorization, idempotency, backups, and post-write verification.

## Change and Evidence Protocol
1. Audit existing workflows, scripts, secrets references, deployed function configuration, and recent run evidence.
2. Apply the smallest additive patch; do not delete or rename production resources without authorization.
3. Verify file read-back, workflow execution, and each integration independently.
4. Report the source, timestamp, scope, result, and blockers. Separate repository evidence from runtime/production evidence.
