import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { ProductCard } from "@/components/site/ProductCard";
import { CurrencyBadge } from "@/components/site/CurrencyBadge";
import { products } from "@/lib/catalog";
import { pageMeta } from "@/lib/site-meta";
import { NigerianEcommerceTrustCheck } from "@/components/site/NigerianEcommerceTrustCheck";
import { FulfillmentEstimate } from "@/components/site/FulfillmentEstimate";
import { getAttribution } from "@/lib/attribution";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta({
      title: "Transform Your Body with ChatB2K Precision — Start for ₦1,000",
      description:
        "Get a personalized nutrition, fitness, and wellness roadmap designed around your goals, lifestyle, body type, and metabolic profile.",
    }),
    links: [
      { rel: "preload", as: "image", href: "/hero/product-1.webp" },
      { rel: "preload", as: "image", href: "/hero/product-2.webp" },
    ],
  }),
  component: Index,
});

const PRIMARY_CTA = "https://joy-funnel-ai.lovable.app";
const ENROLLMENT = "https://reso-flex.lovable.app";
const SHOP = "https://reso-flex.lovable.app";
const WHATSAPP = "https://wa.me/2348132255842?text=" + encodeURIComponent(
  "Hello Coach Buchi,\n\nI just started my Metabolic Reset on ResoFit and would like guidance on the next step."
);
const SECONDARY_CTA = "https://reso-fit.lovable.app"; // ChatB2K Assessment (secondary / fallback)
// Community channels — single source of truth for the ResoFit Telegram community.
const TELEGRAM = "https://t.me/resofitcommunity";

type CtaVariant = "direct" | "pain" | "ai" | "trust";

// Append RSID + UTM + funnel_origin to outbound funnel links (attribution enforcement).
function withAttribution(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const { rsid, utm } = getAttribution();
    const u = new URL(url);
    if (rsid) u.searchParams.set("rsid", rsid);
    u.searchParams.set("funnel_origin", "resofit");
    for (const [k, v] of Object.entries(utm)) {
      if (v) u.searchParams.set(k, String(v));
    }
    return u.toString();
  } catch {
    return url;
  }
}

// CTA Intelligence — dynamic label only (no layout change).
function ctaLabelForRsidValue(): string {
  if (typeof window === "undefined") return "Start Your Metabolic Reset →";
  try {
    const tier = localStorage.getItem("rf_rsid_tier"); // "high" | "medium" | "low"
    if (tier === "high") return "Buy Now (Priority Access) →";
    if (tier === "medium") return "Continue Transformation →";
  } catch {}
  return "Start Your Metabolic Reset →";
}

function track(event: string, props: Record<string, unknown> = {}) {
  // soft-track + revenue attribution. RSID + UTM merged into every event.
  try {
    const { rsid, utm } = getAttribution();
    const payload = { event, rsid, utm, ...props };
    (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push(payload);
    const key = "rf_events";
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ event, props: { rsid, utm, ...props }, t: Date.now() });
    localStorage.setItem(key, JSON.stringify(arr.slice(-200)));
    // Fire-and-forget mirror to funnel_events table.
    void fetch("/api/public/funnel-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: event, rsid, props: { utm, ...props } }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function pickCtaVariant(): CtaVariant {
  if (typeof window === "undefined") return "direct";
  try {
    const ref = document.referrer || "";
    const src = new URLSearchParams(window.location.search).get("utm_source") || "";
    if (/tiktok/i.test(ref) || /tiktok/i.test(src)) return "pain";
    const visits = Number(localStorage.getItem("rf_visits") || "0");
    if (visits >= 3) return "direct"; // high-intent returning
    const bounced = localStorage.getItem("rf_bounced") === "1";
    if (bounced) return "trust";
    return "ai";
  } catch {
    return "direct";
  }
}

function Index() {
  const featured = products.filter((p) => ["iron", "bench"].includes(p.category)).slice(0, 4);
  const [ctaVariant, setCtaVariant] = useState<CtaVariant>("direct");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const visits = Number(localStorage.getItem("rf_visits") || "0") + 1;
      localStorage.setItem("rf_visits", String(visits));
      // mark bounce if last visit had no cta_click
      const lastClick = Number(localStorage.getItem("rf_last_cta_click") || "0");
      const lastVisit = Number(localStorage.getItem("rf_last_visit") || "0");
      if (lastVisit && lastClick < lastVisit) localStorage.setItem("rf_bounced", "1");
      localStorage.setItem("rf_last_visit", String(Date.now()));
    } catch {}
    const v = pickCtaVariant();
    setCtaVariant(v);
    track("landing_view", { variant: v });

    // scroll depth — fire once per threshold per page view
    let d50 = false, d75 = false, d90 = false, d100 = false;
    const onScroll = () => {
      const h = document.documentElement;
      const pct = (h.scrollTop + window.innerHeight) / h.scrollHeight;
      if (!d50 && pct >= 0.5) { d50 = true; track("scroll_depth_50"); }
      if (!d75 && pct >= 0.75) { d75 = true; track("scroll_depth_75"); }
      if (!d90 && pct >= 0.9) { d90 = true; track("scroll_depth_90"); }
      if (!d100 && pct >= 0.99) { d100 = true; track("scroll_depth_100"); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const primaryHref = withAttribution(PRIMARY_CTA);
  const secondaryHref = withAttribution(SECONDARY_CTA);
  const shopHref = withAttribution(SHOP);
  const enrollHref = withAttribution(ENROLLMENT);
  const primaryLabel = ctaLabelForRsidValue();
  const onPrimaryCta = (surface: "primary" | "sticky" | "final" = "primary") => {
    try { localStorage.setItem("rf_last_cta_click", String(Date.now())); } catch {}
    // Fire exactly one funnel event per click. checkout_started is emitted by
    // the /checkout route itself so we don't inflate the funnel from the hero.
    track("assessment_started", { variant: ctaVariant, surface });
  };

  return (
    <SiteShell>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 ember-bg pointer-events-none" />
        <div className="absolute inset-0 [background:radial-gradient(circle_at_30%_40%,oklch(0.78_0.13_87/0.12),transparent_55%)] pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-20 sm:pt-28 pb-24 sm:pb-32 pb-28 sm:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <CurrencyBadge />
            <h1 className="mt-6 font-display text-5xl sm:text-6xl md:text-7xl leading-[1.05]">
              Transform Your Body With <span className="text-gold-gradient">ChatB2K Precision</span>.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Get a personalized nutrition, fitness, and wellness roadmap designed around
              your goals, lifestyle, body type, and metabolic profile.
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/80">
              {[
                "ChatB2K-Powered Recommendations",
                "Coach Verified",
                "Nigerian Meal Plans",
                "Start for ₦1,000",
              ].map((t) => (
                <li key={t} className="inline-flex items-center gap-2">
                  <span className="text-gold">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            {/* Nigerian E-Commerce Trust Badges — above the fold */}
            <NigerianEcommerceTrustCheck className="mt-5" />
            {/* Fulfillment estimate — above primary CTA */}
            <FulfillmentEstimate className="mt-5" />
            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href={primaryHref}
                onClick={() => onPrimaryCta("primary")}
                className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold tracking-wide shadow-gold hover:brightness-110 transition"
              >
                {primaryLabel}
              </a>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("whatsapp_click", { surface: "hero" })}
                className="px-6 py-3.5 rounded-sm border border-[var(--glass-border)] text-foreground font-medium hover:border-[var(--gold)] transition"
              >
                Chat With a Coach
              </a>
              <a
                href={secondaryHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("assessment_secondary_click", { surface: "hero" })}
                className="px-6 py-3.5 rounded-sm border border-[var(--glass-border)] text-foreground/80 hover:border-[var(--gold)] transition text-sm"
              >
                Take ChatB2K Assessment
              </a>
            </div>
            <div className="mt-6">
              <a
                href={enrollHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs tracking-[0.3em] uppercase text-gold/90 hover:text-gold transition"
              >
                Already convinced? Shop the Arsenal →
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* TRUST AUTHORITY */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <SectionHeading
          eyebrow="Proof"
          title="Trusted Transformation System"
          sub="Real installations, real deployments, real deliveries — across Nigeria and beyond."
        />
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {[
            { title: "Home Installations", caption: "Delivered across Nigeria", img: "/images/proof/home-installations.jpg" },
            { title: "Boutique Gym Deployments", caption: "Trusted by private gyms", img: "/images/proof/boutique-gym.jpg" },
            { title: "Nationwide Delivery Proof", caption: "Premium fitness installations", img: "/images/proof/nationwide-delivery.jpg" },
          ].map((t) => (
            <div key={t.title} className="glass rounded-md overflow-hidden">
              <img
                src={t.img}
                alt={`${t.title} — ${t.caption}`}
                loading="lazy"
                width={1024}
                height={768}
                className="aspect-[4/3] w-full object-cover bg-[var(--ink)]"
              />
              <div className="p-5">
                <div className="font-display text-xl">{t.title}</div>
                <div className="text-xs tracking-widest uppercase text-gold/80 mt-2">{t.caption}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BENEFITS */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <SectionHeading
          eyebrow="Why ResoFit"
          title="Everything your body needs, in one system."
          sub="ChatB2K-precision plans, coach-verified execution, and hardware built for the long game."
        />
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { t: "Personalized Blueprint", d: "Your metabolism, your goals, your schedule — mapped into one plan." },
            { t: "Nigerian Meal Intelligence", d: "Local ingredients, real macros, no imported guesswork." },
            { t: "Coach-Verified", d: "Every recommendation is reviewed before it reaches you." },
            { t: "Built for Consistency", d: "Progress tracking, streaks, and rituals that compound weekly." },
          ].map((b) => (
            <div key={b.t} className="glass rounded-md p-6">
              <div className="text-xs tracking-[0.3em] uppercase text-gold/80">Benefit</div>
              <div className="mt-2 font-display text-xl">{b.t}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps to your Metabolic Reset."
          sub="Under 10 minutes to your first personalized plan."
        />
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {[
            { n: "01", t: "Take the Assessment", d: "Answer a short intake about your goals, lifestyle, and body." },
            { n: "02", t: "Get Your ChatB2K Plan", d: "Nutrition, training, and recovery tuned to your metabolic profile." },
            { n: "03", t: "Execute With a Coach", d: "Verified guidance, weekly rituals, and hardware when you're ready." },
          ].map((s) => (
            <div key={s.n} className="glass rounded-md p-6">
              <div className="font-display text-4xl text-gold-gradient">{s.n}</div>
              <div className="mt-3 font-display text-xl">{s.t}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <SectionHeading
          eyebrow="Transformations"
          title="From ResoFit clients."
          sub="Real people, real routines, real weeks of work."
        />
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {[
            { name: "Chinaza O.", story: "Lagos · 12 weeks", quote: "The plan was made for my life — jollof included. I dropped 8kg without hating my food." },
            { name: "Ibrahim A.", story: "Abuja · 8 weeks", quote: "Coach check-ins kept me honest. First time I've stayed consistent past week three." },
            { name: "Adaeze N.", story: "Port Harcourt · 16 weeks", quote: "Home setup + ChatB2K plan replaced my gym membership and my nutritionist." },
          ].map((c) => (
            <div key={c.name} className="glass rounded-md p-6 flex flex-col">
              <div className="text-gold text-3xl leading-none">“</div>
              <p className="mt-3 text-sm text-foreground/90 leading-relaxed flex-1">{c.quote}</p>
              <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
                <div className="font-display text-base">{c.name}</div>
                <div className="text-xs tracking-widest uppercase text-gold/80 mt-1">{c.story}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MID ASSESSMENT CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16 text-center">
        <SectionHeading
          align="center"
          eyebrow="Free"
          title="Start your Free Assessment."
          sub="Get your ChatB2K-precision plan in under 10 minutes. No card required."
        />
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <a
            href={primaryHref}
            onClick={() => onPrimaryCta("primary")}
            className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
          >
            Start Free Assessment →
          </a>
          <a
            href={secondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("assessment_secondary_click", { surface: "mid" })}
            className="px-6 py-3.5 rounded-sm glass text-foreground/80 hover:border-[var(--gold)] transition text-sm"
          >
            Take ChatB2K Assessment
          </a>
        </div>
      </section>

      {/* FEATURED ARSENAL */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 opacity-90">
        <SectionHeading
          eyebrow="Catalog"
          title="Equipment layer."
          sub="Optional hardware for when your plan is dialed in. The Free Assessment is the fastest first step."
        />
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <a
            href={SHOP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 rounded-sm glass hover:border-[var(--gold)] transition"
          >
            View full arsenal on reso-flex →
          </a>
        </div>
      </section>

      {/* Financial Router section soft-hidden per funnel patch. */}

      {/* COMMUNITY */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <SectionHeading
          eyebrow="Community"
          title="Join the ResoFit circle."
          sub="Coach access, member wins, and weekly rituals — where the transformation stays alive."
        />
        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_click", { surface: "community" })}
            className="glass rounded-md p-6 hover:border-[var(--gold)] transition"
          >
            <div className="text-xs tracking-[0.3em] uppercase text-gold/80">Coach line</div>
            <div className="mt-2 font-display text-xl">WhatsApp Coach</div>
            <p className="mt-2 text-sm text-muted-foreground">Direct access to Coach Buchi for plan questions and check-ins.</p>
            <div className="mt-4 text-xs tracking-widest uppercase text-gold">Open chat →</div>
          </a>
          <a
            href={TELEGRAM}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("telegram_join_click", { surface: "community" })}
            className="glass rounded-md p-6 hover:border-[var(--gold)] transition"
          >
            <div className="text-xs tracking-[0.3em] uppercase text-gold/80">Broadcast</div>
            <div className="mt-2 font-display text-xl">Telegram Channel</div>
            <p className="mt-2 text-sm text-muted-foreground">Daily wins, drops, and ChatB2K tips from the ResoFit floor.</p>
            <div className="mt-4 text-xs tracking-widest uppercase text-gold">Join channel →</div>
          </a>
          <a
            href={enrollHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("community_hub_click", { surface: "community" })}
            className="glass rounded-md p-6 hover:border-[var(--gold)] transition"
          >
            <div className="text-xs tracking-[0.3em] uppercase text-gold/80">Hub</div>
            <div className="mt-2 font-display text-xl">Community Hub</div>
            <p className="mt-2 text-sm text-muted-foreground">Member portal, transformation logs, and coach-led rituals.</p>
            <div className="mt-4 text-xs tracking-widest uppercase text-gold">Enter hub →</div>
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16">
        <SectionHeading eyebrow="FAQ" title="Answers before you start." />
        <div className="mt-10 divide-y divide-[var(--glass-border)] border-y border-[var(--glass-border)]">
          {[
            { q: "Is the Free Assessment really free?", a: "Yes. You get a ChatB2K-precision plan without paying. The ₦1,000 Metabolic Reset unlocks coach follow-up and full weekly execution." },
            { q: "Do the meal plans work with Nigerian food?", a: "Every plan is built around locally-available ingredients, portioned to your metabolic profile — jollof, egusi, oats, plantain, all fair game." },
            { q: "What if I need hardware later?", a: "The Equipment Layer above ships nationwide with verified delivery. Your plan works with zero equipment first." },
            { q: "Can I talk to a real coach?", a: "Yes — Coach Buchi is one WhatsApp tap away, and coach review is baked into every paid tier." },
            { q: "How is my data handled?", a: "Assessment data stays inside ResoFit. Payments run on Paystack. We never resell your inputs." },
          ].map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-6 list-none">
                <span className="font-display text-lg">{f.q}</span>
                <span className="text-gold text-xl transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-20 text-center">
        <SectionHeading
          align="center"
          eyebrow="Your move"
          title="Start Free. Transform for real."
          sub="Your ChatB2K-precision plan is one assessment away."
        />
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <a
            href={primaryHref}
            onClick={() => onPrimaryCta("final")}
            className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
          >
            Start Free Assessment →
          </a>
          <a
            href={secondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("assessment_secondary_click", { surface: "final" })}
            className="px-6 py-3.5 rounded-sm glass text-foreground/80 hover:border-[var(--gold)] transition text-sm"
          >
            Take ChatB2K Assessment
          </a>
        </div>
        <div className="mt-6">
          <a
            href={shopHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("enroll_click", { surface: "final" })}
            className="text-xs tracking-[0.3em] uppercase text-gold/80 hover:text-gold transition"
          >
            Or shop the arsenal →
          </a>
        </div>
      </section>

      {/* MOBILE STICKY CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-[var(--glass-border)] bg-[var(--ink)]/95 backdrop-blur px-3 py-3 flex gap-2 items-center">
        <a
          href={primaryHref}
          onClick={() => onPrimaryCta("sticky")}
          className="flex-1 text-center px-4 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
        >
          Start Free Assessment →
        </a>
        <a
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("whatsapp_click", { surface: "sticky" })}
          aria-label="WhatsApp coach"
          className="h-11 w-11 grid place-items-center rounded-sm border border-[var(--glass-border)] text-gold"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20.5 3.5A11 11 0 0 0 3.2 17l-1.2 4.4 4.5-1.2A11 11 0 1 0 20.5 3.5Zm-8.5 18a9 9 0 0 1-4.6-1.3l-.3-.2-2.7.7.7-2.6-.2-.3A9 9 0 1 1 12 21.5Zm5-6.7c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.5.1a7.4 7.4 0 0 1-3.7-3.2c-.3-.5.3-.5.8-1.5a.5.5 0 0 0 0-.5l-.8-2c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-1 2.3c0 1.4 1 2.7 1.2 2.9s2.1 3.2 5.1 4.5a17 17 0 0 0 1.7.6 4 4 0 0 0 1.8.1c.6-.1 1.6-.7 1.8-1.3s.2-1.2.1-1.3-.2-.2-.5-.4Z"/>
          </svg>
        </a>
      </div>
    </SiteShell>
  );
}
