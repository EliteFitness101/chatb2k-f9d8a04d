import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const origins = new Set([
  "https://resofit.fit",
  "https://www.resofit.fit",
  "https://shop.resofit.fit",
  "https://store.resofit.fit",
  "https://elite.resofit.fit",
  "https://account.resofit.fit",
]);
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && origins.has(origin) ? origin : "https://resofit.fit",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
});
const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

type Product = {
  id: string; sku: string; handle: string; title: string; vendor: string | null;
  product_type: string | null; tags: string[] | null; variant_price: number | null;
  variant_inventory_qty: number | null; fulfillment_mode: string | null;
};
const routes: Record<string, string> = {
  "elite.resofit.fit": "https://elite.resofit.fit/shop",
  "store.resofit.fit": "https://store.resofit.fit/shop",
  "shop.resofit.fit": "https://shop.resofit.fit",
  "resofit.fit": "https://resofit.fit/shop",
  "www.resofit.fit": "https://resofit.fit/shop",
  "account.resofit.fit": "https://elite.resofit.fit/shop",
};
const rules: Record<string, string[]> = {
  creator: ["ring light", "microphone", "lapel", "gimbal", "stream", "creator", "capture card", "studio", "lighting", "remote"],
  fitness: ["ab roller", "resistance band", "dumbbell", "pull-up", "pull up", "weight plate", "power rack", "treadmill", "spin bike", "fitness", "workout"],
  digital: ["masterclass", "toolkit", "course", "digital", "guide", "meal", "workout", "blueprint"],
  coaching: ["coaching", "coach", "consultation", "fitness evolution", "naijafit"],
};
function score(p: Product, terms: string[]) {
  const hay = [p.title, p.product_type, ...(p.tags ?? [])].join(" ").toLowerCase();
  return terms.reduce((n, t) => n + (hay.includes(t) ? (p.title.toLowerCase().includes(t) ? 4 : 2) : 0), 0);
}
function intentFor(domain: string, intent: string) {
  const value = (intent + " " + domain).toLowerCase();
  if (/creator|stream|bigo|tiktok|youtube|studio|media|elite\\.resofit\\.fit/.test(value)) return "creator";
  if (/coach|booking|consult/.test(value)) return "coaching";
  if (/digital|course|masterclass|template|meal plan/.test(value)) return "digital";
  return "fitness";
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (req.method !== "POST") return json({ error: "POST required" }, 405, origin);
  if (origin && !origins.has(origin)) return json({ error: "origin_not_allowed" }, 403, origin);
  try {
    const body = await req.json().catch(() => ({}));
    const host = String(body.domain || req.headers.get("x-forwarded-host") || "resofit.fit").toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    const requestedIntent = String(body.intent || body.goal || "");
    const intent = intentFor(host, requestedIntent);
    const limit = Math.min(Math.max(Number(body.limit || 6), 1), 12);
    const { data, error } = await db.from("products")
      .select("id,sku,handle,title,vendor,product_type,tags,variant_price,variant_inventory_qty,fulfillment_mode")
      .eq("published", true)
      .not("sku", "is", null)
      .in("fulfillment_mode", ["physical", "digital", "hybrid", "service"])
      .limit(300);
    if (error) throw error;
    const products = (data || []) as Product[];
    const terms = rules[intent] || rules.fitness;
    const candidateProducts = products.map(p => ({ p, score: score(p, terms) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    let inventoryRows: any[] = [];
    if (candidateProducts.length) {
      const { data: inventory, error: inventoryError } = await db.from("resofit_catalog_inventory_sources")
        .select("sku,quantity,reserved_quantity,availability_status")
        .in("sku", candidateProducts.map(x => x.p.sku));
      if (inventoryError) throw inventoryError;
      inventoryRows = inventory || [];
    }
    const availableBySku = new Map<string, number>();
    for (const row of inventoryRows) {
      if (row.availability_status !== "available") continue;
      const available = Math.max(0, Number(row.quantity || 0) - Number(row.reserved_quantity || 0));
      availableBySku.set(row.sku, (availableBySku.get(row.sku) || 0) + available);
    }
    const ranked = candidateProducts.map(({ p, score: relevance }) => {
      const inventoryAvailable = availableBySku.get(p.sku) || 0;
      const requiresInventory = p.fulfillment_mode === "physical" || p.fulfillment_mode === "hybrid";
      return {
        sku: p.sku, title: p.title, handle: p.handle, vendor: p.vendor,
        product_type: p.product_type, fulfillment_mode: p.fulfillment_mode,
        price_ngn: p.variant_price, inventory_qty: inventoryAvailable,
        product_path: "/product/" + p.handle, relevance,
        checkout_eligible: p.variant_price !== null && p.variant_price > 0 &&
          (!requiresInventory || inventoryAvailable > 0),
      };
    });
    // Recommend published hybrid collection journeys without copying supplier prices,
    // stock or purchase permissions into the recommendation response.
    const { data: collectionRows, error: collectionError } = await db.from("experience_page_registry")
      .select("slug,canonical_path,manifest,commerce,status")
      .eq("page_type", "commerce_collection")
      .eq("template_key", "commerce_collection_v1")
      .eq("status", "published")
      .limit(100);
    if (collectionError) throw collectionError;
    const hybridCollections = (collectionRows || []).map((row: any) => {
      const manifest = row.manifest && typeof row.manifest === "object" ? row.manifest : {};
      const items = Array.isArray(manifest.items) ? manifest.items : [];
      const searchText = [
        row.slug, manifest.title, manifest.description,
        ...items.map((item: any) => item.title || ""),
        ...items.map((item: any) => item.kind || ""),
        ...items.map((item: any) => item.fulfillment_mode || ""),
      ].join(" ").toLowerCase();
      const relevance = (rules[intent] || rules.fitness).reduce((n, term) => n + (searchText.includes(term) ? 2 : 0), 0);
      if (!relevance) return null;
      return {
        slug: row.slug,
        title: String(manifest.title || row.slug),
        description: String(manifest.description || ""),
        path: row.canonical_path,
        relevance,
        components: {
          first_party_products: items.filter((item: any) => item.kind === "first_party_product").length,
          digital: items.filter((item: any) => item.fulfillment_mode === "digital").length,
          services: items.filter((item: any) => item.kind === "elite_service" || item.kind === "service").length,
          bookings: items.filter((item: any) => item.kind === "booking").length,
          external_supplier_candidates: items.filter((item: any) => item.kind === "external_candidate").length,
        },
        checkout_boundaries: {
          first_party_authority: manifest.checkout?.first_party_authority || "paystack-init",
          elite_service_authority: manifest.checkout?.elite_service_authority || "elite-media-checkout",
          mixed_external_cart_supported: manifest.checkout?.mixed_external_cart_supported === true,
          external_candidate_purchase_enabled: manifest.checkout?.external_candidate_purchase_enabled === true,
        },
      };
    }).filter(Boolean).sort((a: any, b: any) => b.relevance - a.relevance).slice(0, 4);
    let trial: Record<string, unknown> | null = null;
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) {
      const { data: authData } = await db.auth.getUser(token);
      if (authData?.user?.id) {
        const { data: states } = await db.from("resofit_entitlement_states")
          .select("entitlement_key,status,access,start_at,end_at,grace_end_at,source_product")
          .eq("user_id", authData.user.id)
          .order("updated_at", { ascending: false })
          .limit(20);
        const now = Date.now();
        const candidate = (states || []).find((s: any) =>
          ["elite_media", "elite_creator", "creator_studio"].includes(String(s.entitlement_key || "").toLowerCase()) ||
          ["ELT-SUB-TRL", "ELT-SUB-OPR"].includes(String(s.source_product || "").toUpperCase()));
        if (candidate) {
          const end = candidate.end_at ? new Date(candidate.end_at).getTime() : null;
          trial = {
            entitlement_key: candidate.entitlement_key,
            status: candidate.status,
            access: candidate.access,
            end_at: candidate.end_at,
            expires_within_72h: end !== null && end >= now && end - now <= 72 * 60 * 60 * 1000,
            upgrade_destination: "https://elite.resofit.fit/shop",
          };
        }
      }
    }
    return json({
      ok: true, engine: "ChatB2K Omni commerce recommendations",
      version: 3, intent, arrival_domain: host,
      destination: routes[host] || "https://resofit.fit/shop",
      recommendations: ranked,
      hybrid_collections: hybridCollections,
      collection_state: hybridCollections.length ? "published_collections_available" : "no_published_hybrid_collections",
      catalog_gap: ranked.length === 0 && hybridCollections.length === 0
        ? { intent, discovery_required: true, route: "chatb2k-sourcing-engine" }
        : null,
      trial_upgrade: trial,
      checkout_authority: "existing paystack-init; recommendation endpoint never initializes payment",
      generated_at: new Date().toISOString(),
    }, 200, origin);
  } catch (error) {
    console.error("chatb2k-commerce-recommendations", String(error));
    return json({ error: "recommendation_unavailable" }, 500, origin);
  }
});