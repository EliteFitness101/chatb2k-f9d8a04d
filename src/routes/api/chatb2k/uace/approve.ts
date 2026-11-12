import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildExecutionPlan } from "@/lib/chatb2k/universal-config-engine";

function bearerFrom(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

/**
 * Records a short-lived, exact-plan approval. It never runs the approved plan.
 * Only user IDs explicitly configured in UACE_APPROVER_USER_IDS may approve.
 */
export const Route = createFileRoute("/api/chatb2k/uace/approve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const bearer = bearerFrom(request);
        if (!url || !anonKey || !serviceRoleKey || !bearer) {
          return Response.json({ error: "Unauthorized or approval storage is not configured" }, { status: 401 });
        }

        const authClient = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user }, error } = await authClient.auth.getUser(bearer);
        if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const approvers = (process.env["UACE_APPROVER_USER_IDS"] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
        if (!approvers.includes(user.id)) return Response.json({ error: "Forbidden: user is not an authorized UACE approver" }, { status: 403 });

        if (Number(request.headers.get("content-length") ?? 0) > 4096) {
          return Response.json({ error: "Request body too large" }, { status: 413 });
        }
        let body: { command?: unknown; target?: unknown; scopes?: unknown; planHash?: unknown } = {};
        try {
          const rawBody = await request.text();
          if (rawBody.length > 4096) return Response.json({ error: "Request body too large" }, { status: 413 });
          body = JSON.parse(rawBody) as typeof body;
        } catch {
          return Response.json({ error: "Expected JSON body" }, { status: 400 });
        }
        if (typeof body.command !== "string" || body.command.length < 1 || body.command.length > 2000 ||
            typeof body.target !== "string" || body.target.trim().length < 2 || body.target.length > 160 ||
            !Array.isArray(body.scopes) || !body.scopes.every((s) => typeof s === "string" && s.length <= 120) ||
            typeof body.planHash !== "string" || !/^[a-f0-9]{64}$/.test(body.planHash)) {
          return Response.json({ error: "Invalid approval request" }, { status: 400 });
        }

        const plan = buildExecutionPlan(body.command);
        const step = plan.steps[0];
        if (!step || plan.approval !== "required" || step.risk === "destructive" || step.risk === "read") {
          return Response.json({ error: "This plan is not eligible for approval" }, { status: 409 });
        }
        const requestedScopes = [...new Set(body.scopes as string[])].sort();
        const permittedScopes = [...step.requiredScopes].sort();
        if (requestedScopes.length === 0 || requestedScopes.some((scope) => !permittedScopes.includes(scope))) {
          return Response.json({ error: "Requested scopes exceed this plan's permitted scopes" }, { status: 403 });
        }

        if (body.target.trim() !== step.target || /unresolved/i.test(step.target)) {
          return Response.json({ error: "Target must exactly match a resolved target in the reviewed plan" }, { status: 409 });
        }
        const expectedHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
        if (body.planHash !== expectedHash) {
          return Response.json({ error: "Plan hash mismatch; regenerate and review the exact plan" }, { status: 409 });
        }

        const now = Date.now();
        const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
        const auditClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error: insertError } = await auditClient.from("uace_approvals").insert({
          plan_hash: expectedHash,
          actor_user_id: user.id,
          approved_by: user.id,
          target: body.target.trim(),
          scopes: requestedScopes,
          expires_at: expiresAt,
        }).select("id,plan_hash,target,scopes,expires_at,created_at").single();
        if (insertError || !data) {
          console.error("[UACE] approval persistence failed", { code: insertError?.code });
          return Response.json({ error: "Approval could not be persisted; no operation was executed" }, { status: 503 });
        }

        return Response.json({
          ok: true,
          approval: { id: data.id, planHash: data.plan_hash, target: data.target, scopes: data.scopes, expiresAt: data.expires_at },
          execution: { attempted: false, status: "approval-recorded-not-executed" },
        });
      },
    },
  },
});
