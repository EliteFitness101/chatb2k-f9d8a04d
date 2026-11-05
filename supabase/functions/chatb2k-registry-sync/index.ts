import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6";

const REPOSITORY = "EliteFitness101/chatb2k-f9d8a04d";
const BRANCH_REF = "refs/heads/main";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/chatb2k-registry-sync.yml@${BRANCH_REF}`;
const AUDIENCE = "chatb2k-registry-sync";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks"));
const ALLOWED_PROJECTS = new Set(["vbqjvmnhdtdhmeeudqnn", "xtgteviwtoupbfvorrmk"]);
const cors = { "content-type": "application/json", "cache-control": "no-store" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function cleanString(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, max) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ ok: false, error: "github_oidc_required" }, 401);

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(authorization.slice(7), JWKS, { issuer: ISSUER, audience: AUDIENCE });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    return reply({ ok: false, error: "github_oidc_invalid" }, 401);
  }

  if (claims.repository !== REPOSITORY || claims.ref !== BRANCH_REF || claims.workflow_ref !== WORKFLOW_REF) {
    return reply({ ok: false, error: "github_workflow_not_allowlisted" }, 403);
  }
  if (!["schedule", "workflow_dispatch", "push"].includes(String(claims.event_name || ""))) {
    return reply({ ok: false, error: "github_event_not_allowlisted" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return reply({ ok: false, error: "registry_storage_not_configured" }, 503);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let raw = "";
  try { raw = await req.text(); } catch { return reply({ ok: false, error: "body_read_failed" }, 400); }
  if (new TextEncoder().encode(raw).byteLength > 64000) return reply({ ok: false, error: "manifest_too_large" }, 413);

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }
  const bindings = Array.isArray(body.bindings) ? body.bindings : [];
  if (!bindings.length || bindings.length > 100) return reply({ ok: false, error: "invalid_binding_count" }, 400);

  const runId = String(claims.run_id || crypto.randomUUID());
  const commitSha = cleanString(claims.sha, 80) || "unknown";
  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const allowedTypes = new Set(["github_actions", "supabase_edge_node", "supabase_edge_function", "chatb2k_orchestration_registry"]);

  for (const item of bindings) {
    const row = item as Record<string, unknown>;
    const bindingId = cleanString(row.binding_id, 120);
    const system = cleanString(row.system, 80);
    const projectRef = cleanString(row.project_ref, 80);
    const purpose = cleanString(row.purpose, 500);
    const syncMode = cleanString(row.sync_mode, 40) || "observe";
    const nodeId = cleanString(row.node_id, 40);
    if (!bindingId || !system || !projectRef || !purpose || !ALLOWED_PROJECTS.has(projectRef) ||
        !allowedTypes.has(system) || !["observe", "manifest_sync"].includes(syncMode) ||
        (nodeId && !/^chatb2k1(0[1-9]|1[0-9]|2[0-5])$/.test(nodeId))) {
      skipped++;
      continue;
    }

    const patch: Record<string, unknown> = {
      system, project_ref: projectRef, purpose, sync_mode: syncMode,
      repository: cleanString(row.repository, 200),
      workflow_path: cleanString(row.workflow_path, 300),
      function_slug: cleanString(row.function_slug, 160),
      cron_job_name: cleanString(row.cron_job_name, 160),
      webhook_path: cleanString(row.webhook_path, 300),
      worker_ref: cleanString(row.worker_ref, 300),
      node_id: nodeId,
    };
    const safeEvidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
      ? row.evidence as Record<string, unknown> : {};
    const { data: existing, error: readError } = await db.from("chatb2k_infrastructure_bindings")
      .select("binding_id,status,last_verified_at,evidence").eq("binding_id", bindingId).maybeSingle();
    if (readError) { errors++; continue; }

    const evidence = {
      ...(existing?.evidence && typeof existing.evidence === "object" ? existing.evidence : {}),
      ...safeEvidence,
      registry_sync: { repository: REPOSITORY, workflow_ref: WORKFLOW_REF, run_id: runId, commit_sha: commitSha, synced_at: new Date().toISOString() }
    };
    if (existing) {
      const { error } = await db.from("chatb2k_infrastructure_bindings").update({ ...patch, evidence, updated_at: new Date().toISOString() }).eq("binding_id", bindingId);
      if (error) errors++; else updated++;
    } else {
      const { error } = await db.from("chatb2k_infrastructure_bindings").insert({
        binding_id: bindingId, ...patch, evidence, status: "configured", updated_at: new Date().toISOString()
      });
      if (error) errors++; else inserted++;
    }
  }

  const outcome = errors ? (inserted + updated ? "partial" : "failed") : "completed";
  const { error: ledgerError } = await db.from("chatb2k_registry_sync_runs").insert({
    source_system: "github_actions_oidc",
    source_ref: WORKFLOW_REF,
    outcome,
    inserted_count: inserted,
    updated_count: updated,
    skipped_count: skipped,
    error_count: errors,
    details: { run_id: runId, commit_sha: commitSha, manifest_version: cleanString(body.version, 40), binding_count: bindings.length, auth: "github_oidc", secret_values_read: false },
    completed_at: new Date().toISOString()
  });
  if (ledgerError) return reply({ ok: false, error: "sync_ledger_write_failed", inserted, updated, skipped, errors }, 500);
  return reply({ ok: errors === 0, outcome, inserted, updated, skipped, errors, run_id: runId }, errors ? 207 : 200);
});
