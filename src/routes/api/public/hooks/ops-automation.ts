import { createFileRoute } from "@tanstack/react-router";
import { AUTOMATION_JOBS, type AutomationJob } from "@/lib/ops/automation.server";

/**
 * Scheduled operations worker.
 *
 * Called by pg_cron with the project anon key in the `apikey` header. Runs the
 * SLA sweep, task generation, alert escalation/cleanup, inventory health,
 * hub capacity refresh, recovery generation and analytics aggregation.
 *
 * POST body: { "jobs": ["sla","alerts"] } — omit to run every job.
 */
export const Route = createFileRoute("/api/public/hooks/ops-automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer /i, "");
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apiKey || !expected || apiKey !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let jobs: AutomationJob[] = [...AUTOMATION_JOBS];
        try {
          const body = (await request.json()) as { jobs?: string[] };
          if (Array.isArray(body?.jobs) && body.jobs.length > 0) {
            jobs = body.jobs.filter((j): j is AutomationJob =>
              (AUTOMATION_JOBS as readonly string[]).includes(j),
            );
          }
        } catch {
          /* empty body → run everything */
        }

        const { runAutomation } = await import("@/lib/ops/automation.server");
        const started = Date.now();
        const results = await runAutomation(jobs);
        return Response.json({ ok: true, ms: Date.now() - started, jobs, results });
      },
    },
  },
});