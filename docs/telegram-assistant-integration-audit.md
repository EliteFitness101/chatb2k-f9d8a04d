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
