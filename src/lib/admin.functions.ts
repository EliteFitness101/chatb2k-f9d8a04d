import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const isoStart = startOfDay.toISOString();

    const { data: todayRows } = await supabaseAdmin
      .from("revenue_events")
      .select("amount_minor")
      .gte("occurred_at", isoStart);

    const today_revenue_minor = (todayRows ?? []).reduce(
      (s, r) => s + Number(r.amount_minor ?? 0),
      0,
    );
    const today_orders = todayRows?.length ?? 0;

    const { count: landingCount } = await supabaseAdmin
      .from("funnel_events")
      .select("*", { count: "exact", head: true })
      .eq("event_name", "landing_view")
      .gte("occurred_at", isoStart);

    const conversion_rate =
      landingCount && landingCount > 0 ? today_orders / landingCount : 0;

    const { data: allRows } = await supabaseAdmin
      .from("revenue_events")
      .select("reference, amount_minor, currency, email, product_sku, source, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(500);

    const bySrcMap = new Map<string, { amount_minor: number; count: number }>();
    const byProdMap = new Map<string, { amount_minor: number; count: number }>();
    for (const r of allRows ?? []) {
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
    }

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
    };
  });