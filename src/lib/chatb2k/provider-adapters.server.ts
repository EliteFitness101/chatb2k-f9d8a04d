import type { Provider } from "@/lib/chatb2k/universal-config-engine";

export interface InspectionEvidence {
  provider: Provider;
  ok: boolean;
  checkedAt: string;
  status: number | null;
  resource: string;
  evidence: Record<string, string | number | boolean | null>;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server-side configuration: ${name}`);
  return value;
}

async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectProviderReadOnly(provider: Provider): Promise<InspectionEvidence> {
  const checkedAt = new Date().toISOString();
  if (provider === "github") {
    const token = requiredEnv("CHATB2K_GITHUB_TOKEN");
    const repo = process.env["CHATB2K_GITHUB_REPOSITORY"] ?? "EliteFitness101/chatb2k-f9d8a04d";
    if (repo !== "EliteFitness101/chatb2k-f9d8a04d") throw new Error("GitHub repository is not on the UACE allowlist");
    const response = await safeFetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=5`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new Error(`GitHub read-only inspection failed with HTTP ${response.status}`);
    const data = await response.json() as { total_count?: number; workflow_runs?: Array<{ name?: string; status?: string; conclusion?: string | null; head_sha?: string }> };
    return {
      provider, ok: true, checkedAt, status: response.status, resource: repo,
      evidence: { workflowRunCount: data.total_count ?? 0, latestWorkflow: data.workflow_runs?.[0]?.name ?? null, latestStatus: data.workflow_runs?.[0]?.status ?? null, latestConclusion: data.workflow_runs?.[0]?.conclusion ?? null, latestSha: data.workflow_runs?.[0]?.head_sha ?? null },
    };
  }

  if (provider === "vercel") {
    const token = requiredEnv("VERCEL_TOKEN");
    const projectId = requiredEnv("VERCEL_PROJECT_ID");
    const response = await safeFetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Vercel read-only inspection failed with HTTP ${response.status}`);
    const data = await response.json() as { id?: string; name?: string; framework?: string | null; latestDeployments?: Array<{ readyState?: string; url?: string }> };
    return {
      provider, ok: true, checkedAt, status: response.status, resource: projectId,
      evidence: { projectName: data.name ?? null, projectId: data.id ?? projectId, framework: data.framework ?? null, latestDeploymentState: data.latestDeployments?.[0]?.readyState ?? null },
    };
  }

  if (provider === "supabase") {
    const baseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const anonKey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!anonKey) throw new Error("Missing server-side configuration: SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
    const response = await safeFetch(`${baseUrl}/auth/v1/health`, { headers: { apikey: anonKey, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Supabase health inspection failed with HTTP ${response.status}`);
    return { provider, ok: true, checkedAt, status: response.status, resource: new URL(baseUrl).host, evidence: { authHealth: "reachable" } };
  }

  if (provider === "cloudflare-r2") {
    const token = requiredEnv("CLOUDFLARE_API_TOKEN");
    const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
    const bucket = requiredEnv("CLOUDFLARE_R2_BUCKET");
    const response = await safeFetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Cloudflare R2 metadata inspection failed with HTTP ${response.status}`);
    const data = await response.json() as { success?: boolean; result?: { name?: string; creation_date?: string; location?: string } };
    if (!data.success || !data.result) throw new Error("Cloudflare R2 did not confirm the bucket resource");
    return { provider, ok: true, checkedAt, status: response.status, resource: bucket, evidence: { bucketName: data.result.name ?? bucket, location: data.result.location ?? null, createdAt: data.result.creation_date ?? null } };
  }

  if (provider === "google-drive") {
    const clientId = requiredEnv("GOOGLE_DRIVE_CLIENT_ID");
    const clientSecret = requiredEnv("GOOGLE_DRIVE_CLIENT_SECRET");
    const refreshToken = requiredEnv("GOOGLE_DRIVE_REFRESH_TOKEN");
    const folderId = requiredEnv("GOOGLE_DRIVE_ARCHIVE_FOLDER_ID");
    const tokenResponse = await safeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    if (!tokenResponse.ok) throw new Error(`Google Drive OAuth refresh failed with HTTP ${tokenResponse.status}`);
    const tokenData = await tokenResponse.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("Google Drive OAuth response did not include an access token");
    const query = new URLSearchParams({ q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`, pageSize: "1", fields: "files(id,name,mimeType)" });
    const response = await safeFetch(`https://www.googleapis.com/drive/v3/files?${query.toString()}`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Google Drive folder inspection failed with HTTP ${response.status}`);
    const data = await response.json() as { files?: Array<{ id?: string; name?: string; mimeType?: string }> };
    return { provider, ok: true, checkedAt, status: response.status, resource: folderId, evidence: { folderAccessible: true, sampleChildCount: data.files?.length ?? 0, sampleChildName: data.files?.[0]?.name ?? null } };
  }

  if (provider === "buffer") {
    const token = requiredEnv("BUFFER_API_KEY");
    const response = await safeFetch("https://api.buffer.com", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "query UACEReadOnlyAccount { account { id organizations { id name } } }" }),
    });
    if (!response.ok) throw new Error("Buffer read-only inspection failed with HTTP " + response.status);
    const data = await response.json() as { errors?: Array<{ message?: string }>; data?: { account?: { id?: string; organizations?: Array<{ id?: string; name?: string }> } } };
    if (data.errors?.length || !data.data?.account) throw new Error("Buffer GraphQL query failed; inspect API key scope and current schema");
    const organizations = data.data.account.organizations ?? [];
    return { provider, ok: true, checkedAt, status: response.status, resource: "authenticated Buffer account", evidence: { accountIdPresent: Boolean(data.data.account.id), organizationCount: organizations.length, organizationNames: organizations.slice(0, 10).map((org) => org.name ?? "unnamed").join(", ") } };
  }

  throw new Error("Unsupported provider");
}
