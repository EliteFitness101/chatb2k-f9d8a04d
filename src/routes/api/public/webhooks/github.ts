import { createHmac, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

type GitHubPayload = Record<string, any>;

function signatureIsValid(raw: string, signature: string | null, secret: string) {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const supplied = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(raw).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function allowedRepositories() {
  return (process.env.GITHUB_ALLOWED_REPOSITORIES ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function summarize(event: string, payload: GitHubPayload) {
  const repository = typeof payload.repository?.full_name === "string"
    ? payload.repository.full_name
    : null;
  const workflow = payload.workflow_run;
  const pullRequest = payload.pull_request;
  return {
    provider: "github",
    event,
    action: typeof payload.action === "string" ? payload.action : null,
    repository,
    ref: typeof payload.ref === "string" ? payload.ref : null,
    before: typeof payload.before === "string" ? payload.before : null,
    after: typeof payload.after === "string" ? payload.after : null,
    installation_id: Number.isInteger(payload.installation?.id)
      ? payload.installation.id
      : null,
    sender: typeof payload.sender?.login === "string" ? payload.sender.login : null,
    workflow_run: workflow ? {
      id: Number.isInteger(workflow.id) ? workflow.id : null,
      name: typeof workflow.name === "string" ? workflow.name : null,
      status: typeof workflow.status === "string" ? workflow.status : null,
      conclusion: typeof workflow.conclusion === "string" ? workflow.conclusion : null,
      run_number: Number.isInteger(workflow.run_number) ? workflow.run_number : null,
      html_url: typeof workflow.html_url === "string" ? workflow.html_url : null,
    } : null,
    pull_request: pullRequest ? {
      number: Number.isInteger(pullRequest.number) ? pullRequest.number : null,
      state: typeof pullRequest.state === "string" ? pullRequest.state : null,
      merged: typeof pullRequest.merged === "boolean" ? pullRequest.merged : null,
      html_url: typeof pullRequest.html_url === "string" ? pullRequest.html_url : null,
    } : null,
    created_at: new Date().toISOString(),
  };
}

export const Route = createFileRoute("/api/public/webhooks/github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!secret) return json({ ok: false, error: "GitHub webhook is not configured" }, 503);

        const deliveryId = request.headers.get("x-github-delivery");
        const event = request.headers.get("x-github-event");
        const signature = request.headers.get("x-hub-signature-256");
        if (!deliveryId || !event || !signature) {
          return json({ ok: false, error: "Required GitHub webhook headers are missing" }, 400);
        }

        const raw = await request.text();
        if (raw.length > 1_000_000) return json({ ok: false, error: "Payload too large" }, 413);
        if (!signatureIsValid(raw, signature, secret)) {
          return json({ ok: false, error: "Invalid signature" }, 401);
        }

        let payload: GitHubPayload;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json({ ok: false, error: "Invalid payload" }, 400);
          }
          payload = parsed as GitHubPayload;
        } catch {
          return json({ ok: false, error: "Invalid JSON" }, 400);
        }

        if (event === "ping") {
          return json({ ok: true, event: "ping", delivery_id: deliveryId });
        }

        const allowed = allowedRepositories();
        if (allowed.length === 0) {
          return json({ ok: false, error: "GitHub repository allowlist is not configured" }, 503);
        }

        const repository = typeof payload.repository?.full_name === "string"
          ? payload.repository.full_name.toLowerCase()
          : null;
        const account = typeof payload.installation?.account?.login === "string"
          ? payload.installation.account.login.toLowerCase()
          : typeof payload.organization?.login === "string"
            ? payload.organization.login.toLowerCase()
            : null;
        const allowedOwners = new Set(allowed.map((name) => name.split("/")[0]));
        const permitted = repository
          ? allowed.includes(repository)
          : Boolean(account && allowedOwners.has(account));

        if (!permitted) {
          return json({ ok: false, error: "Repository or installation is outside the configured allowlist" }, 403);
        }

        const summary = summarize(event, payload);
        const { data: existing, error: lookupError } = await supabaseAdmin
          .from("resofit_events")
          .select("event_name")
          .eq("event_name", "GitHubWebhookReceived")
          .contains("payload", { delivery_id: deliveryId })
          .limit(1);

        if (lookupError) {
          console.error("[github-webhook] delivery lookup failed", lookupError);
          return json({ ok: false, error: "Webhook idempotency lookup failed" }, 500);
        }
        if (existing?.length) {
          return json({ ok: true, duplicate: true, delivery_id: deliveryId });
        }

        const { error: insertError } = await supabaseAdmin.from("resofit_events").insert({
          event_name: "GitHubWebhookReceived",
          source_system: "chatb2k",
          payload: {
            delivery_id: deliveryId,
            ...summary,
          },
          funnel_origin: "github",
          utm: {},
        });

        if (insertError) {
          console.error("[github-webhook] event persistence failed", insertError);
          return json({ ok: false, error: "Webhook event persistence failed" }, 500);
        }

        return json({
          ok: true,
          accepted: true,
          delivery_id: deliveryId,
          event,
          repository: summary.repository,
        }, 202);
      },
    },
  },
});
