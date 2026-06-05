import { useEffect, useState } from "react";
import { getGeo } from "@/lib/geo.functions";

type Geo = { country: string; suggestedHub: string };

function windowFor(country: string): string {
  if (country === "NG") return "1–3 business days";
  if (["US", "CA"].includes(country)) return "5–8 business days";
  return "7–14 business days";
}

export function FulfillmentEstimate({ className = "" }: { className?: string }) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    let alive = true;
    getGeo()
      .then((g) => {
        if (alive) setGeo({ country: g.country, suggestedHub: g.suggestedHub });
      })
      .catch(() => {
        if (alive) setGeo({ country: "NG", suggestedHub: "Global HQ — Melrose Plaza" });
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!geo) return null;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/40 px-3 py-2 text-xs text-foreground/85 ${className}`}
    >
      <span aria-hidden className="text-gold">📍</span>
      <span>
        Ships from <span className="text-gold">{geo.suggestedHub}</span> • Est. delivery {windowFor(geo.country)}
      </span>
    </div>
  );
}