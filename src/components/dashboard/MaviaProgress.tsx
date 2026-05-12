interface Props {
  steps: string[];
  current: number; // 0-based
}

export function MaviaProgress({ steps, current }: Props) {
  const pct = ((current + 1) / steps.length) * 100;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.4em] uppercase text-gold">
          Tier {current + 1} / {steps.length}
        </div>
        <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
          {steps[current]}
        </div>
      </div>
      <div className="relative h-3 w-full rounded-full bg-[var(--ink)] border border-[var(--glass-border)] overflow-hidden">
        {/* ruby base */}
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, oklch(0.55 0.22 25) 0%, oklch(0.78 0.13 87) 60%, oklch(0.92 0.16 92) 100%)",
            boxShadow: "0 0 24px oklch(0.78 0.13 87 / 0.6), inset 0 0 12px oklch(0.92 0.16 92 / 0.4)",
          }}
        />
        {/* shimmer */}
        <div
          className="absolute inset-y-0 left-0 w-full pointer-events-none opacity-40"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
            transform: `translateX(${pct - 100}%)`,
            transition: "transform 700ms ease-out",
          }}
        />
        {/* notches */}
        <div className="absolute inset-0 flex">
          {steps.map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r last:border-r-0 border-[var(--ink)]/80"
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
        {steps.map((s, i) => (
          <span key={s} className={i <= current ? "text-gold" : ""}>
            {String(i + 1).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}