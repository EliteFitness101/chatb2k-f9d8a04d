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
  pct,
} from "@/components/admin/AdminUI";
import { getCustomerIntelligence } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersDomain,
});

function CustomersDomain() {
  const fetchCustomers = useServerFn(getCustomerIntelligence);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => fetchCustomers(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  const repeatRate = data.distinct_buyers > 0 ? data.repeat_buyers / data.distinct_buyers : 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Members" value={data.member_count} />
        <StatCard label="Distinct Buyers" value={data.distinct_buyers} />
        <StatCard label="Repeat Buyers" value={data.repeat_buyers} />
        <StatCard label="Repeat Rate" value={pct(repeatRate)} tone="good" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Membership Tiers">
          <DataTable
            rows={data.by_tier}
            columns={[
              { key: "t", label: "Tier", render: (r) => <StatusPill value={r.tier} /> },
              { key: "c", label: "Members", align: "right", render: (r) => r.count },
            ]}
          />
        </Panel>

        <Panel title="Top Customers by Lifetime Value">
          <DataTable
            rows={data.top_customers}
            columns={[
              { key: "e", label: "Customer", render: (r) => r.email },
              { key: "o", label: "Orders", align: "right", render: (r) => r.orders },
              { key: "v", label: "LTV", align: "right", render: (r) => fmtMinor(r.amount_minor) },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Recent Leads">
        <DataTable
          rows={data.leads}
          columns={[
            { key: "e", label: "Email", render: (l) => l.email ?? "—" },
            { key: "g", label: "Goal", render: (l) => l.goal },
            { key: "a", label: "Activity", render: (l) => l.activity },
            { key: "s", label: "Status", render: (l) => <StatusPill value={l.status} /> },
            {
              key: "d",
              label: "Captured",
              align: "right",
              render: (l) => new Date(l.created_at).toLocaleString(),
            },
          ]}
        />
      </Panel>
    </div>
  );
}