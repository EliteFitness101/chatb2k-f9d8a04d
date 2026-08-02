import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { productBySku, formatNGN } from "@/lib/catalog";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/chatb2k")({
  head: () => ({
    meta: pageMeta({
      title: "ChatB2K",
      description:
        "ChatB2K — your personal wellness intelligence. Assessment, recommendation, and habit coaching in one concierge flow.",
      url: SITE_URL + "/chatb2k",
    }),
    links: [canonicalLink(SITE_URL + "/chatb2k")],
    scripts: [
      breadcrumbScript([
        { name: "Home", url: SITE_URL + "/" },
        { name: "ChatB2K", url: SITE_URL + "/chatb2k" },
      ]),
    ],
  }),
  component: ChatB2KPage,
});

type Goal = "cut" | "recomp" | "bulk";
type Space = "home" | "gym";
type Budget = "lean" | "mid" | "apex";

const SKU_MAP: Record<string, string> = {
  "cut|home|lean": "RES-DIG-NUT",
  "cut|home|mid": "RES-IRON-15",
  "cut|home|apex": "RES-BUNDLE-APEX",
  "cut|gym|lean": "RES-DIG-90D",
  "cut|gym|mid": "RES-DIG-90D",
  "cut|gym|apex": "RES-COACH-01",
  "recomp|home|lean": "RES-DIG-90D",
  "recomp|home|mid": "RES-IRON-30",
  "recomp|home|apex": "RES-BUNDLE-APEX",
  "recomp|gym|lean": "RES-DIG-90D",
  "recomp|gym|mid": "RES-BENCH-01",
  "recomp|gym|apex": "RES-COACH-01",
  "bulk|home|lean": "RES-IRON-15",
  "bulk|home|mid": "RES-IRON-50",
  "bulk|home|apex": "RES-BUNDLE-APEX",
  "bulk|gym|lean": "RES-IRON-30",
  "bulk|gym|mid": "RES-BENCH-01",
  "bulk|gym|apex": "RES-BUNDLE-APEX",
};

function ChatB2KPage() {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);

  const done = goal && space && budget;
  const pick = done ? productBySku(SKU_MAP[`${goal}|${space}|${budget}`] ?? "RES-DIG-90D") : null;

  return (
    <SiteShell>
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Layer · Intelligence"
          title="ChatB2K."
          sub="Personal wellness intelligence. Assessment → recommendation → execution."
        />

        <div className="mt-10 glass rounded-md p-6 sm:p-8 space-y-8">
          <Question
            label="01 · What is the objective?"
            options={[
              { v: "cut", l: "Strip fat" },
              { v: "recomp", l: "Recomposition" },
              { v: "bulk", l: "Build mass" },
            ]}
            value={goal}
            onChange={(v) => setGoal(v as Goal)}
          />
          <Question
            label="02 · Where do you train?"
            options={[
              { v: "home", l: "Home sanctuary" },
              { v: "gym", l: "Commercial gym" },
            ]}
            value={space}
            onChange={(v) => setSpace(v as Space)}
          />
          <Question
            label="03 · Investment posture"
            options={[
              { v: "lean", l: "Lean start" },
              { v: "mid", l: "Committed" },
              { v: "apex", l: "Apex" },
            ]}
            value={budget}
            onChange={(v) => setBudget(v as Budget)}
          />
        </div>

        {pick && (
          <div className="mt-8 glass rounded-md p-8 border-2 border-[var(--gold)] shadow-gold">
            <div className="text-xs tracking-[0.3em] uppercase text-gold">ChatB2K recommendation</div>
            <h2 className="font-display text-2xl mt-3">{pick.title}</h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{pick.description}</p>
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="font-display text-2xl text-gold-gradient">{formatNGN(pick.ngnMinor)}</div>
              <Link
                to="/checkout"
                search={{ sku: pick.sku }}
                className="shrink-0 px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
              >
                Proceed to checkout
              </Link>
            </div>
            <div className="mt-5 text-xs text-muted-foreground">
              Want the full protocol context?{" "}
              <Link to="/programs" className="text-gold">
                Browse programmes
              </Link>
            </div>
          </div>
        )}
      </section>
    </SiteShell>
  );
}

function Question({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: string; l: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs tracking-[0.25em] uppercase text-gold">{label}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={
              value === o.v
                ? "px-4 py-2 rounded-sm text-sm bg-gold-gradient text-[var(--ink)] font-semibold"
                : "px-4 py-2 rounded-sm text-sm border border-[var(--glass-border)] text-foreground/85 hover:border-[var(--gold)] transition"
            }
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
