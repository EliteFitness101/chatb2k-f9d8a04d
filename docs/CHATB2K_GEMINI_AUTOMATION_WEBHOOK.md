# ChatB2K Gemini Automation Webhook

Endpoint: https://xtgteviwtoupbfvorrmk.supabase.co/functions/v1/chatb2k-gemini-automation-webhook

Deployed on the ResoFlex Edge Node as Edge Function v2. The endpoint accepts only allowlisted ResoFit funnel, assessment, checkout, application and commerce events. It stores idempotency state on the Edge Node and forwards accepted events to the canonical main Supabase event-ingestion function.

Before production use, configure a dedicated secret named CHATB2K_GEMINI_WEBHOOK_SECRET in the ResoFlex Edge Node Supabase Edge Function secrets, or store it in Vault as chatb2k_gemini_automation_api_key. Do not reuse the Gemini inference API key. The function fails closed if no secret is configured.

Verification required: unauthorized request returns 401; valid event receives a successful main-ingestion response; duplicate idempotency key replays safely; Edge Node row and main event are both visible; no credentials appear in logs.
