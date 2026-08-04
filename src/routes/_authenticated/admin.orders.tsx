import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AdminGate,
  AdminLoading,
  DataTable,
  Panel,
  StatCard,
  StatusPill,
  fmtMinor,
} from "@/components/admin/AdminUI";
import { getOrdersConsole } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: OrdersDomain,
});

function OrdersDomain() {
  const fetchOrders = useServerFn(getOrdersConsole);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => fetchOrders(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {data.by_status.slice(0, 4).map((s) => (
          <StatCard key={s.status} label={s.status} value={s.count} />
        ))}
      </div>
      <Panel title="Order Console">
        <DataTable
          rows={data.rows}
          columns={[
            { key: "ref", label: "Reference", render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
            { key: "st", label: "Status", render: (r) => <StatusPill value={r.status} /> },
            { key: "rail", label: "Rail", render: (r) => r.rail },
            { key: "hub", label: "Hub", render: (r) => r.hub_name ?? "Unassigned" },
            { key: "cty", label: "Country", render: (r) => r.customer_country ?? "—" },
            { key: "em", label: "Customer", render: (r) => r.customer_email ?? "—" },
            {
              key: "amt",
              label: "Amount",
              align: "right",
              render: (r) => fmtMinor(r.amount_minor, r.currency),
            },
          ]}
        />
      </Panel>
    </div>
  );
}