# ResoFit ChatB2K WhatsApp Baileys bridge

Persistent Node.js service for a dedicated, authorized WhatsApp Web session. It is deliberately separate from Supabase Edge Functions: Baileys needs a persistent process and durable authentication state.

## Current delivery scope

- Authenticated health/status and send endpoints.
- Durable session state at `/data/whatsapp-auth` (mount a persistent volume there).
- Named destination allowlist from `WHATSAPP_DESTINATIONS`; no arbitrary JID posting.
- Text/link-preview posts and image-with-caption posts from an HTTPS media-host allowlist.
- Automatic reconnect unless the WhatsApp account logs out.
- No credentials or session keys are committed to this repository.

**Not production-active until a host is deployed, the volume and secrets are configured, the owner scans the pairing QR, and each destination is verified.** A successful API response confirms WhatsApp accepted a send request; it does not prove that every recipient received or viewed the message.

## Required environment

- `WHATSAPP_BRIDGE_TOKEN`: random, high-entropy API token.
- `WHATSAPP_AUTH_DIR`: persistent path; default `/data/whatsapp-auth`.
- `WHATSAPP_DESTINATIONS`: JSON object keyed by internal destination name. Example structure (replace placeholders only after resolving destinations):
  ```json
  {
    "resofit_general_1": { "type": "group", "jid": "REPLACE_WITH_VERIFIED_GROUP_JID" },
    "resofit_general_2": { "type": "group", "jid": "REPLACE_WITH_VERIFIED_GROUP_JID" },
    "resofit_general_3": { "type": "group", "jid": "REPLACE_WITH_VERIFIED_GROUP_JID" },
    "elite_ng_bigo": { "type": "group", "jid": "REPLACE_WITH_VERIFIED_GROUP_JID" },
    "resofit_channel_1": { "type": "channel", "jid": "REPLACE_WITH_VERIFIED_CHANNEL_JID" },
    "resofit_channel_2": { "type": "channel", "jid": "REPLACE_WITH_VERIFIED_CHANNEL_JID" }
  }
  ```
- `MEDIA_HOST_ALLOWLIST`: comma-separated hosts allowed for image assets. Default: `media.resofit.fit`.
- `PORT`: hosting platform port (defaults to 8080).

Never place the WhatsApp auth directory, pairing QR, API token, or database service-role key in logs, source control, or a public endpoint.

## Endpoints

- `GET /health`: minimal liveness and session state.
- `GET /v1/status`: requires `Authorization: Bearer $WHATSAPP_BRIDGE_TOKEN`; reports named destination configuration without exposing JIDs.
- `POST /v1/send`: requires the same bearer token. JSON: `{"destination":"resofit_general_1","text":"Approved post","imageUrl":"https://media.resofit.fit/approved-cover.webp"}`. `imageUrl` is optional and must use an allowlisted HTTPS host.

## Deploy

Deploy this folder as a Docker service on a persistent Node host (Railway configuration is included). Attach a durable volume mounted at `/data`, set the environment variables, then inspect deployment logs and scan the pairing QR with the intended ResoFit WhatsApp account. Do not enable scheduled fan-out until the session is connected and each target is resolved to a verified JID with posting rights.

## WhatsApp Channel compatibility

WhatsApp groups and Channels are not interchangeable. Baileys support for channel/newsletter publishing can vary by library version and WhatsApp server behavior. The configured `channel` destination type is not proof of channel-post support. Verify each Channel with a controlled owner-approved test before adding it to automated fan-out. If the installed Baileys version cannot publish to a Channel, keep that destination disabled and use an officially supported channel publishing path rather than falsely reporting it as live.

## Production rollout checklist

1. Deploy the service and persistent volume.
2. Configure secrets out of band and pair the authorized account.
3. Resolve and verify each group/channel identifier; confirm admin/post permissions.
4. Test one low-risk message in an owner-controlled destination and record the message ID.
5. Add the bridge URL and token to a server-side dispatch worker only after tests pass.
6. Enable idempotent queue fan-out with retry/backoff and a publish log; do not blindly replay sends after ambiguous timeouts.
7. Keep general ResoFit content separate from Elite NG/BIGO host content.
