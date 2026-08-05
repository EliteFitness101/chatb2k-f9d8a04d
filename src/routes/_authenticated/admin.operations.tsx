import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getOperationsConsole,
  setOpsTaskStatus,
  setRecoveryStatus,
} from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({
    meta: [
      { title: "Operations — ResoFlex Command Center" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OperationsPage,
});

const card = "rounded-sm border border-[var(--glass-border)] bg-[var(--glass)] p-4";
const label = "text-[10px] tracking-[0.3em] uppercase text-muted-foreground";

function Stat({ title, value }: { title: string; value: string | number }) {
  return (
    <div className={card}>
      <div className={label}>{title}</div>
      <div className="font-display text-2xl text-gold mt-2">{value}</div>
    </div>
  );
}

function OperationsPage() {
  const fetchConsole = useServerFn(getOperationsConsole);
  const updateTask = useServerFn(setOpsTaskStatus);
  const updateRecovery = useServerFn(setRecoveryStatus);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ops-console"],
    queryFn: () => fetchConsole(),
    refetchInterval: 60_000,
  });

  const taskMutation = useMutation({
    mutationFn: (v: { taskId: string; status: "in_progress" | "completed" | "blocked" | "cancelled" }) =>
      updateTask({ data: v }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Task updated");
        void qc.invalidateQueries({ queryKey: ["ops-console"] });
      } else toast.error(r.error);
    },
  });

  const recoveryMutation = useMutation({
    mutationFn: (v: { id: string; status: "contacted" | "recovered" | "lost" }) =>
      updateRecovery({ data: v }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Recovery updated");
        void qc.invalidateQueries({ queryKey: ["ops-console"] });
      } else toast.error(r.error);
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading operations…</p>;
  if (!data?.ok)
    return <p className="text-xs text-muted-foreground">You do not have access to operations.</p>;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Open tasks" value={data.tasks_by_status.find((t) => t.status === "open")?.count ?? 0} />
        <Stat title="Overdue" value={data.overdue_tasks} />
        <Stat title="SLA warnings" value={data.sla_warning} />
        <Stat title="SLA breaches" value={data.sla_breached} />
      </div>

      <section className={card}>
        <div className={label}>Operational tasks</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-2 pr-3">Task</th>
                <th className="py-2 pr-3">Priority</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.slice(0, 40).map((t) => (
                <tr key={t.id} className="border-t border-[var(--glass-border)]">
                  <td className="py-2 pr-3">{t.title}</td>
                  <td className="py-2 pr-3 uppercase">{t.priority}</td>
                  <td className="py-2 pr-3">{t.status.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3">{t.due_at ? new Date(t.due_at).toLocaleString() : "—"}</td>
                  <td className="py-2 space-x-2">
                    <button
                      className="text-gold hover:underline"
                      onClick={() => taskMutation.mutate({ taskId: t.id, status: "in_progress" })}
                    >
                      Start
                    </button>
                    <button
                      className="text-gold hover:underline"
                      onClick={() => taskMutation.mutate({ taskId: t.id, status: "completed" })}
                    >
                      Complete
                    </button>
                  </td>
                </tr>
              ))}
              {data.tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-muted-foreground">
                    No tasks generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className={label}>Hub capacity</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.hubs.map((h) => (
            <div key={h.hub_id} className="rounded-sm border border-[var(--glass-border)] p-3">
              <div className="text-sm text-foreground">{h.hub_name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Utilisation {(h.utilization * 100).toFixed(0)}% · workload {h.active_workload} · backlog{" "}
                {h.dispatch_backlog}
              </div>
              <div className="text-xs text-muted-foreground">
                Available units {h.available_units} · avg fulfilment{" "}
                {h.avg_fulfillment_minutes ? `${h.avg_fulfillment_minutes}m` : "—"}
              </div>
              <div
                className={`mt-2 text-[10px] tracking-[0.2em] uppercase ${
                  h.recommendation === "reassign" ? "text-destructive" : "text-gold"
                }`}
              >
                {h.recommendation} {h.reason ? `· ${h.reason}` : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className={label}>Revenue recovery</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.recovery.map((r) => (
            <div key={r.kind} className="rounded-sm border border-[var(--glass-border)] p-3">
              <div className="text-xs uppercase text-muted-foreground">{r.kind.replace(/_/g, " ")}</div>
              <div className="font-display text-xl text-gold mt-1">
                {(r.conversion * 100).toFixed(0)}%
              </div>
              <div className="text-[11px] text-muted-foreground">
                {r.recovered}/{r.total} recovered
              </div>
            </div>
          ))}
          {data.recovery.length === 0 && (
            <p className="text-xs text-muted-foreground">No recovery workflows yet.</p>
          )}
        </div>
        <div className="mt-4 space-y-2">
          {data.recovery_rows.slice(0, 10).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-foreground">{r.reference ?? r.email ?? r.id.slice(0, 8)}</span>
              <span className="text-muted-foreground">{r.status}</span>
              <button
                className="text-gold hover:underline"
                onClick={() => recoveryMutation.mutate({ id: r.id, status: "contacted" })}
              >
                Mark contacted
              </button>
              <button
                className="text-gold hover:underline"
                onClick={() => recoveryMutation.mutate({ id: r.id, status: "recovered" })}
              >
                Mark recovered
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className={label}>SLA timers</div>
        <ul className="mt-3 space-y-1 text-xs">
          {data.slas.slice(0, 20).map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>{s.sla_type.replace(/_/g, " ")} · {s.entity_id?.slice(0, 8)}</span>
              <span
                className={
                  s.state === "breached"
                    ? "text-destructive"
                    : s.state === "warning"
                      ? "text-gold"
                      : "text-muted-foreground"
                }
              >
                {s.state}
              </span>
            </li>
          ))}
          {data.slas.length === 0 && <li className="text-muted-foreground">No active timers.</li>}
        </ul>
      </section>
    </div>
  );
}