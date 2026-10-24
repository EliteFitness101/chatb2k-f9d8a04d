# ChatB2K WhatsApp Baileys publisher

This is a long-running Node service, not a Supabase Edge Function. Deploy on a persistent Node host with a writable volume mounted at /data and restart-on-failure enabled.

Required environment:
- PUBLISHER_API_KEY: strong private bearer secret.
- BAILEYS_SESSION_DIR=/data/auth: persistent linked-device session.
- WHATSAPP_DESTINATIONS_JSON: JSON object mapping destination IDs to { "type": "group|channel|direct", "jid": "...", "label": "..." }.
- PORT: platform-provided HTTP port.

Do not commit session files, QR codes or secrets. Pair the service by scanning the QR shown in protected logs from WhatsApp > Linked devices. Never share the QR or logs publicly.

Endpoints:
- GET /healthz: process health.
- GET /readyz: session connectivity.
- GET /v1/status: bearer-authenticated session and destination status.
- POST /v1/publish: bearer-authenticated { "destination_id":"resofit-channel-1", "text":"...", "image_url":"https://.../cover.webp", "fallback_url":"https://www.resofit.fit/...", "idempotency_key":"queue-id:destination-id" }.

HTTP 202 means the connected session accepted the send, not that recipients viewed it. Channel sends are never silently downgraded to group sends. The installed Baileys build must expose newsletterSendMessage; if not, the channel send returns an explicit unsupported error. Verify each channel JID and permission with a controlled test before enabling scheduled fan-out.

Deployment sequence: deploy to a persistent Node host, configure environment and disk, pair the linked device, verify /readyz, test one operator-controlled destination, then connect the internal ChatB2K fan-out worker using secrets, idempotency keys, bounded retries and delivery logging. Telegram remains an independent fan-out path.

Baileys is an unofficial WhatsApp Web client and may break when WhatsApp changes. Monitor disconnects, keep the library updated, and avoid unsolicited bulk private messages. Respect opt-outs and route only to intended destinations.
