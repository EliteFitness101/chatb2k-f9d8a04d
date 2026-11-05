import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "content-type, authorization" };
const json = (body: unknown, status = 200, cache = "public, max-age=15, s-maxage=60, stale-while-revalidate=120") => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...cors } });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

function context(country: string | null) {
  const c = /^[A-Za-z]{2}$/.test(country ?? "") ? country!.toUpperCase() : "NG";
  return { country: c, region: c === "NG" ? "AF-NG" : "INTL", currency: "NGN", presentmentCurrency: "NGN", settlementCurrency: "NGN", gateway: "paystack", fulfillmentHub: "Lagos", availableCurrencies: ["NGN"], internationalCardRoute: true, displayOnly: false, note: c === "NG" ? "Nigeria local route" : "International card payment; settlement/presentment remains NGN until another merchant-enabled currency is explicitly configured." };
}
function scoreProduct(p: any, intent: string) {
  const hay = [p.title, p.handle, p.product_type, ...(p.tags ?? [])].join(" ").toLowerCase();
  return intent.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).reduce((n, token) => n + (hay.includes(token) ? 2 : 0), 0);
}
function safeTerm(raw: string) {
  return raw.replace(/[%_]/g, " ").replace(/[^a-zA-Z0-9À-ÿ\s-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
async function searchEcosystem(rawQuery: string, limit: number) {
  const q = safeTerm(rawQuery);
  if (!q) return { query: rawQuery, results: [], groups: {} };
  const like = "%" + q + "%";
  const [products, offers, offerSources, network, hubs, services, assets, opportunities, experiences, routes, entities, sources, adapters] = await Promise.all([
    supabase.from("products").select("id,sku,handle,title,body_html,vendor,product_type,published,variant_price,variant_inventory_qty").eq("published", true).not("sku", "is", null).or("title.ilike." + like + ",handle.ilike." + like + ",product_type.ilike." + like + ",vendor.ilike." + like).limit(limit),
    supabase.from("commerce_offers").select("id,source_id,title,price,currency,availability,external_url,fulfillment_mode,product_id,metadata").or("title.ilike." + like + ",availability.ilike." + like + ",fulfillment_mode.ilike." + like).limit(200),
    supabase.from("commerce_sources").select("id,enabled,checkout_mode,metadata").eq("enabled", true),
    supabase.from("resofit_network_directory").select("id,entity_type,slug,name,tagline,description,city,state,verification_status,status,public_location_label").eq("status", "active").or("name.ilike." + like + ",tagline.ilike." + like + ",description.ilike." + like + ",city.ilike." + like + ",state.ilike." + like).limit(limit),
    supabase.from("resofit_wellness_hubs").select("id,slug,name,description,address,verification_status,status").eq("status", "active").or("name.ilike." + like + ",slug.ilike." + like + ",description.ilike." + like + ",address.ilike." + like).limit(limit),
    supabase.from("resofit_wellness_hub_services").select("id,service_name,description,price,currency,status,hub_id").eq("status", "active").or("service_name.ilike." + like + ",description.ilike." + like).limit(limit),
    supabase.from("content_asset_registry").select("id,source_provider,canonical_url,asset_type,visual_summary,alt_text,search_topics,content_pillar,qa_status").eq("qa_status", "approved").or("visual_summary.ilike." + like + ",alt_text.ilike." + like + ",content_pillar.ilike." + like).limit(limit),
    supabase.from("content_opportunities").select("id,platform,intent,topic,search_gap,hook,canonical_url,status,product_sku").or("topic.ilike." + like + ",search_gap.ilike." + like + ",hook.ilike." + like + ",intent.ilike." + like).limit(limit),
    supabase.from("experience_page_registry").select("id,page_type,source_type,source_id,source_key,slug,canonical_path,status,manifest,seo").eq("status", "published").limit(100),
    supabase.from("resofit_canonical_routes").select("id,entity_id,path,destination_type,action,status").eq("status", "active").limit(100),
    supabase.from("resofit_canonical_entities").select("id,entity_type,canonical_key,name,description,product_id,status,metadata").in("status", ["active","published"]).or("name.ilike." + like + ",canonical_key.ilike." + like + ",description.ilike." + like).limit(limit),
    supabase.from("resofit_ecosystem_source_registry").select("id,theme,canonical_url,runtime_status,runtime_ok,content_type,verification_method,metadata").or("theme.ilike." + like + ",canonical_url.ilike." + like + ",content_type.ilike." + like).limit(limit),
    supabase.from("resofit_adapter_registry").select("adapter,category,enabled,critical,config").or("adapter.ilike." + like + ",category.ilike." + like).limit(limit)
  ]);
  const results: any[] = [];
  const add = (items: any[] | null, mapper: (x:any)=>any) => (items ?? []).forEach(x => results.push(mapper(x)));
  add(products.data, p => ({ id: "product:" + p.id, type: "product", title: p.title, description: p.body_html ? p.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) : null, href: "/product/" + p.handle, source: "canonical catalog", metadata: { sku: p.sku, price: p.variant_price, inventory: p.variant_inventory_qty } }));
  const offerSourceById = new Map((offerSources.data ?? []).map((s: any) => [s.id, s]));
  const eligibleOffers = (offers.data ?? []).filter((o: any) => {
    const source: any = offerSourceById.get(o.source_id);
    const offerMeta = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
    const sourceMeta = source?.metadata && typeof source.metadata === "object" ? source.metadata : {};
    if (!source || source.enabled !== true || o.availability !== "available" || !Number.isFinite(Number(o.price)) || Number(o.price) <= 0 || offerMeta.discovery_only === true) return false;
    if (source.checkout_mode === "internal") return true;
    return source.checkout_mode === "external"
      && sourceMeta.external_checkout_enabled === true
      && sourceMeta.product_links_verified === true
      && sourceMeta.checkout_flow_verified === true
      && offerMeta.direct_product_url_verified === true
      && offerMeta.stock_verified === true
      && Boolean(o.external_url);
  }).slice(0, limit);
  add(eligibleOffers, o => {
    const source: any = offerSourceById.get(o.source_id);
    const sourceMeta = source?.metadata && typeof source.metadata === "object" ? source.metadata : {};
    const offerMeta = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
    return {
      id: "offer:" + o.id,
      type: "offer",
      title: o.title,
      description: [o.currency, o.price, o.fulfillment_mode].filter(Boolean).join(" · "),
      href: o.external_url || "/shop",
      source: "commerce",
      metadata: {
        availability: o.availability,
        product_id: o.product_id,
        checkout_mode: source?.checkout_mode ?? "unknown",
        external_checkout_enabled: sourceMeta.external_checkout_enabled === true,
        checkout_flow_verified: sourceMeta.checkout_flow_verified === true,
        direct_product_url_verified: offerMeta.direct_product_url_verified === true,
        stock_verified: offerMeta.stock_verified === true
      }
    };
  });
  add(network.data, n => ({ id: "network:" + n.id, type: "network", title: n.name, description: [n.tagline, n.description, n.public_location_label].filter(Boolean).join(" · ").slice(0, 220), href: "/network", source: "network directory", metadata: { entity_type: n.entity_type, verification_status: n.verification_status } }));
  add(hubs.data, h => ({ id: "hub:" + h.id, type: "wellness_location", title: h.name, description: [h.description, h.address].filter(Boolean).join(" · ").slice(0, 220), href: h.slug ? "/wellness/hubs/" + h.slug : "/wellness", source: "wellness registry", metadata: { verification_status: h.verification_status } }));
  add(services.data, s => ({ id: "service:" + s.id, type: "service", title: s.service_name, description: s.description, href: "/wellness", source: "wellness services", metadata: { price: s.price, currency: s.currency, hub_id: s.hub_id } }));
  add(assets.data, a => ({ id: "content:" + a.id, type: "content", title: a.visual_summary || a.alt_text || a.content_pillar || "ResoFit content", description: a.alt_text || a.content_pillar, href: a.canonical_url || "/knowledge", source: a.source_provider || "content registry", metadata: { asset_type: a.asset_type, topics: a.search_topics } }));
  add(opportunities.data, o => ({ id: "story:" + o.id, type: "story", title: o.topic || o.hook || "ResoFit story", description: o.search_gap || o.hook, href: o.canonical_url || "/knowledge", source: o.platform || "content intelligence", metadata: { intent: o.intent, product_sku: o.product_sku } }));
  for (const e of experiences.data ?? []) {
    const manifest = e.manifest ?? {};
    const title = manifest.title || manifest.name || e.seo?.title || e.slug;
    const hay = [title, e.slug, e.page_type, e.source_key].filter(Boolean).join(" ").toLowerCase();
    if (hay.includes(q.toLowerCase())) results.push({ id: "experience:" + e.id, type: "experience", title, description: manifest.description || e.seo?.description || null, href: e.canonical_path || "/knowledge", source: "experience registry" });
  }
  add(entities.data, e => ({ id: "entity:" + e.id, type: e.entity_type === "program" ? "program" : e.entity_type === "journey" ? "experience" : "entity", title: e.name || e.canonical_key, description: e.description, href: e.metadata?.canonical_path || "/knowledge", source: "canonical entity registry", metadata: { canonical_key: e.canonical_key, product_id: e.product_id, status: e.status } }));
  add(sources.data, s => ({ id: "source:" + s.id, type: "external_api", title: s.theme, description: [s.content_type, s.runtime_ok ? "runtime verified" : "runtime not verified", s.verification_method].filter(Boolean).join(" · "), href: s.canonical_url || "/knowledge", source: "ecosystem source registry", metadata: { runtime_status: s.runtime_status, runtime_ok: s.runtime_ok, verification_method: s.verification_method, ...(s.metadata || {}) } }));
  add(adapters.data, a => ({ id: "adapter:" + a.adapter, type: "external_api", title: a.adapter, description: [a.category, a.enabled ? "enabled" : "disabled", a.critical ? "critical" : "non-critical"].join(" · "), href: "/knowledge", source: "adapter registry", metadata: { category: a.category, enabled: a.enabled, critical: a.critical, config: a.config } }));
  for (const r of routes.data ?? []) {
    const hay = [r.path, r.destination_type, r.action].filter(Boolean).join(" ").toLowerCase();
    if (hay.includes(q.toLowerCase())) results.push({ id: "route:" + r.id, type: "experience", title: r.path, description: r.destination_type || r.action || null, href: r.path, source: "route registry" });
  }
  const low = q.toLowerCase();
  const staticSurfaces = [
    ["coach-buchi", "people_experience", "Coach Buchi", "Coach Buchi HQ, philosophy, leadership and AI-SI productivity.", "/coach-buchi"],
    ["knowledge", "knowledge", "Knowledge Hub", "ResoFit knowledge, learning and practical wellness information.", "/knowledge"],
    ["story", "stories", "Success Stories", "Customer journeys and ResoFit stories.", "/success-stories"],
    ["social", "social", "Community & Social", "Community, social content and engagement surfaces.", "/community"],
    ["chatb2k", "chatb2k", "ChatB2K™ Knowledge", "Conversational ecosystem knowledge and personalized discovery.", "/me"],
    ["external api", "external_api", "External APIs & Integrations", "Connected external services, APIs and integration surfaces registered by ResoFit.", "/knowledge"],
    ["program", "programs", "Programs", "ResoFit programs, journeys and guided experiences.", "/shop"],
    ["blog", "blogs", "Blogs & Articles", "ResoFit articles, educational posts and editorial knowledge.", "/knowledge"]
  ];
  for (const [key,type,title,description,href] of staticSurfaces) if (low.includes(key) || low.includes(title.toLowerCase().split(" ")[0])) results.push({ id: "surface:" + key, type, title, description, href, source: "ResoFit ecosystem" });
  const dedup = new Map<string, any>();
  for (const r of results) dedup.set(r.id, r);
  const ordered = Array.from(dedup.values()).slice(0, Math.min(limit * 8, 60));
  const groups: Record<string, number> = {};
  for (const r of ordered) groups[r.type] = (groups[r.type] ?? 0) + 1;
  return { query: rawQuery, results: ordered, groups };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const url = new URL(req.url); const parts = url.pathname.split("/").filter(Boolean); const fnIndex = parts.indexOf("catalog-public"); const routeParts = fnIndex >= 0 ? parts.slice(fnIndex + 1) : parts; const resource = routeParts[0] ?? "products";
    if (resource === "collections") {
      const slug = routeParts[1] ?? url.searchParams.get("slug");
      let query = supabase.from("experience_page_registry")
        .select("id,page_type,source_type,source_key,slug,canonical_path,template_key,status,version,manifest,seo,commerce,access,media")
        .eq("page_type", "commerce_collection")
        .eq("template_key", "commerce_collection_v1")
        .eq("status", "published");
      if (slug) query = query.eq("slug", safeTerm(slug));
      const { data, error } = await query.order("slug", { ascending: true }).limit(100);
      if (error) return json({ error: "collection_lookup_failed" }, 500);
      return json({ data: data ?? [], total: (data ?? []).length }, 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    }
    if (resource === "context") return json({ data: context(url.searchParams.get("country")) }, 200, "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    if (resource === "search") return json(await searchEcosystem(url.searchParams.get("q") ?? "", Math.min(Math.max(Number(url.searchParams.get("limit") ?? 8), 1), 12)), 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    if (resource === "assets") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 500), 1), 1000); const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0); const sku = url.searchParams.get("sku"); const handle = url.searchParams.get("handle");
      let query = supabase.from("resofit_catalog_assets").select("product_id,sku,handle,role,filename,canonical_url,full_file_path,image_position").eq("web_ready", true).not("canonical_url", "is", null).order("sku", { ascending: true }).order("image_position", { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1);
      if (sku) query = query.eq("sku", sku); else if (handle) query = query.eq("handle", handle);
      const { data, error } = await query; if (error) return json({ error: error.message }, 500); return json({ data: data ?? [], total: (data ?? []).length, limit, offset }, 200, "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    }
    const select = "id,sku,handle,title,vendor,product_type,tags,published,variant_price,variant_inventory_qty,fulfillment_mode,image_src,body_html";
    const base = supabase.from("products").select(select).eq("published", true).not("sku", "is", null);
    if (resource === "product") { const key = routeParts[1] ?? url.searchParams.get("sku") ?? url.searchParams.get("handle"); if (!key) return json({ error: "sku or handle is required" }, 400); const { data, error } = await base.or("sku.eq." + key + ",handle.eq." + key).maybeSingle(); if (error) return json({ error: error.message }, 500); if (!data) return json({ error: "Not found" }, 404); return json({ data }); }
    if (resource === "recommendations") { const intent = url.searchParams.get("intent") ?? url.searchParams.get("goal") ?? url.searchParams.get("category") ?? ""; const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 6), 1), 20); const { data, error } = await base.limit(100); if (error) return json({ error: error.message }, 500); const ranked = (data ?? []).map((p: any) => ({ ...p, recommendation_score: scoreProduct(p, intent) })).sort((a: any, b: any) => b.recommendation_score - a.recommendation_score || Number(b.variant_inventory_qty ?? 0) - Number(a.variant_inventory_qty ?? 0)).slice(0, limit); return json({ data: ranked, intent }); }
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200); const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0); const sku = url.searchParams.get("sku"); const q = url.searchParams.get("q"); let query = base.range(offset, offset + limit - 1).order("title", { ascending: true }); if (sku) query = query.eq("sku", sku); if (q) query = query.or("title.ilike.%" + safeTerm(q) + "%,handle.ilike.%" + safeTerm(q) + "%,product_type.ilike.%" + safeTerm(q) + "%"); const { data, error } = await query; if (error) return json({ error: error.message }, 500); return json({ data: data ?? [], total: (data ?? []).length, limit, offset });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Catalog API error" }, 500); }
});