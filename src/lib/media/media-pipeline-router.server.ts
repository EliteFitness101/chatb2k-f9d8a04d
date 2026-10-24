import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MediaCandidate = { url: string; label?: string };
type ProviderRoute = { route_id: string; provider: string; status: string; config: Record<string, unknown>; updated_at?: string };

const ACTIVE_STATUSES = ["declared_production", "active", "healthy"];

function hostMatches(host: string, suffix: string) {
  const normalized = suffix.toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
  return host === normalized || host.endsWith("." + normalized);
}

export async function listMediaProviderRoutes(): Promise<ProviderRoute[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from("chatb2k_provider_routes")
    .select("route_id,provider,status,config,updated_at")
    .eq("service_type", "media_storage")
    .in("status", ACTIVE_STATUSES)
    .order("updated_at", { ascending: true });
  if (error) throw new Error("MEDIA_PROVIDER_REGISTRY_UNAVAILABLE");
  return ((data ?? []) as ProviderRoute[])
    .filter((route) => route.config && Array.isArray(route.config.allowed_host_suffixes))
    .sort((a, b) => Number(a.config.priority ?? 100) - Number(b.config.priority ?? 100));
}

async function probeMediaUrl(url: URL): Promise<boolean> {
  // Probe the candidate itself, not a hardcoded storage provider. Follow provider redirects
  // and use a short timeout so one unhealthy origin cannot stall the media pipeline.
  const probe = async (method: "HEAD" | "GET") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url.toString(), {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      });
      if (method === "GET") await response.body?.cancel().catch(() => undefined);
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  if (await probe("HEAD")) return true;
  return await probe("GET");
}

export async function resolveMediaProvider(candidates: MediaCandidate[], requestId: string) {
  const routes = await listMediaProviderRoutes();
  const unavailable: string[] = [];
  for (const route of routes) {
    const suffixes = route.config.allowed_host_suffixes as unknown[];
    for (const candidate of candidates) {
      let url: URL;
      try { url = new URL(candidate.url); } catch { continue; }
      if (url.protocol !== "https:" || !suffixes.some((s) => typeof s === "string" && hostMatches(url.hostname, s))) continue;
      if (!(await probeMediaUrl(url))) {
        unavailable.push(`${route.route_id}:${url.hostname}`);
        await recordMediaPipelineEvent({ requestId, action: "availability_probe", provider: route.provider, routeId: route.route_id, outcome: "unavailable", assetHost: url.hostname });
        continue;
      }
      const result = { provider: route.provider, route_id: route.route_id, url: url.toString(), host: url.hostname, route_status: route.status, availability_verified: true };
      await recordMediaPipelineEvent({ requestId, action: "resolve", provider: route.provider, routeId: route.route_id, outcome: "matched_available", assetHost: url.hostname });
      return result;
    }
  }
  await recordMediaPipelineEvent({ requestId, action: "resolve", outcome: "no_available_registered_provider_match", metadata: { candidate_count: candidates.length, unavailable } });
  return null;
}

export async function recordMediaPipelineEvent(input: {
  requestId: string; action: string; provider?: string; routeId?: string; outcome: string; assetHost?: string; metadata?: Record<string, unknown>;
}) {
  try {
    await (supabaseAdmin as any).from("chatb2k_media_pipeline_events").insert({
      request_id: input.requestId,
      action: input.action,
      provider: input.provider ?? null,
      route_id: input.routeId ?? null,
      outcome: input.outcome,
      asset_host: input.assetHost ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Audit logging must not take down media ingestion; provider selection still fails closed.
  }
}
