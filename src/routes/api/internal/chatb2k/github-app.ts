import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function decodePart(value: string) {
  return JSON.parse(Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

function verifyBridgeToken(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const parts = token.split(".");
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (parts.length !== 3 || !secret) return null;
  const unsigned = parts[0] + "." + parts[1];
  const expected = createHmac("sha256", secret).update(unsigned).digest();
  let received: Buffer;
  try { received = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims = decodePart(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== "chatb2k-github-app-bridge" ||
        claims.scope !== "chatb2k:github-app:admin" ||
        !claims.sub || !claims.email ||
        Number(claims.exp) <= now || Number(claims.exp) - Number(claims.iat) > 300 ||
        !["ceo@resofit.fit", "resonancefitnesswork@gmail.com"].includes(String(claims.email).toLowerCase())) return null;
    return { sub: String(claims.sub), email: String(claims.email).toLowerCase() };
  } catch { return null; }
}

function b64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function appJwt() {
  const appId = process.env.CHATB2K_GITHUB_APP_ID?.trim() ?? "";
  const pem = (process.env.CHATB2K_GITHUB_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!appId || !pem) throw new Error("GITHUB_APP_CREDENTIALS_NOT_CONFIGURED");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const unsigned = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return unsigned + "." + signer.sign(pem, "base64url");
}

function installationConfig() {
  const ids = (process.env.GITHUB_ALLOWED_INSTALLATION_IDS ?? "").split(",").map(v => v.trim()).filter(v => /^\\d+$/.test(v));
  const repos = (process.env.GITHUB_ALLOWED_REPOSITORIES ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!ids.length || !repos.length) throw new Error("GITHUB_APP_INSTALLATION_OR_REPOSITORY_ALLOWLIST_MISSING");
  return { installationId: ids[0], repositories: repos };
}

async function installationToken() {
  const { installationId, repositories } = installationConfig();
  const jwt = appJwt();
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repositories: repositories.map(r => r.split("/")[1]) }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.token !== "string") {
    throw new Error(`GITHUB_INSTALLATION_TOKEN_FAILED_${response.status}`);
  }
  return { token: data.token as string, installationId, repositories };
}

function validateRepoPath(path: string, allowed: string[]) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..") || path.includes("\\") || path.includes("#")) return false;
  const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/|$)/.exec(path);
  if (!match) return false;
  return allowed.includes(`${match[1]}/${match[2]}`.toLowerCase());
}

export const Route = createFileRoute("/api/internal/chatb2k/github-app")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const actor = verifyBridgeToken(request);
        if (!actor) return json({ ok: false, error: "CHATB2K_GITHUB_BRIDGE_AUTH_REQUIRED" }, 401);
        try {
          const { token, installationId, repositories } = await installationToken();
          const response = await fetch("https://api.github.com/installation/repositories?per_page=100", {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            cache: "no-store",
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) return json({ ok: false, error: "GITHUB_INSTALLATION_READ_FAILED", status: response.status });
          const installed = Array.isArray(data.repositories) ? data.repositories.map((r: any) => ({
            full_name: r.full_name,
            permissions: r.permissions ?? {},
          })) : [];
          return json({
            ok: true,
            provider: "github_app_installation",
            app_id: process.env.CHATB2K_GITHUB_APP_ID ?? null,
            installation_id: installationId,
            configured_repository_allowlist: repositories,
            installed_repositories: installed,
            actor: actor.email,
            credential_values_exposed: false,
          });
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : "GITHUB_APP_STATUS_FAILED" }, 503);
        }
      },
      POST: async ({ request }) => {
        const actor = verifyBridgeToken(request);
        if (!actor) return json({ ok: false, error: "CHATB2K_GITHUB_BRIDGE_AUTH_REQUIRED" }, 401);
        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400); }
        const method = String(body.method ?? "GET").toUpperCase();
        const path = String(body.path ?? "");
        const payload = body.body && typeof body.body === "object" && !Array.isArray(body.body) ? body.body : undefined;
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
        try {
          const { token, repositories } = await installationToken();
          if (!validateRepoPath(path, repositories)) return json({ ok: false, error: "REPOSITORY_OR_PATH_NOT_ALLOWLISTED" }, 403);
          const target = new URL(path, "https://api.github.com");
          if (target.origin !== "https://api.github.com") return json({ ok: false, error: "INVALID_GITHUB_API_PATH" }, 400);
          const upstream = await fetch(target, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              ...(payload ? { "Content-Type": "application/json" } : {}),
            },
            ...(payload ? { body: JSON.stringify(payload) } : {}),
            cache: "no-store",
          });
          const raw = await upstream.text();
          let result: unknown;
          try { result = raw ? JSON.parse(raw) : {}; } catch { result = { response_excerpt: raw.slice(0, 2000) }; }
          return json({
            ok: upstream.ok,
            provider: "github_app_installation",
            method,
            path,
            upstream_status: upstream.status,
            actor: actor.email,
            result,
          }, upstream.ok ? 200 : 502);
        } catch (error) {
          return json({ ok: false, error: error instanceof Error ? error.message : "GITHUB_APP_REQUEST_FAILED" }, 503);
        }
      },
    },
  },
});
