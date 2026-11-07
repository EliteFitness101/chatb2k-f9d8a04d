# Meta WhatsApp webhook signature hardening

**Date:** 7 November 2026  
**Scope:** repository-only patch based on the deployed `whatsapp-webhook` v25 source and a live Vault secret-name inventory.

## Findings

The deployed handler verified the GET subscription challenge using `whatsapp_verify_token`, but accepted POST bodies without checking Meta's `X-Hub-Signature-256`. That allowed unauthenticated callers to submit payloads to the webhook event table.

The inspected `vault.decrypted_secrets` name inventory contained `whatsapp_verify_token`, but no Meta/WhatsApp app-secret entry. Secret values were not queried or exposed.

## Patch

Added `supabase/functions/whatsapp-webhook/index.ts` with these controls:

1. Reads the raw POST body before JSON parsing.
2. Requires the `X-Hub-Signature-256` header in `sha256=<64 hex chars>` form.
3. Computes HMAC-SHA256 using the Edge Function environment secret `META_APP_SECRET`.
4. Compares the full signature using a constant-time character comparison after format and length checks.
5. Fails closed with HTTP 503 if `META_APP_SECRET` is not configured, and HTTP 401 for missing/invalid signatures.
6. Parses and persists the payload only after signature validation.
7. Retains GET challenge verification through the existing `whatsapp_verify_token` Vault secret.
8. Rejects request bodies larger than 2 MB and avoids returning internal exception details.

## Required deployment configuration and rollout

- Provision `META_APP_SECRET` through the Supabase Edge Function secret manager. Do not put the value in Git, SQL, logs, or client code.
- Confirm the value belongs to the Meta App connected to the intended WhatsApp Business Account and phone number.
- Run Deno formatting, typecheck, and unit tests, including a known HMAC-SHA256 test vector and cases for missing, malformed, incorrect, and valid signatures.
- Deploy to a non-production environment first.
- Verify Meta challenge handshake and one controlled signed webhook; verify an unsigned or tampered payload receives 401 and creates no database row.
- Only after approval, deploy to production and configure/verify the Meta callback URL and subscribed fields.
- Correlate authenticated inbound messages and provider status callbacks to canonical customer identity and `resofit_events`; do not treat a webhook acceptance response as proof of customer delivery.

## Evidence boundary

- Deployed v25 source inspection: completed.
- Vault secret-name inventory: no Meta app-secret entry found; values not exposed.
- Repository implementation: committed to PR #98 branch.
- Deno tests/typecheck: not run.
- Secret provisioning: not performed.
- Meta app/WABA/phone-number ownership: not independently verified.
- Production deployment or callback activation: not performed.
