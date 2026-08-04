import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminGate,
  AdminLoading,
  DataTable,
  Panel,
  StatusPill,
} from "@/components/admin/AdminUI";
import { getComplianceFeed, setAlertStatus } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/compliance")({
  component: ComplianceDomain,
});

function ComplianceDomain() {
  const fetchFeed = useServerFn(getComplianceFeed);
  const updateAlert = useServerFn(setAlertStatus);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-compliance"],
    queryFn: () => fetchFeed(),
    refetchInterval: 60_000,
  });
  const mutate = useMutation({
    mutationFn: (v: { id: string; status: "acknowledged" | "resolved" }) =>
      updateAlert({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-compliance"] }),
  });

  if (isLoading) return <AdminLoading />;
  if (!data || !data.ok) return <AdminGate error={data?.error} />;

  return (
    <div className="space-y-8">
      <Panel title="Operational Alerts">
        <DataTable
          rows={data.alerts}
          empty="No alerts recorded."
          columns={[
            { key: "l", label: "Level", render: (a) => <StatusPill value={a.level} /> },
            { key: "t", label: "Alert", render: (a) => a.title },
            { key: "c", label: "Category", render: (a) => a.category },
            { key: "s", label: "Status", render: (a) => <StatusPill value={a.status} /> },
            {
              key: "act",
              label: "",
              align: "right",
              render: (a) =>
                a.status === "resolved" ? null : (
                  <span className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => mutate.mutate({ id: a.id, status: "acknowledged" })}
                      className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-gold"
                    >
                      Ack
                    </button>
                    <button
                      type="button"
                      onClick={() => mutate.mutate({ id: a.id, status: "resolved" })}
                      className="text-[10px] uppercase tracking-[0.25em] text-gold hover:underline"
                    >
                      Resolve
                    </button>
                  </span>
                ),
            },
          ]}
        />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Audit Trail">
          <DataTable
            rows={data.audits}
            columns={[
              { key: "a", label: "Action", render: (r) => r.action },
              { key: "e", label: "Entity", render: (r) => `${r.entity ?? "—"} ${r.entity_id ?? ""}` },
              {
                key: "d",
                label: "When",
                align: "right",
                render: (r) => new Date(r.created_at).toLocaleString(),
              },
            ]}
          />
        </Panel>

        <Panel title="Domain Events">
          <DataTable
            rows={data.events}
            columns={[
              { key: "t", label: "Event", render: (r) => r.event_type },
              { key: "a", label: "Aggregate", render: (r) => r.aggregate },
              {
                key: "d",
                label: "When",
                align: "right",
                render: (r) => new Date(r.created_at).toLocaleString(),
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}