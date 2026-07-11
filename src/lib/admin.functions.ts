import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calculateROI,
  forecastRevenue,
  reliabilityScore,
  type RankedAction,
} from "@/lib/revenue-brain";

export interface DashboardRow {
  reference: string;
  amount_minor: number;
  currency: string;
  email: string | null;
  product_sku: string | null;
  source: string | null;
  occurred_at: string;
}

export interface RevenueDashboard {
  ok: boolean;
  error?: string;
  today_revenue_minor: number;
  today_orders: number;
  conversion_rate: number; // 0..1
  by_source: { source: string; amount_minor: number; count: number }[];
  by_product: { product_sku: string; amount_minor: number; count: number }[];
  latest: DashboardRow[];
  funnel: {
    landing_views: number;
    product_views: number;
    checkout_starts: number;
    purchases: number;
    conv_landing_to_product: number;
    conv_product_to_checkout: number;
    conv_checkout_to_purchase: number;
    dropoff_landing_to_product: number;
    dropoff_product_to_checkout: number;
    dropoff_checkout_to_purchase: number;
  };
  intelligence: {
    aov_minor: number;
    top_sku_by_revenue: { product_sku: string; amount_minor: number } | null;
    top_sku_by_conversions: { product_sku: string; count: number } | null;
    top_sku_by_aov: { product_sku: string; aov_minor: number } | null;
    by_campaign: { utm_source: string; utm_campaign: string; amount_minor: number; count: number }[];
    assess_to_purchase_rate: number;
    checkout_completion_rate: number;
    repeat_purchase_rate: number;
    referral_revenue_minor: number;
    referral_orders: number;
  };
  brain: {
    net_revenue_today_minor: number;
    gross_revenue_today_minor: number;
    refund_count_today: number;
    refund_amount_today_minor: number;
    forecast: {
      today_minor: number;
      projected_7d_minor: number;
      projected_30d_minor: number;
    };
    top_decisions: RankedAction[];
    reliability: {
      avg_score: number;
      orphan_events: number;
      duplicate_refs: number;
      total_scored: number;
    };
  };
}

export const getRevenueDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RevenueDashboard> => {
    const { supabase, userId } = context;

    // Admin check
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return {
        ok: false,
        error: "Forbidden",
        today_revenue_minor: 0,
        today_orders: 0,
        conversion_rate: 0,
        by_source: [],
        by_product: [],
        latest: [],
        funnel: {
          landing_views: 0, product_views: 0, checkout_starts: 0, purchases: 0,
          conv_landing_to_product: 0, conv_product_to_checkout: 0, conv_checkout_to_purchase: 0,
          dropoff_landing_to_product: 0, dropoff_product_to_checkout: 0, dropoff_checkout_to_purchase: 0,
        },
        intelligence: {
          aov_minor: 0, top_sku_by_revenue: null, top_sku_by_conversions: null,
          top_sku_by_aov: null, by_campaign: [],
          assess_to_purchase_rate: 0, checkout_completion_rate: 0,
          repeat_purchase_rate: 0, referral_revenue_minor: 0, referral_orders: 0,
        },
        brain: {
          net_revenue_today_minor: 0,
          gross_revenue_today_minor: 0,
          refund_count_today: 0,
          refund_amount_today_minor: 0,
          forecast: { today_minor: 0, projected_7d_minor: 0, projected_30d_minor: 0 },
          top_decisions: [],
          reliability: { avg_score: 0, orphan_events: 0, duplicate_refs: 0, total_scored: 0 },
        },
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const isoStart = startOfDay.toISOString();

    const { data: todayRows } = await supabaseAdmin
      .from("revenue_events")
      .select("amount_minor, status")
      .gte("occurred_at", isoStart);

    const todayList = (todayRows ?? []) as Array<{ amount_minor: number | null; status?: string | null }>;
    const gross_revenue_today_minor = todayList.reduce(
      (s, r) => s + Number(r.amount_minor ?? 0),
      0,
    );
    const refundsToday = todayList.filter(
      (r) => r.status === "refunded" || r.status === "chargeback",
    );
    const refund_amount_today_minor = refundsToday.reduce(
      (s, r) => s + Number(r.amount_minor ?? 0),
      0,
    );
    const today_revenue_minor =
      gross_revenue_today_minor - refund_amount_today_minor;
    const today_orders = todayList.filter(
      (r) => r.status !== "refunded" && r.status !== "chargeback",
    ).length;

    const { count: landingCount } = await supabaseAdmin
      .from("funnel_events")
      .select("*", { count: "exact", head: true })
      .eq("event_name", "landing_view")
      .gte("occurred_at", isoStart);

    const conversion_rate =
      landingCount && landingCount > 0 ? today_orders / landingCount : 0;

    const { data: allRows } = await supabaseAdmin
      .from("revenue_events")
      .select("reference, amount_minor, currency, email, product_sku, source, occurred_at, utm, rsid, status")
      .order("occurred_at", { ascending: false })
      .limit(500);

    const bySrcMap = new Map<string, { amount_minor: number; count: number }>();
    const byProdMap = new Map<string, { amount_minor: number; count: number }>();
    const byCampaignMap = new Map<string, { utm_source: string; utm_campaign: string; amount_minor: number; count: number }>();
    for (const r of allRows ?? []) {
      if (r.status === "refunded" || r.status === "chargeback") continue;
      const src = r.source || "(direct)";
      const prod = r.product_sku || "(unknown)";
      const s = bySrcMap.get(src) ?? { amount_minor: 0, count: 0 };
      s.amount_minor += Number(r.amount_minor ?? 0);
      s.count += 1;
      bySrcMap.set(src, s);
      const p = byProdMap.get(prod) ?? { amount_minor: 0, count: 0 };
      p.amount_minor += Number(r.amount_minor ?? 0);
      p.count += 1;
      byProdMap.set(prod, p);
      const utm = ((r as { utm?: Record<string, string> | null }).utm ?? {}) as Record<string, string>;
      const utm_source = utm.utm_source || "(direct)";
      const utm_campaign = utm.utm_campaign || "(none)";
      const ckey = `${utm_source}::${utm_campaign}`;
      const c = byCampaignMap.get(ckey) ?? { utm_source, utm_campaign, amount_minor: 0, count: 0 };
      c.amount_minor += Number(r.amount_minor ?? 0);
      c.count += 1;
      byCampaignMap.set(ckey, c);
    }

    // Funnel: today
    const countEvent = async (name: string) => {
      const { count } = await supabaseAdmin
        .from("funnel_events")
        .select("*", { count: "exact", head: true })
        .eq("event_name", name)
        .gte("occurred_at", isoStart);
      return count ?? 0;
    };
    const [landing_views, product_views, checkout_starts] = await Promise.all([
      Promise.resolve(landingCount ?? 0),
      countEvent("product_view"),
      countEvent("checkout_started"),
    ]);
    const purchases = today_orders;
    const pct = (a: number, b: number) => (b > 0 ? a / b : 0);

    // Intelligence
    const top_sku_by_revenue =
      [...byProdMap.entries()]
        .map(([product_sku, v]) => ({ product_sku, amount_minor: v.amount_minor }))
        .sort((a, b) => b.amount_minor - a.amount_minor)[0] ?? null;
    const top_sku_by_conversions =
      [...byProdMap.entries()]
        .map(([product_sku, v]) => ({ product_sku, count: v.count }))
        .sort((a, b) => b.count - a.count)[0] ?? null;
    const top_sku_by_aov =
      [...byProdMap.entries()]
        .map(([product_sku, v]) => ({
          product_sku,
          aov_minor: v.count > 0 ? Math.round(v.amount_minor / v.count) : 0,
        }))
        .sort((a, b) => b.aov_minor - a.aov_minor)[0] ?? null;
    const total_rev = [...byProdMap.values()].reduce((s, v) => s + v.amount_minor, 0);
    const total_count = [...byProdMap.values()].reduce((s, v) => s + v.count, 0);
    const aov_minor = total_count > 0 ? Math.round(total_rev / total_count) : 0;

    // Brain v2 — reliability scoring across recent events
    const seenRefs = new Set<string>();
    const dupeRefs = new Set<string>();
    let orphan = 0;
    let scoreSum = 0;
    let scored = 0;
    for (const r of allRows ?? []) {
      const ref = (r as { reference?: string | null }).reference ?? null;
      const rsid = (r as { rsid?: string | null }).rsid ?? null;
      if (ref) {
        if (seenRefs.has(ref)) dupeRefs.add(ref);
        seenRefs.add(ref);
      }
      if (!rsid) orphan += 1;
      scoreSum += reliabilityScore({
        reference: ref,
        rsid,
        source: r.source ?? null,
        seenRefs,
      });
      scored += 1;
    }
    const avg_score = scored > 0 ? Math.round(scoreSum / scored) : 0;

    // Brain v2 — forecast + ranked decisions (TOP 3)
    const forecast = forecastRevenue(today_revenue_minor);
    const ranked = calculateROI(
      [
        {
          type: "WHATSAPP_RECOVERY",
          label: "Recover abandoned checkouts via WhatsApp",
          impact_weight: Math.max(1, checkout_starts),
          data: { confidence: 0.7 },
        },
        {
          type: "OPTIMIZE_CHECKOUT",
          label: "Tighten checkout flow on top SKU",
          impact_weight: 1.2,
          data: { confidence: 0.65 },
        },
        {
          type: "CTA_OPTIMIZATION",
          label: "Re-test hero CTA copy",
          impact_weight: 1,
          data: { confidence: 0.55 },
        },
      ],
      today_revenue_minor,
    ).slice(0, 3);

    return {
      ok: true,
      today_revenue_minor,
      today_orders,
      conversion_rate,
      by_source: [...bySrcMap.entries()]
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.amount_minor - a.amount_minor),
      by_product: [...byProdMap.entries()]
        .map(([product_sku, v]) => ({ product_sku, ...v }))
        .sort((a, b) => b.amount_minor - a.amount_minor),
      latest: (allRows ?? []).slice(0, 20) as DashboardRow[],
      funnel: {
        landing_views,
        product_views,
        checkout_starts,
        purchases,
        conv_landing_to_product: pct(product_views, landing_views),
        conv_product_to_checkout: pct(checkout_starts, product_views),
        conv_checkout_to_purchase: pct(purchases, checkout_starts),
        dropoff_landing_to_product: 1 - pct(product_views, landing_views),
        dropoff_product_to_checkout: 1 - pct(checkout_starts, product_views),
        dropoff_checkout_to_purchase: 1 - pct(purchases, checkout_starts),
      },
      intelligence: {
        aov_minor,
        top_sku_by_revenue,
        top_sku_by_conversions,
        top_sku_by_aov,
        by_campaign: [...byCampaignMap.values()].sort((a, b) => b.amount_minor - a.amount_minor).slice(0, 20),
      },
      brain: {
        net_revenue_today_minor: today_revenue_minor,
        gross_revenue_today_minor,
        refund_count_today: refundsToday.length,
        refund_amount_today_minor,
        forecast,
        top_decisions: ranked,
        reliability: {
          avg_score,
          orphan_events: orphan,
          duplicate_refs: dupeRefs.size,
          total_scored: scored,
        },
      },
    };
  });
