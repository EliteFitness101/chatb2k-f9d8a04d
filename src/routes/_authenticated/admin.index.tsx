import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminGate,
  AdminLoading,
  DataTable,
  Panel,
  StatCard,
  StatusPill,
  fmtMinor,
} from "@/components/admin/AdminUI";
import { getGlobalOverview, setAlertStatus } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: GlobalOverview,
});

function GlobalOverview() {
  const fetchOverview = useServerFn(getGlobalOverview);
  const updateAlert = useServerFn(setAlertStatus);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
  });
  const ack = useMutation({
    mutationFn: (id: string) => updateAlert({ data: { id, status: "resolved" as const } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-overview"] }),
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Net Revenue Today" value={fmtMinor(data.net_revenue_minor)} tone="good" />
        <StatCard
          label="Orders Today"
          value={data.orders_today}
          hint={`${data.paid_orders_today} paid`}
        />
        <StatCard
          label="Assessments Today"
          value={data.assessments_today}
          hint={`${data.completed_assessments_today} completed`}
        />
        <StatCard
          label="Open Alerts"
          value={data.open_alerts.length}
          tone={data.open_alerts.length > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Gross Revenue" value={fmtMinor(data.gross_revenue_minor)} />
        <StatCard label="Refunded" value={fmtMinor(data.refunded_minor)} tone="warn" />
        <StatCard
          label="Low-Stock SKUs"
          value={data.low_stock_skus}
          tone={data.low_stock_skus > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Webhook Rejections"
          value={data.webhook_rejections_today}
          tone={data.webhook_rejections_today > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel
          title="Fulfillment Pipeline"
          action={
            <Link to="/admin/fulfillment" className="text-[10px] uppercase tracking-[0.25em] text-gold">
              Open
            </Link>
          }
        >
          <DataTable
            rows={data.fulfillment_by_status}
            empty="No fulfillment orders yet."
            columns={[
              { key: "s", label: "Status", render: (r) => <StatusPill value={r.status} /> },
              { key: "c", label: "Count", align: "right", render: (r) => r.count },
            ]}
          />
        </Panel>

        <Panel title="Operational Alerts">
          <DataTable
            rows={data.open_alerts}
            empty="All clear — no open alerts."
            columns={[
              { key: "l", label: "Level", render: (r) => <StatusPill value={r.level} /> },
              { key: "t", label: "Alert", render: (r) => r.title },
              { key: "c", label: "Category", render: (r) => r.category },
              {
                key: "a",
                label: "",
                align: "right",
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => ack.mutate(r.id)}
                    className="text-[10px] uppercase tracking-[0.25em] text-gold hover:underline"
                  >
                    Resolve
                  </button>
                ),
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}