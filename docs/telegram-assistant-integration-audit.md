# Telegram → ChatB2K live-assistant integration audit

**Audit date:** 7 November 2026  
**Environment:** Supabase project `resonance-fitness` (`vbqjvmnhdtdhmeeudqnn`)  
**Scope:** read-only inspection of deployed Edge Function source, public table schema/counts, and Vault secret names. No secret values read.

## Verified current state

### Telegram master webhook

- Deployed Edge Function: `telegram-master-webhook` v6 (deployment version previously observed; source retrieved for this audit).
- Master webhook authenticates inbound POST requests with `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_MASTER_WEBHOOK_SECRET`.
- Managed child-bot webhook requests resolve a per-bot webhook secret and use the same Telegram header.
- Constant-time comparison is implemented for the shared webhook tokens.
- Telegram update IDs are persisted to `telegram_master_webhook_updates` and `telegram_child_webhook_updates`, with duplicate primary-key conflicts acknowledged as duplicates.
- Current master handler responds to `/start`, `/provision`, and the provisioning callback. Ordinary text messages are not forwarded to the ChatB2K live assistant.
- The inspected source does not write inbound Telegram events to `resofit_events` or use the proposed `chatb2k_delivery_outbox`.

### Live data evidence

- `telegram_master_webhook_updates`: 0 rows at audit time.
- `telegram_child_webhook_updates`: 0 rows at audit time.
- Vault secret-name inventory includes `TELEGRAM_MASTER_WEBHOOK_SECRET` and seven Telegram bot-token references. Secret values were not accessed.
- Zero rows do not prove the webhook is disconnected; they only establish that these ledgers were empty at query time.

### ChatB2K assistant dependency

- The currently deployed `chatb2k-live-assistant` source was retrieved.
- Its handler contains invalid recursive response wiring and invalid request/response method calls (`req.respond()`, recursive `respond()`, and `response.respond()`).
- A corrected assistant source is already proposed on PR #98, but has not been deployed or runtime-tested.
- Telegram should not be wired to this deployed assistant until the corrected assistant contract is tested and released through the approved path.

## Next implementation sequence

1. Validate and release the corrected `chatb2k-live-assistant` independently, including an authenticated server-to-server invocation contract for Telegram.
2. Extend the master Telegram handler so ordinary text messages can call that internal contract; preserve the existing webhook secret validation and update-ID idempotency.
3. Persist a minimal canonical inbound event with a stable idempotency key and correlation/session identifiers; avoid duplicating raw Telegram payloads into multiple event ledgers.
4. Persist and retrieve bounded per-chat conversation history using a privacy-conscious mapping; do not assume Telegram chat IDs are canonical ResoFit customer IDs.
5. Send the assistant reply through the correct bot token, and record the outbound provider message ID and provider status. Do not equate Telegram API acceptance with user delivery.
6. Add tests for invalid webhook tokens, duplicate update IDs, non-text updates, assistant timeout/provider errors, history bounds, and successful reply dispatch.
7. Verify with a controlled test chat in a non-production environment before any production webhook change.

## Evidence boundary

- Deployed source inspection: completed.
- Live table schema and row counts: queried.
- Vault secret-name inventory: queried without exposing values.
- Telegram assistant relay implementation: not started; deployed assistant dependency is currently unsafe to rely on.
- Telegram Bot API status endpoint: not invoked; no outbound messages sent.
- Production configuration, secrets, webhook registration, and deployment: unchanged.


## Follow-on implementation — internal assistant authentication

**Commit:** `16905adfe7053ab53d844178eb147ebdcded80c6`

Updated `supabase/functions/chatb2k-live-assistant/index.ts` on this PR branch:

- Added an internal server-to-server route authenticated by `x-chatb2k-internal-token`, compared in constant time against the Edge Function secret `CHATB2K_INTERNAL_TOKEN`.
- Internal requests are accepted without a browser Origin only when the configured secret matches. Browser requests retain the existing Elite origin allowlist.
- Internal requests must explicitly identify `channel: "telegram"` and provide a `conversation_id`.
- Internal rate-limit identity uses a SHA-256 hash of the Telegram conversation identifier rather than persisting the raw identifier in the existing request-log fingerprint field.
- Request bodies are capped at 24 KB and conversation history is bounded to the last eight valid user/assistant messages, each capped at 1,200 characters.
- Standard `Request.text()` and `Response.json()` handling remains in place; the previously identified invalid response-method calls are absent from the branch source.

### Configuration and evidence gates

- The live Vault name lookup returned no `CHATB2K_INTERNAL_TOKEN` entry. The value must be provisioned as a Supabase Edge Function secret; no value was created, retrieved, or exposed.
- The Telegram webhook has not yet been changed to call this route.
- No Deno typecheck, unit test, deployment, or runtime invocation was performed.
- The route is not usable by Telegram until the same high-entropy token is provisioned securely to the assistant function and Telegram master handler.


## Telegram relay implementation committed

**Commit:** `19736de4ed2eaf2d3584ec0521f4a1fe9ff80c0e`

Added a version-controlled copy of the currently deployed master webhook at `supabase/functions/telegram-master-webhook/index.ts`, then extended its ordinary text-message handling:

- Master-bot text messages now call `chatb2k-live-assistant` through the internal-token route and send the reply back through the master bot.
- Managed child-bot text messages use the same assistant route and reply through the matching child bot token.
- `/start`, `/help`, `/provision`, callback handling, existing secret-token validation, update-ID deduplication, and managed-bot provisioning logic are retained.
- Conversation identifiers are namespaced as `master:<chat_id>` or `child:<bot_id>:<chat_id>`; the assistant hashes them before request-log persistence.
- The assistant call requires `CHATB2K_INTERNAL_TOKEN` and fails closed if it is absent. No message is silently treated as AI-answered when the assistant request fails.

### Important rollout gates

- This is repository source only. The deployed Telegram master webhook has not been changed.
- The current live function's deployed source was used as the baseline; the new repository copy must be reconciled against any subsequent production edits before deployment.
- Provision `CHATB2K_INTERNAL_TOKEN` as a Supabase Edge Function secret, then deploy the assistant and Telegram functions together through an approved release.
- Run Deno format/typecheck and tests; test duplicate update IDs, invalid webhook secret, text and command routing, missing internal token, assistant timeout, Telegram send failure, and master/child bot isolation.
- Run controlled test chats in non-production before enabling the relay for production traffic.
- No outbound messages were sent by this repository change; no Telegram webhook settings, secrets, database rows, or deployments were changed.
