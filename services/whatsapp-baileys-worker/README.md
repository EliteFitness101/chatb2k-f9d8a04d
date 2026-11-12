# ResoFit persistent WhatsApp worker

This service is a separate, persistent Node.js process. It does not replace or modify the existing Supabase Edge Function `whatsapp-baileys-dispatch` (active version 2).

## Railway service setup

1. Create a Railway service from this repository and set the **Root Directory** to `/services/whatsapp-baileys-worker`.
2. Use the included Dockerfile.
3. Add a Railway Volume mounted at `/data`. The Baileys multi-file auth state and SQLite idempotency database are stored there; do not deploy without persistent storage.
4. Set these variables in Railway:
   - `PORT=3000`
   - `WORKER_API_KEY`: the exact secret currently stored in Supabase Vault as `whatsapp_baileys_api_key`. Do not paste the value into GitHub.
   - `ADMIN_TOKEN`: a different, high-entropy secret for the pairing-code endpoint.
   - `SUPABASE_CALLBACK_URL=https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/whatsapp-baileys-dispatch`
   - `AUTH_DIR=/data/auth`
   - `DATABASE_PATH=/data/worker.sqlite`
   - `ALLOWED_DESTINATIONS`: JSON object mapping each approved `social_destinations.id` to its exact WhatsApp JID, e.g. `{"approved-destination-uuid":"1234567890@s.whatsapp.net"}`. Only enter destination IDs/JIDs verified against the existing database; do not guess them.
   - `ALLOWED_MEDIA_HOSTS=media.resofit.fit` (comma-separated exact HTTPS hostnames only).
   - Optionally `MAX_MEDIA_BYTES=16777216`.
5. Do **not** update Supabase Vault to a Railway URL yet. First deploy and verify this worker independently.

## Link the WhatsApp session

After Railway deploys, request a pairing code from an authenticated admin client:

- `POST /admin/pairing-code`
- Header: `Authorization: Bearer <ADMIN_TOKEN>`
- JSON body: `{"phone_number":"<international digits, no plus sign>"}`

Enter the returned code in WhatsApp > Linked devices. Never publish the pairing code or session files. Check `GET /health`; it returns HTTP 200 only when the socket is connected and the session is present. Restart the service and check health again to verify the mounted volume preserves authentication.

## Job and callback contract

- `POST /jobs` accepts the adapter's authenticated `publish` payload and `x-baileys-worker-secret` header.
- The worker uses the existing allowlisted `destination_id` to select the exact JID. It does not trust a JID supplied in the request body.
- Durable SQLite idempotency prevents the same idempotency key from being sent twice by this worker.
- Only direct WhatsApp chats (`@s.whatsapp.net`) and explicit WhatsApp groups (`@g.us`) are supported. WhatsApp Status and Channels are rejected until separately implemented and verified.
- Media downloads require HTTPS, an exact hostname allowlist, supported MIME type, no redirects, and a configured size cap.
- After a send is confirmed by Baileys with a message ID, the worker POSTs an `action: "ack"` callback to the exact existing Supabase Edge Function URL. It uses the same `WORKER_API_KEY` in `x-baileys-worker-secret`, matching the current function's Vault check.
- A `published` acknowledgement is sent only when Baileys returns a message ID. A failed send is acknowledged as `failed`; a callback failure is logged without logging secrets or message contents.

## Verification gate before changing Vault or scheduling fan-out

1. Railway deployment reports healthy and the volume is mounted at `/data`.
2. `GET /health` returns HTTP 200 with `whatsapp_connected: true` and `session_present: true`.
3. Restart Railway; repeat health check to prove session persistence.
4. Verify destination IDs and JIDs against active WhatsApp rows in Supabase. Keep unsupported platform types disabled.
5. Send one explicitly approved test job to a controlled destination; verify the received message, Baileys message ID, and successful acknowledgement row in `social_publish_attempts` (and `content_publish_log` when published).
6. Only after all checks pass, update Vault `whatsapp_baileys_endpoint` to the Railway HTTPS service URL. Then test the existing adapter with one manually invoked approved item before enabling any schedule.

No production Vault value, schedule, existing Edge Function, or destination record is changed by this repository addition.
