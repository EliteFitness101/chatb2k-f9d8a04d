import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AdminGate,
  AdminLoading,
  DataTable,
  Panel,
  StatCard,
  pct,
  fmtMinor,
} from "@/components/admin/AdminUI";
import { getChatB2KIntelligence } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/chatb2k")({
  component: ChatB2KDomain,
});

function Distribution({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <Panel title={title}>
      <DataTable
        rows={rows}
        columns={[
          { key: "l", label: "Segment", render: (r) => r.label },
          { key: "c", label: "Count", align: "right", render: (r) => r.count },
        ]}
      />
    </Panel>
  );
}

function ChatB2KDomain() {
  const fetchIntel = useServerFn(getChatB2KIntelligence);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-chatb2k"],
    queryFn: () => fetchIntel(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Assessments" value={data.total_assessments} />
        <StatCard
          label="Completion Rate"
          value={pct(data.completion_rate)}
          hint={`${data.completed_assessments} completed`}
          tone="good"
        />
        <StatCard label="Avg Confidence" value={data.avg_confidence.toFixed(2)} />
        <StatCard label="Avg Upsell Score" value={data.avg_upsell.toFixed(2)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Upsells Offered" value={data.upsell_offered} />
        <StatCard
          label="Bundle Conversion"
          value={pct(data.upsell_conversion)}
          hint={`${data.upsell_accepted} accepted`}
          tone="good"
        />
        <StatCard label="Upsell Revenue" value={fmtMinor(data.upsell_revenue_minor)} />
        <StatCard
          label="Funnel Entry"
          value={data.funnel_steps[0]?.count ?? 0}
          hint="Distinct visitors"
        />
      </div>

      <Panel title="Drop-off Funnel">
        <DataTable
          rows={data.funnel_steps}
          columns={[
            { key: "s", label: "Step", render: (r) => r.label },
            { key: "c", label: "Visitors", align: "right", render: (r) => r.count },
            {
              key: "d",
              label: "Drop-off",
              align: "right",
              render: (r) => (r.drop_off > 0 ? pct(r.drop_off) : "—"),
            },
          ]}
        />
      </Panel>

      <Panel title="Upsell / Bundle Offers">
        <DataTable
          rows={data.by_offer}
          columns={[
            { key: "sku", label: "Offer SKU", render: (r) => r.sku },
            { key: "o", label: "Offered", align: "right", render: (r) => r.offered },
            { key: "a", label: "Accepted", align: "right", render: (r) => r.accepted },
            { key: "r", label: "Rate", align: "right", render: (r) => pct(r.rate) },
            {
              key: "amt",
              label: "Revenue",
              align: "right",
              render: (r) => fmtMinor(r.amount_minor),
            },
          ]}
        />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Distribution title="Recommended Programs" rows={data.by_program} />
        <Distribution title="Recommended Memberships" rows={data.by_membership} />
        <Distribution title="Primary Goals" rows={data.by_goal} />
        <Distribution title="Experience Levels" rows={data.by_experience} />
        <Distribution title="Equipment Access" rows={data.by_equipment} />
        <Distribution title="Budget Bands" rows={data.by_budget} />
      </div>
    </div>
  );
}