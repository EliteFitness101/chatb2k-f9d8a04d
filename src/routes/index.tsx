import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { ProductCard } from "@/components/site/ProductCard";
import { CurrencyBadge } from "@/components/site/CurrencyBadge";
import { products } from "@/lib/catalog";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta({
      title: "Transform Your Body with AI Precision — Start for ₦1,000",
      description:
        "Personalized Nigerian meal plans, fitness coaching, and AI assessment designed to build your ideal body faster.",
    }),
    links: [
      { rel: "preload", as: "image", href: "/hero/product-1.webp" },
      { rel: "preload", as: "image", href: "/hero/product-2.webp" },
    ],
  }),
  component: Index,
});

const NG_FUNNEL = "https://joy-funnel-ai.lovable.app";
const INTL_FUNNEL = "https://candera.resofit.fit";
const ENROLLMENT = "https://resofit-evolution.lovable.app";
const WHATSAPP = "https://wa.me/2348000000000";

function track(event: string) {
  // soft-track if window analytics exists; no new system added
  try {
    (window as unknown as { dataLayer?: unknown[] }).dataLayer?.push({ event });
  } catch {}
}

function Index() {
  const featured = products.filter((p) => ["iron", "bench"].includes(p.category)).slice(0, 4);
  const [isNigeria, setIsNigeria] = useState(true);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      setIsNigeria(tz.includes("Africa"));
    } catch {
      setIsNigeria(false);
    }
  }, []);
  const primaryHref = isNigeria ? NG_FUNNEL : INTL_FUNNEL;

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
              Transform Your Body with <span className="text-gold-gradient">AI Precision</span>.
              <span className="block mt-2 text-3xl sm:text-4xl md:text-5xl text-foreground/90">
                Start for ₦1,000.
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
              Personalized Nigerian meal plans, fitness coaching, and AI assessment
              designed to build your ideal body faster.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href={primaryHref}
                onClick={() => track("cta_click_primary")}
                className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold tracking-wide shadow-gold hover:brightness-110 transition"
              >
                Start Your ₦1,000 Transformation
              </a>
              <Link
                to="/quiz"
                onClick={() => track("chatb2k_start")}
                className="px-6 py-3.5 rounded-sm glass text-foreground font-medium hover:border-[var(--gold)] transition"
              >
                Take AI Assessment (ChatB2K)
              </Link>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3.5 rounded-sm border border-[var(--glass-border)] text-foreground font-medium hover:border-[var(--gold)] transition"
              >
                Talk to Coach (WhatsApp)
              </a>
            </div>
            <div className="mt-6">
              <a
                href={ENROLLMENT}
                className="text-xs tracking-[0.3em] uppercase text-gold/90 hover:text-gold transition"
              >
                Already convinced? Enroll now →
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
            { title: "Home Installations", caption: "Delivered across Nigeria", emoji: "🏠" },
            { title: "Boutique Gym Deployments", caption: "Trusted by private gyms", emoji: "🏋️" },
            { title: "Nationwide Delivery Proof", caption: "Premium fitness installations", emoji: "🚚" },
          ].map((t) => (
            <div key={t.title} className="glass rounded-md overflow-hidden">
              <div className="aspect-[4/3] bg-[var(--ink)] ember-bg grid place-items-center text-5xl">
                <span aria-hidden>{t.emoji}</span>
              </div>
              <div className="p-5">
                <div className="font-display text-xl">{t.title}</div>
                <div className="text-xs tracking-widest uppercase text-gold/80 mt-2">{t.caption}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED ARSENAL */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 opacity-90">
        <SectionHeading
          eyebrow="Catalog"
          title="Browse the arsenal."
          sub="Optional gear browsing. The ₦1,000 transformation is the fastest path."
        />
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/products"
            className="inline-block px-6 py-3 rounded-sm glass hover:border-[var(--gold)] transition"
          >
            View full arsenal →
          </Link>
        </div>
      </section>

      {/* Financial Router section soft-hidden per funnel patch. */}

      {/* FINAL CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-20 text-center">
        <SectionHeading
          align="center"
          eyebrow="Your move"
          title="Build your ideal body — starting at ₦1,000."
          sub="Personalized AI plan in minutes. Coach-verified. No fluff."
        />
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <a
            href={primaryHref}
            onClick={() => track("cta_click_primary")}
            className="px-6 py-3.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
          >
            Start Your ₦1,000 Transformation
          </a>
          <a
            href={ENROLLMENT}
            onClick={() => track("checkout_initiated")}
            className="px-6 py-3.5 rounded-sm glass text-foreground hover:border-[var(--gold)] transition"
          >
            Enroll in the Evolution →
          </a>
        </div>
      </section>

      {/* MOBILE STICKY CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-[var(--glass-border)] bg-[var(--ink)]/95 backdrop-blur px-3 py-3 flex gap-2 items-center">
        <a
          href={primaryHref}
          onClick={() => track("cta_click_primary")}
          className="flex-1 text-center px-4 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
        >
          Start ₦1,000
        </a>
        <a
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
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
