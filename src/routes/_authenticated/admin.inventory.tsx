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
import { getInventoryConsole } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  component: InventoryDomain,
});

function InventoryDomain() {
  const fetchInventory = useServerFn(getInventoryConsole);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => fetchInventory(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tracked SKUs" value={data.rows.length} />
        <StatCard
          label="At / Below Reorder"
          value={data.low_count}
          tone={data.low_count > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Units On Hand"
          value={data.rows.reduce((s, r) => s + r.on_hand, 0)}
        />
        <StatCard label="Units Reserved" value={data.rows.reduce((s, r) => s + r.reserved, 0)} />
      </div>

      <Panel title="Stock Positions">
        <DataTable
          rows={data.rows}
          columns={[
            { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
            { key: "hub", label: "Hub", render: (r) => `${r.hub_name} (${r.hub_tier})` },
            { key: "oh", label: "On Hand", align: "right", render: (r) => r.on_hand },
            { key: "rs", label: "Reserved", align: "right", render: (r) => r.reserved },
            { key: "av", label: "Available", align: "right", render: (r) => r.available },
            {
              key: "st",
              label: "State",
              align: "right",
              render: (r) => <StatusPill value={r.low ? "critical" : "healthy"} />,
            },
          ]}
        />
      </Panel>

      <Panel title="Inventory Ledger">
        <DataTable
          rows={data.ledger}
          columns={[
            { key: "sku", label: "SKU", render: (l) => <span className="font-mono text-xs">{l.sku}</span> },
            { key: "hub", label: "Hub", render: (l) => l.hub_name },
            { key: "d", label: "Delta", align: "right", render: (l) => l.delta },
            { key: "r", label: "Reason", render: (l) => l.reason },
            {
              key: "t",
              label: "When",
              align: "right",
              render: (l) => new Date(l.created_at).toLocaleString(),
            },
          ]}
        />
      </Panel>
    </div>
  );
}