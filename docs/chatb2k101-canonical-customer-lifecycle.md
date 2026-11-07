# ChatB2K101 canonical customer lifecycle and delivery governance

**Status:** Proposed additive implementation; not applied to production.  
**Canonical Supabase project:** `resonance-fitness` / `vbqjvmnhdtdhmeeudqnn`.  
**Control plane:** ChatB2K101.  
**Existing orchestrator baseline:** deployed `chatb2k-orchestrator` v48.  
**No production deployment, data rewrite, provider message or credential mutation is included in this PR.**

## 1. Source-of-truth ownership

This proposal consolidates orchestration without replacing existing domain records.

| Domain | Canonical record | Rule |
| --- | --- | --- |
| Customer | `auth.users.id`, surfaced through `resofit_ecosystem_identity.auth_user_id` | One authenticated customer identity. Preserve anonymous RSID/session until verified account linking. |
| Provider identity | `resofit_ecosystem_identity_links` (new) | One verified provider subject hash maps to at most one canonical customer. Never store raw provider IDs, phone numbers or email addresses. |
| SKU/product | `public.products` | Existing unique non-null SKU index remains authoritative. External commerce IDs are aliases, not new SKUs. |
| Generation job | `digital_product_factory_jobs` | Existing generator job and asset registry remain authoritative for generation. |
| Paid delivery job | `digital_product_delivery_jobs` | Existing unique (payment_id, product_sku) constraint remains authoritative for paid digital delivery. |
| Entitlement | `resofit_entitlement_states` + `resofit_entitlement_events` | Existing unique (user_id, entitlement_key, source_product) remains authoritative. |
| Domain event | `resofit_events` | Canonical append-only event history with its existing unique idempotency key. |
| Journey | `customer_journeys` | Existing unique (user_id, program) state remains authoritative. |
| Outbound command | `chatb2k_delivery_outbox` (new) | One idempotent delivery command per requested communication; not a second event ledger or customer store. |

## 2. ChatB2K101 execution contract

1. A trusted source emits a domain event into `resofit_events` with a stable `idempotency_key` and `correlation_id`.
2. ChatB2K101 resolves the canonical customer, product SKU, job and entitlement references. Ambiguous identity matches are quarantined; no fuzzy auto-merge.
3. The relevant worker performs only its registered task (generation, delivery, onboarding, email, Meta WhatsApp, Telegram or SMS).
4. ChatB2K101 evaluates authority, evidence freshness, risk, consent, dependencies and the global kill switch before creating an approved outbox item.
5. A provider adapter leases an approved outbox item, resolves the destination from a verified identity/contact record, dispatches once per idempotency key, and stores the provider message ID.
6. Provider callbacks append delivery outcomes to `resofit_events` and update the corresponding outbox receipt state. A provider HTTP 200/accepted response is not a delivered receipt.
7. Retries use the same idempotency key; dead-letter items require a governed recovery decision. No bulk replay of the existing customer follow-up backlog is authorized by this proposal.

## 3. Provider adapter contract

| Provider | Required verification before activation |
| --- | --- |
| Resend | Verify sender/domain, re-enable the signed webhook, validate Svix signatures, persist sent/delivered/bounced/complained events, and correlate by provider message ID. |
| Meta WhatsApp Cloud API | Verify webhook challenge and `X-Hub-Signature-256`; resolve WABA/phone-number ID; verify inbound user identity and opt-in before marketing or follow-up dispatch. |
| Telegram | Bind bot token to the registered bot identity; verify webhook secret; store update ID as idempotency key; prove inbound update and outbound message receipt. |
| Twilio | Do not activate until account ownership, credential presence, sender/service identity, signature validation and status callback are verified. |
| Baileys adapter | Keep separate from Meta Cloud API. Do not treat a Baileys publish acknowledgement as proof that the Meta business assistant is connected. |

No provider token, phone number, email address or raw chat identifier belongs in source control or the outbox payload.

## 4. Safety and data rules

- The new identity-link and outbox tables are service-role-only with RLS enabled and no client-role grants.
- Marketing dispatch requires a fresh verified consent check at dispatch time; `consent_status` is a recorded decision, not a substitute for checking the current source of consent/opt-out.
- A delivery command cannot enter leased/accepted/delivered state unless ChatB2K101 has approved it with a decision reference and timestamp.
- Provider callbacks are authenticated and deduplicated before they can alter state.
- `resofit_events` remains the canonical delivery-event ledger. Provider-specific callbacks are normalized into it.
- `digital_product_factory_jobs`, `digital_product_delivery_jobs` and `chatb2k_automation_tasks` remain existing domain/worker queues; do not copy their rows into a second job master.
- Existing queued WhatsApp tasks must remain untouched until destination, consent, deduplication and provider receipt paths are verified.

## 5. Rollout gates

### Gate A — schema review
- Review this additive migration against the canonical project.
- Confirm the migration is recorded in the repository and matches the live migration sequence.
- Run Supabase security and performance advisors.

### Gate B — adapter integration
- Update ChatB2K101 and provider adapters to use the outbox.
- Reconcile current Resend, Meta WhatsApp, Telegram and Twilio provider registry entries.
- Correct and test the existing live assistant handler before connecting it to customer dispatch.

### Gate C — controlled end-to-end proof
- Use a controlled test customer and zero-value/test-mode transaction.
- Prove one event, one SKU, one job, one entitlement, one delivery command and one provider receipt.
- Verify retries are idempotent and opt-out/kill-switch suppress dispatch.
- No production rollout until the test and owner review are complete.

## 6. Explicit non-goals

- No production SQL application or schema mutation in this PR.
- No direct changes to the deployed v48 orchestrator, Edge Functions, Vercel/Cloudflare deployment, provider webhook settings or Vault secrets.
- No reactivation of the disabled Resend webhook.
- No Twilio setup or WhatsApp business-number reassignment.
- No replay of the 61 queued WhatsApp follow-up tasks.
- No merge of the existing Omni-State PR #33 as-is; its source baseline is older than deployed orchestrator v48 and must be reconciled separately.

## 7. Acceptance criteria

- [ ] Migration applies cleanly to a disposable copy of the canonical schema.
- [ ] Existing customer, SKU, job, entitlement and event records remain unchanged.
- [ ] RLS and grants are verified; no anon/authenticated access to new tables.
- [ ] Duplicate provider identity subject and duplicate delivery idempotency key are rejected.
- [ ] Outbox refuses dispatch without a ChatB2K101 authorization decision.
- [ ] Marketing dispatch refuses unknown/revoked consent at send time.
- [ ] Provider callback updates are signature-verified and idempotent.
- [ ] One controlled lifecycle test has matching IDs across payment, event, SKU, job, entitlement, outbox and provider receipt.
- [ ] No production deployment until explicit release approval.
