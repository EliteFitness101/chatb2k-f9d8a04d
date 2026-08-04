import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { SectionHeading } from "@/components/site/SectionHeading";
import { getRevenueDashboard } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminRevenue,
});

function fmtNGN(minor: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(minor / 100);
}

function AdminRevenue() {
  const fetchDashboard = useServerFn(getRevenueDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: () => fetchDashboard(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 text-center text-gold/80 tracking-[0.3em] uppercase text-xs animate-pulse">
          Loading dashboard…
        </div>
      </>
    );
  }

  if (error || !data || !data.ok) {
    return (
      <>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
          <h1 className="font-display text-3xl">Forbidden</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {data?.error ?? "Admin access required."}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Revenue OS"
          title="Today's Revenue Console"
          sub="Live signal: attributable revenue, conversion, and source mix."
        />
        <div className="mt-10 grid sm:grid-cols-4 gap-4">
          <StatCard label="Net Revenue (Today)" value={fmtNGN(data.brain.net_revenue_today_minor)} />
          <StatCard label="Orders Today" value={String(data.today_orders)} />
          <StatCard
            label="Avg Order Value"
            value={fmtNGN(
              data.today_orders > 0
                ? Math.round(data.today_revenue_minor / data.today_orders)
                : 0,
            )}
          />
          <StatCard
            label="Conversion Rate"
            value={`${(data.conversion_rate * 100).toFixed(2)}%`}
          />
        </div>

        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <StatCard label="Forecast — Today" value={fmtNGN(data.brain.forecast.today_minor)} />
          <StatCard label="Forecast — 7 Days" value={fmtNGN(data.brain.forecast.projected_7d_minor)} />
          <StatCard label="Forecast — 30 Days" value={fmtNGN(data.brain.forecast.projected_30d_minor)} />
        </div>

        <div className="mt-10 grid lg:grid-cols-2 gap-6">
          <Panel title="AI CEO — Top 3 Decisions">
            <Table
              head={["#", "Action", "Predicted ROI", "Revenue Impact", "Confidence"]}
              rows={data.brain.top_decisions.map((d) => [
                String(d.priority_rank),
                d.label ?? d.type,
                `${(d.predicted_roi * 100).toFixed(1)}%`,
                fmtNGN(d.revenue_impact),
                `${(d.confidence * 100).toFixed(0)}%`,
              ])}
            />
          </Panel>
          <Panel title="Refund Impact (Today)">
            <Table
              head={["Metric", "Value"]}
              rows={[
                ["Gross Revenue", fmtNGN(data.brain.gross_revenue_today_minor)],
                ["Refund / Chargeback Count", String(data.brain.refund_count_today)],
                ["Refunded Amount", fmtNGN(data.brain.refund_amount_today_minor)],
                ["Net Revenue", fmtNGN(data.brain.net_revenue_today_minor)],
              ]}
            />
          </Panel>
        </div>

        <div className="mt-6">
          <Panel title="Event Reliability Monitor">
            <Table
              head={["Metric", "Value"]}
              rows={[
                ["Avg Reliability Score", `${data.brain.reliability.avg_score} / 100`],
                ["Orphan RSID Events", String(data.brain.reliability.orphan_events)],
                ["Duplicate References", String(data.brain.reliability.duplicate_refs)],
                ["Events Scored", String(data.brain.reliability.total_scored)],
              ]}
            />
          </Panel>
        </div>

        <div className="mt-10 grid lg:grid-cols-2 gap-6">
          <Panel title="Revenue by Source">
            <Table
              rows={data.by_source.map((r) => [
                r.source,
                String(r.count),
                fmtNGN(r.amount_minor),
              ])}
              head={["Source", "Orders", "Revenue"]}
            />
          </Panel>
          <Panel title="Revenue by Product">
            <Table
              rows={data.by_product.map((r) => [
                r.product_sku,
                String(r.count),
                fmtNGN(r.amount_minor),
              ])}
              head={["Product SKU", "Orders", "Revenue"]}
            />
          </Panel>
        </div>

        <div className="mt-10">
          <Panel title="Latest Payments">
            <Table
              head={["When", "Reference", "Email", "SKU", "Source", "Amount"]}
              rows={data.latest.map((r) => [
                new Date(r.occurred_at).toLocaleString(),
                r.reference,
                r.email ?? "—",
                r.product_sku ?? "—",
                r.source ?? "(direct)",
                fmtNGN(r.amount_minor),
              ])}
            />
          </Panel>
        </div>

        <div className="mt-10 grid lg:grid-cols-2 gap-6">
          <Panel title="Funnel — Today">
            <Table
              head={["Stage", "Count", "Conv %", "Drop-off %"]}
              rows={[
                ["Landing Views", String(data.funnel.landing_views), "—", "—"],
                [
                  "Product Views",
                  String(data.funnel.product_views),
                  `${(data.funnel.conv_landing_to_product * 100).toFixed(1)}%`,
                  `${(data.funnel.dropoff_landing_to_product * 100).toFixed(1)}%`,
                ],
                [
                  "Checkout Starts",
                  String(data.funnel.checkout_starts),
                  `${(data.funnel.conv_product_to_checkout * 100).toFixed(1)}%`,
                  `${(data.funnel.dropoff_product_to_checkout * 100).toFixed(1)}%`,
                ],
                [
                  "Purchases",
                  String(data.funnel.purchases),
                  `${(data.funnel.conv_checkout_to_purchase * 100).toFixed(1)}%`,
                  `${(data.funnel.dropoff_checkout_to_purchase * 100).toFixed(1)}%`,
                ],
              ]}
            />
          </Panel>
          <Panel title="Revenue Intelligence">
            <Table
              head={["Metric", "Value"]}
              rows={[
                ["Avg Order Value", fmtNGN(data.intelligence.aov_minor)],
                [
                  "Top SKU — Revenue",
                  data.intelligence.top_sku_by_revenue
                    ? `${data.intelligence.top_sku_by_revenue.product_sku} (${fmtNGN(data.intelligence.top_sku_by_revenue.amount_minor)})`
                    : "—",
                ],
                [
                  "Top SKU — Conversions",
                  data.intelligence.top_sku_by_conversions
                    ? `${data.intelligence.top_sku_by_conversions.product_sku} (${data.intelligence.top_sku_by_conversions.count})`
                    : "—",
                ],
                [
                  "Top SKU — AOV",
                  data.intelligence.top_sku_by_aov
                    ? `${data.intelligence.top_sku_by_aov.product_sku} (${fmtNGN(data.intelligence.top_sku_by_aov.aov_minor)})`
                    : "—",
                ],
              ]}
            />
          </Panel>
        </div>

        <div className="mt-6 grid sm:grid-cols-4 gap-4">
          <StatCard
            label="Assess → Purchase"
            value={`${(data.intelligence.assess_to_purchase_rate * 100).toFixed(2)}%`}
          />
          <StatCard
            label="Checkout Completion"
            value={`${(data.intelligence.checkout_completion_rate * 100).toFixed(2)}%`}
          />
          <StatCard
            label="Repeat Purchase Rate"
            value={`${(data.intelligence.repeat_purchase_rate * 100).toFixed(2)}%`}
          />
          <StatCard
            label={`Referral Revenue (${data.intelligence.referral_orders})`}
            value={fmtNGN(data.intelligence.referral_revenue_minor)}
          />
        </div>

        <div className="mt-6">
          <Panel title="Revenue by UTM Campaign">
            <Table
              head={["Source", "Campaign", "Orders", "Revenue"]}
              rows={data.intelligence.by_campaign.map((r) => [
                r.utm_source,
                r.utm_campaign,
                String(r.count),
                fmtNGN(r.amount_minor),
              ])}
            />
          </Panel>
        </div>
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-md p-5">
      <div className="text-xs uppercase tracking-[0.3em] text-gold/80">{label}</div>
      <div className="font-display text-3xl mt-2 text-gold-gradient">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-md p-5">
      <div className="text-xs uppercase tracking-[0.3em] text-gold/80 mb-4">{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) {
    return <div className="text-sm text-muted-foreground">No data yet.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-[var(--glass-border)]">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--glass-border)]/40">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}