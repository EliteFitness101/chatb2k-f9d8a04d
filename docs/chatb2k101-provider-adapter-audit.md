# ChatB2K101 provider adapter audit — 7 November 2026

**Scope:** source inspection and repository-only remediation. No production function, webhook, Vault secret, provider configuration, database schema, queued task, or customer message was changed.

## Live Edge Function source findings

| Function | Deployed version observed | Source finding | Current conclusion |
|---|---:|---|---|
| `chatb2k-live-assistant` | v10 | Response helper recursively calls itself; request body uses non-standard `req.respond()`; Gemini response uses non-standard `response.respond()`. | Source-confirmed defect. Runtime failure not independently probed in this audit. |
| `resend-webhook` | v20 | Svix HMAC-SHA256 signature verification and timestamp tolerance are present. | Handler is signature-aware; webhook remains disabled per prior provider configuration audit, so delivery callbacks are not proven active. |
| `whatsapp-webhook` | v25 | GET challenge uses the configured verify token; POST parses and persists payloads without validating Meta `X-Hub-Signature-256`. | Critical authenticity gap in deployed source. Do not treat inbound events as trusted until signature validation is implemented and tested. |
| `telegram-master-webhook` | v6 | Managed child webhook validates `X-Telegram-Bot-Api-Secret-Token` and deduplicates `update_id` in its child update ledger. | Child webhook path has source-level verification; master route and live bot delivery still require an end-to-end proof. |

## Repository patch in this PR

Added `supabase/functions/chatb2k-live-assistant/index.ts` from the deployed v10 source with the request/response defects corrected:

- Response helper now returns the shared JSON response helper instead of recursively calling itself.
- Request parsing uses `await req.json()` with invalid-body handling.
- Gemini response parsing uses `await response.json()`.
- Error responses no longer return raw exception details to the visitor; server-side logging retains the error object.
- Existing origin allowlist, rate-limit behavior, persona selection, Gemini model selection, and response contract are retained.

This is repository source only. It has not been deployed or invoked against production.

## Remaining adapter gates

1. **Meta WhatsApp:** implement raw-body HMAC-SHA256 validation against the Meta app secret before JSON parsing; compare signatures in constant time; reject missing/invalid signatures; retain GET challenge verification. Confirm the configured app secret and WABA/phone-number identity through authorized provider configuration without exposing secret values.
2. **Resend:** preserve Svix verification; verify webhook endpoint is enabled and correlated receipts are arriving before calling email delivery complete.
3. **Telegram:** preserve master and child secret-token checks; prove a controlled inbound update and outbound message receipt. Do not confuse social publishing acknowledgements with customer support messages.
4. **Twilio:** no activation until account ownership, credentials, sender/service identity, signature verification and status callback are independently verified.
5. **Outbox:** do not connect live workers to the new outbox until the additive migration is applied and tested in an isolated clone, and the ChatB2K101 authorization decision contract is enforced by the actual dispatcher.
6. **Backlog:** do not replay the existing 61 queued follow-up tasks until provider identity, consent, idempotency, suppression, and delivery receipts pass controlled tests.

## Verification boundary

- Source-level inspection: completed for the four functions above.
- Repository patch: committed to the existing draft PR branch.
- Deno typecheck/unit tests: not run in this environment.
- Migration execution / disposable schema test: not run.
- Production deployment / webhook activation / outbound message: not performed.
- Actual Meta Business Account and phone-number linkage: not proven.
- Twilio account/sender linkage: not proven.

**Release status:** development patch only; not production-ready evidence.
