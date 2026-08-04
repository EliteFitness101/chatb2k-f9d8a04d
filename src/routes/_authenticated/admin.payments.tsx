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
import { getPaymentsConsole } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  component: PaymentsDomain,
});

function PaymentsDomain() {
  const fetchPayments = useServerFn(getPaymentsConsole);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => fetchPayments(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {data.by_provider.map((p) => (
          <StatCard
            key={p.provider}
            label={p.provider}
            value={fmtMinor(p.amount_minor)}
            hint={`${p.count} payments · ${p.failed} failed`}
            tone={p.failed > 0 ? "warn" : "default"}
          />
        ))}
      </div>

      <Panel title="Provider Rails">
        <DataTable
          rows={data.providers}
          columns={[
            { key: "n", label: "Provider", render: (p) => p.display_name },
            { key: "c", label: "Code", render: (p) => <span className="font-mono text-xs">{p.code}</span> },
            { key: "e", label: "Enabled", render: (p) => <StatusPill value={p.enabled ? "enabled" : "disabled"} /> },
            { key: "l", label: "Mode", render: (p) => <StatusPill value={p.live ? "live" : "test"} /> },
            {
              key: "cur",
              label: "Currencies",
              render: (p) => (p.supported_currencies ?? []).join(", "),
            },
          ]}
        />
      </Panel>

      <Panel title="Payment Ledger">
        <DataTable
          rows={data.rows}
          columns={[
            { key: "r", label: "Reference", render: (p) => <span className="font-mono text-xs">{p.reference}</span> },
            { key: "p", label: "Provider", render: (p) => p.provider },
            { key: "s", label: "Status", render: (p) => <StatusPill value={p.status} /> },
            { key: "a", label: "Amount", align: "right", render: (p) => fmtMinor(p.amount_minor, p.currency) },
            {
              key: "d",
              label: "Received",
              align: "right",
              render: (p) => new Date(p.created_at).toLocaleString(),
            },
          ]}
        />
      </Panel>

      <Panel title="Webhook Event Stream">
        <DataTable
          rows={data.recent_events}
          columns={[
            { key: "p", label: "Provider", render: (e) => e.provider },
            { key: "t", label: "Event", render: (e) => e.event_type },
            { key: "r", label: "Reference", render: (e) => e.reference ?? "—" },
            {
              key: "d",
              label: "Received",
              align: "right",
              render: (e) => new Date(e.created_at).toLocaleString(),
            },
          ]}
        />
      </Panel>
    </div>
  );
}