import { useEffect, useState } from "react";
import { getGeo } from "@/lib/geo.functions";

export function CurrencyBadge() {
  const [geo, setGeo] = useState<{ country: string; currency: string; suggestedHub: string } | null>(null);
  useEffect(() => {
    getGeo().then(setGeo).catch(() => null);
  }, []);
  if (!geo) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
      Routing · {geo.country} · {geo.currency} · {geo.suggestedHub.split(",")[0]}
    </span>
  );
}
