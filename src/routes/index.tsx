import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { CurrencyBadge } from "@/components/site/CurrencyBadge";
import { NigerianEcommerceTrustCheck } from "@/components/site/NigerianEcommerceTrustCheck";
import { FulfillmentEstimate } from "@/components/site/FulfillmentEstimate";
import { getAttribution } from "@/lib/attribution";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta({
      title: "Personalized Wellness, Orchestrated Around You",
      description:
        "ResoFit connects your goals, lifestyle, wellness priorities and current ResoFit services into one personalized next step.",
      url: SITE_URL + "/",
      type: "website",
    }),
    links: [canonicalLink(SITE_URL + "/")],
    scripts: [breadcrumbScript([{ name: "Home", url: SITE_URL + "/" }])],
  }),
  component: Index,
});

const SHOP = "https://shop.resofit.fit";
const WHATSAPP =
  "https://wa.me/2348132255842?text=" +
  encodeURIComponent(
    "Hello ResoFit, I would like help choosing my best next wellness or commerce pathway.",
  );

type CtaVariant = "direct" | "returning" | "guided";

function withAttribution(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const { rsid, utm } = getAttribution();
    const u = new URL(url, window.location.origin);
    if (rsid) u.searchParams.set("rsid", rsid);
    u.searchParams.set("funnel_origin", "resofit");
    for (const [key, value] of Object.entries(utm)) {
      if (value) u.searchParams.set(key, String(value));
    }
    return u.toString();
  } catch {
    return url;
  }
}

function track(event: string, props: Record<string, unknown> = {}) {
  try {
    const { rsid, utm } = getAttribution();
    const payload = { event, rsid, utm, ...props };
    (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push(payload);
    const raw = localStorage.getItem("rf_events");
    const events = raw ? JSON.parse(raw) : [];
    events.push({ event, props: { rsid, utm, ...props }, t: Date.now() });
    localStorage.setItem("rf_events", JSON.stringify(events.slice(-200)));
    void fetch("/api/public/funnel-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: event, rsid, props: { utm, ...props } }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function Index() {
  const [variant, setVariant] = useState<CtaVariant>("guided");

  useEffect(() => {
    try {
      const visits = Number(localStorage.getItem("rf_visits") || "0") + 1;
      localStorage.setItem("rf_visits", String(visits));
      const next: CtaVariant = visits >= 3 ? "returning" : visits === 1 ? "direct" : "guided";
      setVariant(next);
      track("landing_view", { variant: next });
    } catch {
      track("landing_view", { variant: "guided" });
    }
  }, []);

  const personalizeHref = withAttribution("/quiz");
  const chatHref = withAttribution("/chatb2k");
  const shopHref = withAttribution(SHOP);
  const primaryLabel =
    variant === "returning"
      ? "Continue My Pathway →"
      : variant === "direct"
        ? "Discover My Best Next Step →"
        : "Build My Personalized Pathway →";

  return (
    <SiteShell>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 ember-bg pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_30%_35%,oklch(0.78_0.13_87/0.14),transparent_52%),radial-gradient(circle_at_80%_70%,oklch(0.2_0.04_87/0.16),transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-20 sm:pt-28 pb-20 sm:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl"
          >
            <CurrencyBadge />
            <p className="mt-8 text-xs tracking-[0.35em] uppercase text-gold">ResoFit OS™</p>
            <h1 className="mt-4 font-display text-5xl sm:text-6xl md:text-7xl leading-[1.02]">
              Your wellness journey should adapt to <span className="text-gold-gradient">you.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg sm:text-xl text-muted-foreground leading-relaxed">
              ChatB2K™ intelligence connects your goals, lifestyle, context and intent to the
              most relevant current ResoFit pathway — wellness, nutrition, training, coaching,
              commerce or support.
            </p>

            <NigerianEcommerceTrustCheck className="mt-6" />
            <FulfillmentEstimate className="mt-4" />

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={personalizeHref}
                onClick={() => track("personalization_started", { surface: "hero" })}
                className="px-7 py-4 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold tracking-wide shadow-gold hover:brightness-110 transition"
              >
                {primaryLabel}
              </a>
              <a
                href={chatHref}
                onClick={() => track("chatb2k_open", { surface: "hero" })}
                className="px-7 py-4 rounded-sm border border-[var(--glass-border)] text-foreground font-medium hover:border-[var(--gold)] transition"
              >
                Ask ChatB2K™
              </a>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("whatsapp_click", { surface: "hero" })}
                className="px-7 py-4 rounded-sm border border-[var(--glass-border)] text-foreground/85 font-medium hover:border-[var(--gold)] transition"
              >
                Talk to a Coach
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="max-w-3xl">
          <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">Intent first</div>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl">Tell us what you actually want.</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            You do not need to know which product, program or service is right. Start with your
            intent; ChatB2K™ can route you to the current eligible option.
          </p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ["Fitness & body", "I want training, strength or body-composition help.", "/chatb2k?intent=fitness"],
            ["Food & nutrition", "I want meals, nutrition guidance or a meal plan.", "/chatb2k?intent=nutrition"],
            ["Equipment", "I want the right fitness equipment for my goal.", "/chatb2k?intent=equipment"],
            ["Coaching & support", "I want a coach, membership or personal guidance.", "/chatb2k?intent=coaching"],
          ].map(([title, copy, href]) => (
            <Link
              key={title}
              to={href}
              onClick={() => track("intent_selected", { intent: title })}
              className="group glass rounded-md p-6 min-h-44 flex flex-col hover:border-[var(--gold)] hover:shadow-gold transition-all"
            >
              <div className="text-xs tracking-[0.25em] uppercase text-gold/80">Explore</div>
              <div className="mt-3 font-display text-2xl">{title}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{copy}</p>
              <div className="mt-5 text-xs tracking-widest uppercase text-gold group-hover:translate-x-1 transition-transform">
                Let ChatB2K route me →
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="grid lg:grid-cols-3 gap-5">
          {[
            ["01", "Understand", "Your answers, context and intent become a persistent customer journey."],
            ["02", "Personalize", "Current ResoFit data and eligible offers are evaluated at runtime."],
            ["03", "Orchestrate", "The system routes you to the right next action, payment or fulfillment path."],
          ].map(([n, title, copy]) => (
            <div key={n} className="glass rounded-md p-7">
              <div className="font-display text-4xl text-gold-gradient">{n}</div>
              <div className="mt-4 font-display text-2xl">{title}</div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="glass rounded-md p-7 sm:p-10 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_80%_20%,oklch(0.78_0.13_87/0.12),transparent_40%)]" />
          <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">Commerce, without the maze</div>
              <h2 className="font-display text-3xl sm:text-4xl">Need equipment or another current ResoFit offer?</h2>
              <p className="mt-4 text-muted-foreground max-w-2xl leading-relaxed">
                ChatB2K™ can establish intent first. When you are ready to browse or purchase,
                commerce stays on the dedicated ResoFit shop experience.
              </p>
            </div>
            <a
              href={shopHref}
              onClick={() => track("shop_click", { surface: "commerce_bridge" })}
              className="inline-flex items-center justify-center px-7 py-4 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold whitespace-nowrap"
            >
              Open ResoFit Shop →
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">Your next move</div>
        <h2 className="font-display text-4xl sm:text-5xl">Start with intent. Leave with clarity.</h2>
        <p className="mt-5 text-muted-foreground leading-relaxed">
          No product knowledge required. No forced storefront detour. Your pathway begins with you.
        </p>
        <div className="mt-9 flex flex-wrap gap-3 justify-center">
          <a
            href={personalizeHref}
            onClick={() => track("personalization_started", { surface: "final" })}
            className="px-7 py-4 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
          >
            Discover My Pathway →
          </a>
          <a
            href={chatHref}
            onClick={() => track("chatb2k_open", { surface: "final" })}
            className="px-7 py-4 rounded-sm glass text-foreground/85 hover:border-[var(--gold)] transition"
          >
            Ask ChatB2K™
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
