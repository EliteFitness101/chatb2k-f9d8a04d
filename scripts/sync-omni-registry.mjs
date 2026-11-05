import { readFile } from "node:fs/promises";

const manifestPath = new URL("../config/omni-credential-registry.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (process.argv.includes("--validate")) {
  if (!Array.isArray(manifest.nodes) || !Array.isArray(manifest.integrations)) throw new Error("manifest nodes/integrations missing");
  const ids = [...manifest.nodes, ...manifest.integrations].map((x) => x.binding_id);
  if (ids.some((x) => typeof x !== "string" || !x) || new Set(ids).size !== ids.length) throw new Error("manifest binding IDs must be unique");
  if (manifest.nodes.length !== 25) throw new Error(`expected 25 configured node records, got ${manifest.nodes.length}`);
  console.log(JSON.stringify({ ok: true, nodes: manifest.nodes.length, integrations: manifest.integrations.length, secret_values_included: false }));
  process.exit(0);
}

const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL || "";
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || "";
if (!base || !requestUrl || !requestToken) throw new Error("GitHub OIDC or Supabase URL environment is unavailable");

const oidcUrl = requestUrl + (requestUrl.includes("?") ? "&" : "?") + "audience=chatb2k-registry-sync";
const oidcResponse = await fetch(oidcUrl, { headers: { authorization: `bearer ${requestToken}` } });
if (!oidcResponse.ok) throw new Error(`GitHub OIDC request failed: HTTP ${oidcResponse.status}`);
const oidc = await oidcResponse.json();
if (typeof oidc.value !== "string" || !oidc.value) throw new Error("GitHub OIDC token missing");

const endpoint = base + "/functions/v1/chatb2k-registry-sync";
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${oidc.value}`, "content-type": "application/json" },
  body: JSON.stringify({ version: manifest.version, nodes: manifest.nodes, bindings: [...manifest.nodes, ...manifest.integrations] }),
  signal: AbortSignal.timeout(45000)
});
const body = await response.json().catch(() => ({}));
if (!response.ok || body.ok !== true) throw new Error(`Registry sync failed: HTTP ${response.status}; outcome=${body.outcome || body.error || "unknown"}`);
console.log(JSON.stringify({ ok: true, outcome: body.outcome, inserted: body.inserted, updated: body.updated, skipped: body.skipped, errors: body.errors, run_id: body.run_id, secret_values_read: false }));
