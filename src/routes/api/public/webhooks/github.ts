import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { createSecretsBridge } from "@/lib/secrets-bridge";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Only events that carry both an installation and a repository identity are
// accepted here. Account-wide events (ping, installation, installation_repositories)
// are intentionally excluded because this inbox schema requires repository_full_name.
const ALLOWED_EVENT_TYPES = new Set([
  "push",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issues",
  "issue_comment",
  "check_run",
  "check_suite",
  "status",
  "commit_comment",
  "create",
  "delete",
  "deployment",
  "deployment_status",
  "fork",
  "label",
  "milestone",
  "release",
  "repository_dispatch",
  "workflow_run",
  "workflow_job",
]);

function unauthorized() {
  return new Response("Invalid webhook signature", { status: 401 });
}

export const Route = createFileRoute("/api/public/webhooks/github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Explicit Node/Vercel adapter: the bridge itself never reads process.env.
        let secret: string;
        let edgeUrl: string;
        let serviceRoleKey: string;
        let allowedRepositories: Set<string>;
        let allowedInstallationIds: Set<string>;
        try {
          const bridge = createSecretsBridge({
            GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
            GITHUB_ALLOWED_REPOSITORIES: process.env.GITHUB_ALLOWED_REPOSITORIES,
            GITHUB_ALLOWED_INSTALLATION_IDS: process.env.GITHUB_ALLOWED_INSTALLATION_IDS,
            RESOFLEX_EDGE_SUPABASE_URL: process.env.RESOFLEX_EDGE_SUPABASE_URL,
            RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY: process.env.RESOFLEX_EDGE_SUPABASE_SERVICE_ROLE_KEY,
          });
          secret = bridge.getGitHubWebhookSecret();
          edgeUrl = bridge.getSupabaseUrl();
          serviceRoleKey = bridge.getSupabaseServiceRoleKey();
          allowedRepositories = new Set(bridge.getAllowedRepositories());
          allowedInstallationIds = new Set(bridge.getAllowedInstallationIds());
        } catch {
          console.error("GitHub webhook receiver is not configured");
          return new Response("Webhook receiver not configured", { status: 503 });
        }

        const signature = request.headers.get("x-hub-signature-256");
        const deliveryId = request.headers.get("x-github-delivery");
        const eventType = request.headers.get("x-github-event");
        if (!signature || !deliveryId || !eventType) return unauthorized();
        if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(deliveryId)) {
          return new Response("Invalid delivery id", { status: 400 });
        }
        if (!/^[a-z_]{1,64}$/i.test(eventType)) {
          return new Response("Invalid event type", { status: 400 });
        }
        if (!ALLOWED_EVENT_TYPES.has(eventType)) {
          return new Response("Event type not allowlisted", { status: 403 });
        }

        const rawBody = await request.text();
        if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }

        const match = /^sha256=([0-9a-f]{64})$/i.exec(signature);
        if (!match) return unauthorized();
        const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
        const received = Buffer.from(match[1], "hex");
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
          return unauthorized();
        }

        let payload: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(rawBody);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return new Response("Invalid JSON payload", { status: 400 });
          }
          payload = parsed as Record<string, unknown>;
        } catch {
          return new Response("Invalid JSON payload", { status: 400 });
        }

        const installation = payload.installation as { id?: unknown } | undefined;
        const installationId =
          typeof installation?.id === "number" || typeof installation?.id === "string"
            ? String(installation.id)
            : "";
        if (!installationId || !allowedInstallationIds.has(installationId)) {
          return new Response("GitHub App installation not allowlisted", { status: 403 });
        }

        const repository = payload.repository as { full_name?: unknown } | undefined;
        const repositoryName =
          typeof repository?.full_name === "string" ? repository.full_name.trim() : "";
        if (!repositoryName || !allowedRepositories.has(repositoryName.toLowerCase())) {
          return new Response("Repository not allowlisted", { status: 403 });
        }

        const action = typeof payload.action === "string" ? payload.action : null;
        const supabase = createClient(edgeUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { error } = await supabase.from("github_webhook_inbox").insert({
          delivery_id: deliveryId,
          event_type: eventType,
          repository_full_name: repositoryName,
          action,
          payload,
          status: "received",
        });

        if (error?.code === "23505") {
          return Response.json(
            { accepted: true, duplicate: true, delivery_id: deliveryId },
            { status: 202 },
          );
        }
        if (error) {
          console.error("GitHub webhook inbox insert failed", {
            code: error.code,
            delivery_id: deliveryId,
          });
          return new Response("Temporary inbox failure", { status: 503 });
        }

        return Response.json(
          { accepted: true, duplicate: false, delivery_id: deliveryId },
          { status: 202 },
        );
      },
    },
  },
});
