# ChatB2K Omni credential and infrastructure registry

## Production control plane

The canonical metadata registry is in Supabase project `vbqjvmnhdtdhmeeudqnn`. Secret values remain in their current Vault, GitHub Actions, Vercel or runtime secret stores. The registry stores only provider, secret reference/name, project/store scope, capability, consumer, node, status and evidence metadata.

The registry does not copy, decrypt, rotate, disable or synchronize secret values. It reconciles infrastructure metadata only.

## Node roles

All 25 configured nodes are mirrored as `node.chatb2k101` through `node.chatb2k125`. In particular:

- `chatb2k101`: CEO/super-admin governance boundary; never a general-purpose credential consumer.
- `chatb2k110`: Omni routing and registry reconciliation.
- `chatb2k113`: content/media intelligence; Gemini and OpenAI are declared providers.
- `chatb2k116`: wellness intelligence; Gemini and OpenAI are declared providers.
- `chatb2k123`: social distribution; Buffer and channel credentials, not Gemini video credentials.

A configured node is not proof of a live worker. Runtime status is preserved separately from manifest sync.

## Credential separation

- Main Vault `GEMINI_API_KEY`: existing provider key used by RPC-based consumers.
- Main Edge Function runtime `GEMINI_API_KEY`: separate environment reference used directly by `flow-generation-gate`, `resofit-ecosystem-autopilot`, and as the first-choice credential in `content-intelligence-enricher`; runtime value presence and identity are not verified.
- Main Edge Function runtime `GEMINI_AUTOMATION_API_KEY` and `GEMINI_API_KEY1`: separate secondary/fallback references used by `elite-media-render-worker`; runtime value presence and identity are not verified.
- Elite GitHub Actions `GEMINI_AUTOMATION_API_KEY`: secondary provider key reference passed to the media poller/render worker.
- Elite GitHub Actions `GEMINI_API_KEY1`: fallback provider key reference.
- Edge Node Vault `chatb2k_gemini_automation_api_key`: inbound webhook authentication secret, not a model key.
- Edge Node runtime `CHATB2K_GEMINI_WEBHOOK_SECRET`: preferred dedicated webhook authentication environment name.
- Edge Node runtime `GEMINI_AUTOMATION_API_KEY`: legacy webhook-auth fallback name. It is a separate project-scoped reference from the Elite GitHub Actions secret with the same name.

Secret values and key identity were not inspected. Identical environment names across different systems are not treated as proof that values are identical.

## GitHub OIDC sync

`.github/workflows/chatb2k-registry-sync.yml` runs on a 15-minute schedule, manifest changes and manual dispatch. It obtains a short-lived GitHub OIDC token with audience `chatb2k-registry-sync`. The main-project Edge Function validates issuer, audience, repository, branch and exact workflow reference before reconciling `chatb2k_infrastructure_bindings`.

No Supabase service-role key is stored in GitHub Actions for this sync. The Edge Function uses its own server-side service-role environment. Existing runtime statuses and last-verified timestamps are preserved; the sync only updates declared infrastructure metadata.

## Verification boundary

A successful sync proves that the GitHub workflow authenticated and reconciled manifest records. It does not prove that every provider credential works, that every worker is executing, or that Gemini video generation has provider capacity. Those require separate runtime canaries and execution-ledger records.
