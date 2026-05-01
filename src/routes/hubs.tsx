import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/hubs")({
  head: () => ({
    meta: pageMeta({
      title: "Global Hubs",
      description: "Seven sanctuaries across Nigeria, the United States and Canada. Verified fulfilment.",
    }),
  }),
  component: HubsPage,
});

const HUBS = [
  { tier: "Global HQ", city: "Umudike, Abia, NG", address: "Top Floor, Melrose Plaza", note: "Origin sanctuary." },
  { tier: "National", city: "Lekki, Lagos, NG", address: "Lekki Phase 1", note: "Western branch." },
  { tier: "National", city: "Lekki, Lagos, NG", address: "Lekki Phase 2", note: "Showroom + dispatch." },
  { tier: "National", city: "Port Harcourt, NG", address: "Sobaz Estate", note: "South-South coverage." },
  { tier: "National", city: "Port Harcourt, NG", address: "Shell RA", note: "Industrial dispatch." },
  { tier: "International", city: "Jersey City, US", address: "108 CraneFord", note: "North America hub." },
  { tier: "International", city: "Ottawa, CA", address: "Wellness Villa", note: "Canada hub." },
];

function HubsPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Global Sanctuaries"
          title="Seven hubs. Three continents. One authority."
          sub="Every order routes to the nearest sanctuary. White-glove delivery, verified at dispatch."
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {HUBS.map((h) => (
            <div key={`${h.city}-${h.address}`} className="glass rounded-md p-6 hover:shadow-gold transition">
              <div className="text-xs uppercase tracking-[0.3em] text-gold">{h.tier}</div>
              <h3 className="font-display text-2xl mt-2">{h.city}</h3>
              <p className="mt-2 text-sm text-foreground/80">{h.address}</p>
              <p className="mt-3 text-xs text-muted-foreground">{h.note}</p>
            </div>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}