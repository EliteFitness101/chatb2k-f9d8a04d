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
} from "@/components/admin/AdminUI";
import { getFulfillmentConsole } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/fulfillment")({
  component: FulfillmentDomain,
});

function FulfillmentDomain() {
  const fetchFulfillment = useServerFn(getFulfillmentConsole);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-fulfillment"],
    queryFn: () => fetchFulfillment(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {data.by_hub.map((h) => (
          <StatCard key={h.hub} label={h.hub} value={h.count} hint="orders in queue" />
        ))}
      </div>

      <Panel title="Hub Network">
        <DataTable
          rows={data.hubs}
          columns={[
            { key: "n", label: "Hub", render: (h) => h.name },
            { key: "t", label: "Tier", render: (h) => <StatusPill value={h.tier} /> },
            { key: "c", label: "City", render: (h) => h.city },
            { key: "cc", label: "Country", align: "right", render: (h) => h.country_code },
          ]}
        />
      </Panel>

      <Panel title="Dispatch Queue">
        <DataTable
          rows={data.rows}
          columns={[
            { key: "r", label: "Order", render: (f) => <span className="font-mono text-xs">{f.reference}</span> },
            { key: "h", label: "Hub", render: (f) => f.hub_name },
            { key: "s", label: "Status", render: (f) => <StatusPill value={f.status} /> },
            { key: "t", label: "Tracking", render: (f) => f.tracking_ref ?? "—" },
            { key: "c", label: "Country", render: (f) => f.country },
            {
              key: "d",
              label: "Created",
              align: "right",
              render: (f) => new Date(f.created_at).toLocaleString(),
            },
          ]}
        />
      </Panel>

      <Panel title="Transition History">
        <DataTable
          rows={data.recent_events}
          columns={[
            { key: "f", label: "From", render: (e) => e.from_status ?? "—" },
            { key: "t", label: "To", render: (e) => <StatusPill value={e.to_status} /> },
            {
              key: "d",
              label: "When",
              align: "right",
              render: (e) => new Date(e.created_at).toLocaleString(),
            },
          ]}
        />
      </Panel>
    </div>
  );
}