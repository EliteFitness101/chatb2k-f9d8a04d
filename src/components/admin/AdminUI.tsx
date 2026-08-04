import type { ReactNode } from "react";

export function fmtMinor(minor: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return String(minor / 100);
  }
}

export function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const toneClass =
    tone === "warn" ? "text-destructive" : tone === "good" ? "text-gold" : "text-foreground";
  return (
    <div className="rounded-sm border border-[var(--glass-border)] bg-[var(--ink-soft)]/40 backdrop-blur-xl px-5 py-4">
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl mt-2 ${toneClass}`}>{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-sm border border-[var(--glass-border)] bg-[var(--ink-soft)]/30 backdrop-blur-xl">
      <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <h2 className="text-[11px] tracking-[0.3em] uppercase text-gold">{title}</h2>
        {action}
      </header>
      <div className="p-5 overflow-x-auto">{children}</div>
    </section>
  );
}

export function DataTable<T>({
  columns,
  rows,
  empty = "No records yet.",
}: {
  columns: { key: string; label: string; render: (row: T) => ReactNode; align?: "right" }[];
  rows: T[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <table className="w-full text-sm min-w-[640px]">
      <thead>
        <tr className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          {columns.map((c) => (
            <th key={c.key} className={`pb-3 font-normal ${c.align === "right" ? "text-right" : "text-left"}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-[var(--glass-border)]/60">
            {columns.map((c) => (
              <td key={c.key} className={`py-2.5 pr-4 ${c.align === "right" ? "text-right" : ""}`}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatusPill({ value }: { value: string }) {
  const v = value.toLowerCase();
  const tone =
    v === "paid" || v === "completed" || v === "delivered" || v === "resolved" || v === "verified"
      ? "border-gold/50 text-gold"
      : v === "failed" || v === "refunded" || v === "critical" || v === "exception"
        ? "border-destructive/50 text-destructive"
        : "border-[var(--glass-border)] text-muted-foreground";
  return (
    <span className={`inline-block rounded-sm border px-2 py-0.5 text-[10px] tracking-[0.2em] uppercase ${tone}`}>
      {value}
    </span>
  );
}

export function AdminGate({ error }: { error?: string }) {
  return (
    <div className="py-20 text-center">
      <h1 className="font-display text-3xl">Restricted</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {error ?? "You do not hold the capability required for this domain."}
      </p>
    </div>
  );
}

export function AdminLoading() {
  return (
    <div className="py-20 text-center text-gold/80 tracking-[0.3em] uppercase text-xs animate-pulse">
      Loading domain…
    </div>
  );
}