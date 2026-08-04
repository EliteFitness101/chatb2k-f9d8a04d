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