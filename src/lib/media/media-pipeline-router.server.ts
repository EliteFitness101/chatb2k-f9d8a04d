import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MediaCandidate = { url: string; label?: string };
type ProviderRoute = {
  route_id: string;
  provider: string;
  service_type: string;
  status: string;
  endpoint_class: string;
  fallback_provider: string | null;
  config: Record<string, any>;
  updated_at?: string;
};

const ACTIVE_STATUSES = ["declared_production", "active", "healthy"];
const MEDIA_SERVICE_TYPES = ["media_storage", "media_assets", "media_cdn"];

const PURPOSE_POLICIES: Record<string, { preferredRouteIds: string[]; rationale: string }> = {
  public_product_media: {
    preferredRouteIds: ["media-cloudflare-r2-cdn", "media-imagekit", "media-vercel-blob", "provider-imagekit", "media-supabase-catalog"],
    rationale: "Prefer a verified public CDN/transform provider; use R2 only after its custom domain, bucket binding and cache tests pass.",
  },
  educational_thumbnails: {
    preferredRouteIds: ["media-cloudflare-r2-cdn", "media-imagekit", "media-vercel-blob", "provider-imagekit"],
    rationale: "Public thumbnails may use a verified CDN/transform provider; private lesson files must use the private-delivery path.",
  },
  approved_promo_media: {
    preferredRouteIds: ["media-cloudflare-r2-cdn", "provider-imagekit", "media-imagekit", "media-vercel-blob"],
    rationale: "Only rights-approved public promotional assets belong on a public CDN.",
  },
  live_stream_highlights: {
    preferredRouteIds: ["media-cloudflare-r2-cdn", "media-imagekit", "media-vercel-blob", "media-dropbox", "media-google-drive"],
    rationale: "Prefer public delivery/CDN for approved clips and preserve Dropbox/Drive as archive sources.",
  },
  bigo_archive: {
    preferredRouteIds: ["media-dropbox", "media-google-drive", "media-vercel-blob"],
    rationale: "Archive originals in the registered archive provider; keep publishing copies and canonical assets separate.",
  },
  transform_public_media: {
    preferredRouteIds: ["provider-imagekit", "media-imagekit", "media-cloudflare-r2-cdn"],
    rationale: "ImageKit is the registered transformation provider; R2 remains gated until runtime verification.",
  },
};

function hostMatches(host: string, suffix: string) {
  const normalized = suffix.toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
  return host === normalized || host.endsWith("." + normalized);
}

export async function listMediaProviderRouteCatalog(): Promise<ProviderRoute[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from("chatb2k_provider_routes")
    .select("route_id,provider,service_type,status,endpoint_class,fallback_provider,config,updated_at")
    .in("service_type", MEDIA_SERVICE_TYPES)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("MEDIA_PROVIDER_REGISTRY_UNAVAILABLE");
  return (data ?? []) as ProviderRoute[];
}

export async function listMediaProviderRoutes(): Promise<ProviderRoute[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from("chatb2k_provider_routes")
    .select("route_id,provider,service_type,status,endpoint_class,fallback_provider,config,updated_at")
    .eq("service_type", "media_storage")
    .in("status", ACTIVE_STATUSES)
    .order("updated_at", { ascending: true });
  if (error) throw new Error("MEDIA_PROVIDER_REGISTRY_UNAVAILABLE");
  return ((data ?? []) as ProviderRoute[])
    .filter((route) => route.config && Array.isArray(route.config.allowed_host_suffixes))
    .sort((a, b) => Number(a.config.priority ?? 100) - Number(b.config.priority ?? 100));
}

export async function recommendMediaProvider(purpose: string) {
  if (purpose === "catalog_metadata") {
    return {
      purpose,
      provider: "Supabase Postgres",
      route_id: null,
      status: "database_registry_available",
      readiness: "verified_database",
      runtime_verified: true,
      operation_ready: false,
      write_enabled: false,
      tables: ["resofit_catalog_manifest", "resofit_shopify_product_snapshots"],
      public_metadata_bucket: "resofit-catalog-metadata",
      rationale: "Use Postgres as the source of truth for SKU, price, lifecycle, payment and fulfillment metadata. The public JSON bucket is for non-sensitive static metadata only.",
    };
  }

  if (purpose === "private_paid_delivery") {
    return {
      purpose,
      provider: "Supabase Storage",
      route_id: "media-supabase-catalog",
      status: "configured_origin_unverified",
      readiness: "private_bucket_exists_runtime_delivery_unverified",
      runtime_verified: false,
      operation_ready: false,
      write_enabled: false,
      bucket: "resofit-paid-deliverables",
      cache_policy: "private, no-store; buyer-authorized short-lived signed URLs only",
      fallback_route_id: null,
      rationale: "Do not fall back to a public CDN for paid downloads, customer-specific files or private educational media.",
    };
  }

  const policy = PURPOSE_POLICIES[purpose];
  if (!policy) return null;

  const catalog = await listMediaProviderRouteCatalog();
  const ordered = policy.preferredRouteIds
    .map((id) => catalog.find((route) => route.route_id === id))
    .filter((route): route is ProviderRoute => Boolean(route));
  const selected = ordered.find((route) => ACTIVE_STATUSES.includes(route.status)) ?? ordered[0] ?? null;
  if (!selected) {
    return {
      purpose,
      provider: null,
      route_id: null,
      status: "not_configured",
      readiness: "blocked",
      runtime_verified: false,
      operation_ready: false,
      write_enabled: false,
      rationale: "No provider route is registered for this purpose.",
    };
  }

  const nextFallback = ordered.find((route) => route.route_id !== selected.route_id && ACTIVE_STATUSES.includes(route.status));
  const suffixes = selected.config?.allowed_host_suffixes;
  return {
    purpose,
    provider: selected.provider,
    route_id: selected.route_id,
    service_type: selected.service_type,
    endpoint_class: selected.endpoint_class,
    status: selected.status,
    readiness: selected.status === "healthy" ? "runtime_healthy" : selected.status === "active" ? "active_not_health_probed" : selected.status === "declared_production" ? "registry_declared_runtime_unverified" : "not_ready",
    runtime_verified: selected.status === "healthy" || selected.config?.runtime_verified === true,
    route_eligible_for_resolution: ACTIVE_STATUSES.includes(selected.status) && Array.isArray(suffixes),
    operation_ready: false,
    write_enabled: false,
    publish_enabled: false,
    fallback_route_id: nextFallback?.route_id ?? null,
    activation_gate: selected.config?.activation_gate ?? [],
    rationale: policy.rationale,
    limitations: "This endpoint recommends registered routes only. Upload, transformation, signed delivery and channel publishing require separately authenticated provider integrations and smoke tests.",
  };
}

export async function resolveMediaProvider(candidates: MediaCandidate[], requestId: string) {
  const routes = await listMediaProviderRoutes();
  for (const route of routes) {
    const suffixes = route.config.allowed_host_suffixes as unknown[];
    for (const candidate of candidates) {
      let url: URL;
      try { url = new URL(candidate.url); } catch { continue; }
      if (url.protocol !== "https:" || url.username || url.password || !suffixes.some((s) => typeof s === "string" && hostMatches(url.hostname, s))) continue;
      const result = {
        provider: route.provider,
        route_id: route.route_id,
        service_type: route.service_type,
        endpoint_class: route.endpoint_class,
        url: url.toString(),
        host: url.hostname,
        route_status: route.status,
        fallback_provider: route.fallback_provider,
      };
      await recordMediaPipelineEvent({ requestId, action: "resolve", provider: route.provider, routeId: route.route_id, outcome: "matched", assetHost: url.hostname });
      return result;
    }
  }
  await recordMediaPipelineEvent({ requestId, action: "resolve", outcome: "no_registered_provider_match", metadata: { candidate_count: candidates.length } });
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
