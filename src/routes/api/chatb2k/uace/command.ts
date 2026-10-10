import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildExecutionPlan } from "@/lib/chatb2k/universal-config-engine";

const MAX_COMMAND_LENGTH = 2000;

function getBearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Authenticated, plan-only UACE gateway.
 * This route deliberately does not execute provider mutations.
 */
export const Route = createFileRoute("/api/chatb2k/uace/command")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"];
        const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const bearer = getBearer(request);
        if (!url || !anonKey || !bearer) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const authClient = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user }, error: authError } = await authClient.auth.getUser(bearer);
        if (authError || !user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { command?: unknown } = {};
        try {
          body = await request.json() as { command?: unknown };
        } catch {
          return Response.json({ error: "Expected JSON body" }, { status: 400 });
        }
        if (typeof body.command !== "string" || !body.command.trim() || body.command.length > MAX_COMMAND_LENGTH) {
          return Response.json({ error: "command must be a non-empty string of at most 2000 characters" }, { status: 400 });
        }

        if (!serviceRoleKey) {
          return Response.json({ error: "Audit persistence is not configured; command was not executed" }, { status: 503 });
        }

        const plan = buildExecutionPlan(body.command);
        const auditClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error: auditErrorWrite } = await auditClient.from("uace_command_audit").insert({
          actor_user_id: user.id,
          plan_id: plan.planId,
          command_redacted: body.command.replace(/(?:token|secret|password|api[_ -]?key|authorization)\s*[:=]\s*\S+/ig, "$1=[REDACTED]").slice(0, MAX_COMMAND_LENGTH),
          provider: plan.command.provider,
          intent: plan.command.intent,
          environment: plan.command.environment,
          risk: plan.steps[0]?.risk ?? "blocked",
          approval_state: plan.approval,
          outcome: "planned",
          evidence: { step_count: plan.steps.length, execution_allowed: plan.executionAllowed },
        });
        if (auditErrorWrite) {
          // Fail closed: do not return a plan as actionable when its audit cannot be persisted.
          console.error("[UACE] audit write failed", { code: auditErrorWrite.code });
          return Response.json({ error: "Audit persistence unavailable; command was not executed" }, { status: 503 });
        }

        return Response.json({
          ok: true,
          plan,
          execution: { attempted: false, status: "plan-only" },
        }, { status: 200 });
      },
    },
  },
});
