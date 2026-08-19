import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SiteShell } from "@/components/site/SiteShell";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";
import { products } from "@/lib/catalog";

export const Route = createFileRoute("/quiz")({
  head: () => ({
    meta: pageMeta({
      title: "Metabolic Reset Quiz",
      description: "Three questions. One Bionic Readiness Report. Discover the exact ResoFit next step.",
      url: SITE_URL + "/quiz",
      type: "website",
    }),
    links: [canonicalLink(SITE_URL + "/quiz")],
    scripts: [breadcrumbScript([{ name: "Home", url: SITE_URL + "/" }, { name: "Assessment", url: SITE_URL + "/quiz" }])],
  }),
  component: QuizPage,
});

type Goal = "strength" | "shred" | "longevity";
type Load = 1 | 2 | 3;
type Focus = "hardware" | "supplements" | "apparel";
interface Answers { goal?: Goal; load?: Load; focus?: Focus; }

const goalOptions: { id: Goal; title: string; sub: string; symbol: string }[] = [
  { id: "strength", title: "Strength", sub: "Build raw mechanical authority. Iron, compound lifts, ancestral load.", symbol: "◆" },
  { id: "shred", title: "Shred", sub: "Cut without losing power. Metabolic precision, Nigerian-fuelled.", symbol: "◇" },
  { id: "longevity", title: "Longevity", sub: "Reset the system. Recovery, mobility, life-long sustainability.", symbol: "◈" },
];
const loadOptions: { id: Load; title: string; sub: string }[] = [
  { id: 1, title: "Level 1", sub: "Foundation. Returning, restarting or beginning the protocol." },
  { id: 2, title: "Level 2", sub: "Intermediate. Trained consistently for 6+ months." },
  { id: 3, title: "Level 3", sub: "Apex. Years under the bar. Ready for global verification." },
];
const focusOptions: { id: Focus; title: string; sub: string }[] = [
  { id: "hardware", title: "Hardware", sub: "Cast iron, benches, the physical sanctuary." },
  { id: "supplements", title: "Supplements", sub: "Bio-Fuel — creatine, recovery, daily stack." },
  { id: "apparel", title: "Apparel", sub: "Compression, ribbed activewear, the uniform." },
];

function QuizPage() {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [answers, setAnswers] = useState<Answers>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("resoflex.quiz.v1");
      if (raw) {
        const saved = JSON.parse(raw) as { answers?: Answers; step?: 0 | 1 | 2 | 3 };
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.step === "number") setStep(saved.step);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem("resoflex.quiz.v1", JSON.stringify({ answers, step })); } catch {}
  }, [answers, step]);

  const total = 3;
  const progress = step === 3 ? 100 : (step / total) * 100;
  return (
    <SiteShell>
      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 ember-bg pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_18%_20%,oklch(0.78_0.13_87/0.16),transparent_36%),radial-gradient(circle_at_82%_72%,oklch(0.55_0.08_80/0.10),transparent_40%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 pt-10 sm:pt-16 pb-24">
          {step < 3 && (
            <div className="mb-10 glass rounded-2xl p-4 sm:p-5 border border-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between text-[10px] sm:text-xs tracking-[0.3em] uppercase text-gold mb-3">
                <span>ResoFit™ Private Assessment</span><span>Step {step + 1} / {total}</span>
              </div>
              <div className="h-1 bg-white/5 overflow-hidden rounded-full"><motion.div className="h-full bg-gold-gradient" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: "easeOut" }} /></div>
              <div className="mt-3 text-[10px] text-muted-foreground">60 seconds. One curated next step.</div>
            </div>
          )}
          <AnimatePresence mode="wait">
            {step === 0 && <StepCard key="goal" eyebrow="01 · Intent" title="Select your goal.">{goalOptions.map((o) => <Choice key={o.id} selected={answers.goal === o.id} onClick={() => { setAnswers((a) => ({ ...a, goal: o.id })); setTimeout(() => setStep(1), 220); }} title={`${o.symbol}  ${o.title}`} sub={o.sub} />)}</StepCard>}
            {step === 1 && <StepCard key="load" eyebrow="02 · Physiological Load" title="Where do you stand?">{loadOptions.map((o) => <Choice key={o.id} selected={answers.load === o.id} onClick={() => { setAnswers((a) => ({ ...a, load: o.id })); setTimeout(() => setStep(2), 220); }} title={o.title} sub={o.sub} />)}<BackButton onClick={() => setStep(0)} /></StepCard>}
            {step === 2 && <StepCard key="focus" eyebrow="03 · Focus Area" title="Where should we begin?">{focusOptions.map((o) => <Choice key={o.id} selected={answers.focus === o.id} onClick={() => { setAnswers((a) => ({ ...a, focus: o.id })); setTimeout(() => setStep(3), 220); }} title={o.title} sub={o.sub} />)}<BackButton onClick={() => setStep(1)} /></StepCard>}
            {step === 3 && answers.goal && answers.load && answers.focus && <ResultCard key="result" answers={answers as Required<Answers>} onRestart={() => { setAnswers({}); setStep(0); if (typeof window !== "undefined") window.localStorage.removeItem("resoflex.quiz.v1"); }} />}
          </AnimatePresence>
        </div>
      </section>
    </SiteShell>
  );
}

function StepCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.45, ease: "easeOut" }}><div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">{eyebrow}</div><h1 className="font-display text-4xl sm:text-6xl mb-10 leading-tight">{title}</h1><div className="space-y-3">{children}</div></motion.div>;
}
function Choice({ title, sub, selected, onClick }: { title: string; sub: string; selected?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`w-full text-left glass rounded-2xl p-5 sm:p-6 transition-all duration-300 group backdrop-blur-xl border border-white/10 ${selected ? "border-[var(--gold)] shadow-gold scale-[0.99]" : "hover:border-[var(--gold)] hover:shadow-gold"}`}><div className="flex items-start justify-between gap-4"><div><div className="font-display text-2xl group-hover:text-gold transition">{title}</div><div className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{sub}</div></div><div className="text-gold text-xl opacity-40 group-hover:opacity-100 transition shrink-0">→</div></div></button>;
}
function BackButton({ onClick }: { onClick: () => void }) { return <button onClick={onClick} className="mt-6 text-xs tracking-widest uppercase text-muted-foreground hover:text-gold transition">← Previous</button>; }

function buildReport(a: Required<Answers>) {
  const overseer = a.goal === "shred" ? "mavia" : "buchi";
  const apex = products.find((p) => p.apex);
  const ironPick = products.find((p) => p.category === "iron" && p.weightKg === (a.load === 1 ? 15 : a.load === 2 ? 30 : 50)) || products.find((p) => p.category === "iron");
  const recommended = a.load === 3 && apex ? apex : ironPick || products[0];
  const goalCopy: Record<Goal, string> = { strength: "Mechanical authority. Iron, load and compound dominance.", shred: "Metabolic precision. Lean composition without losing watts.", longevity: "Sustainable resonance. Recovery-first, decade-scale output." };
  const focusCopy: Record<Focus, string> = { hardware: "Cast iron leads. Bio-Fuel and uniform follow.", supplements: "Bio-Fuel leads. Hardware and uniform follow.", apparel: "Uniform leads. Hardware and Bio-Fuel follow." };
  const tier = a.load === 1 ? "Initiate" : a.load === 2 ? "Verified" : "Apex";
  return { overseer, recommended, goalCopy: goalCopy[a.goal], focusCopy: focusCopy[a.focus], tier };
}

function ResultCard({ answers, onRestart }: { answers: Required<Answers>; onRestart: () => void }) {
  const r = buildReport(answers);
  const [curating, setCurating] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const redirectedRef = useRef(false);
  const checkoutPath = `/paystack?sku=${encodeURIComponent(r.recommended.sku)}`;
  const checkoutUrl = (typeof window !== "undefined" ? window.location.origin : SITE_URL) + checkoutPath;
  const priceNgn = `₦${(r.recommended.ngnMinor / 100).toLocaleString("en-NG")}`;
  const overseerName = r.overseer === "buchi" ? "Coach Buchi" : "Coach Mavia";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurating(false);
      setRedirecting(true);
      window.setTimeout(() => {
        if (redirectedRef.current) return;
        redirectedRef.current = true;
        window.location.assign(checkoutPath);
      }, 850);
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [checkoutPath]);

  const reportText = `ResoFit™ Curated Recommendation\nTier: ${r.tier}\nAssigned: ${overseerName}\nRecommended: ${r.recommended.title} — ${priceNgn}\n\n${r.goalCopy} ${r.focusCopy}\n\nCheckout: ${checkoutUrl}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;

  return <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-2xl">
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_15%_15%,oklch(0.78_0.13_87/0.18),transparent_30%),radial-gradient(circle_at_85%_85%,oklch(0.68_0.10_80/0.10),transparent_34%)]" />
      <div className="relative p-6 sm:p-10">
        <div className="flex items-center justify-between gap-4 mb-8"><div><div className="text-[10px] tracking-[0.35em] uppercase text-gold">ResoFit™ Private Concierge</div><div className="mt-2 text-sm text-muted-foreground">Your answers have been translated into one validated next action.</div></div><div className="h-12 w-12 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 flex items-center justify-center text-gold">✦</div></div>
        {curating ? <CuratingState /> : <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">Recommendation ready</div>
          <h1 className="font-display text-4xl sm:text-6xl leading-[1.03]">Your exact next step.</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">No storefront browsing. The validated recommendation is being opened directly.</p>
          <div className="mt-8 grid md:grid-cols-[0.85fr_1.15fr] gap-5">
            <div className="relative min-h-64 rounded-2xl overflow-hidden border border-white/10 bg-black/30"><div className="absolute inset-0 [background:radial-gradient(circle_at_50%_35%,oklch(0.78_0.13_87/0.24),transparent_28%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.01))]" /><div className="relative h-full min-h-64 flex flex-col justify-end p-6"><div className="text-[10px] tracking-[0.3em] uppercase text-gold">Curated for {r.tier}</div><div className="mt-2 font-display text-3xl">{r.recommended.title}</div><div className="mt-2 text-sm text-muted-foreground">{r.recommended.tagline}</div></div></div>
            <div className="glass rounded-2xl p-6 border border-white/10"><div className="text-[10px] tracking-[0.3em] uppercase text-gold">Your recommendation</div><div className="mt-3 font-display text-2xl sm:text-3xl">{r.recommended.title}</div><div className="mt-2 text-2xl text-gold-gradient font-display">{priceNgn}</div><p className="mt-4 text-sm text-muted-foreground leading-relaxed">{r.recommended.description}</p><ul className="mt-5 space-y-2 text-sm">{r.recommended.highlights.slice(0, 3).map((h) => <li key={h} className="flex gap-2"><span className="text-gold">◆</span>{h}</li>)}</ul><div className="mt-6 rounded-xl border border-[var(--gold)]/25 bg-[var(--gold)]/10 p-4"><div className="text-xs text-gold font-semibold">Opening the exact checkout</div><div className="mt-1 text-xs text-muted-foreground">No catalog detour. No search required.</div></div></div>
          </div>
          {redirecting && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 flex items-center justify-center gap-3 text-sm text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[var(--gold)] animate-pulse" />Securing your recommendation and opening checkout…</motion.div>}
          <div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/paystack" search={{ sku: r.recommended.sku }} className="px-7 py-4 rounded-xl bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold">Continue to exact checkout →</Link><a href={waUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-4 rounded-xl glass text-sm hover:border-[var(--gold)] transition">Share recommendation</a><button onClick={onRestart} className="px-6 py-4 rounded-xl glass text-sm text-muted-foreground hover:text-foreground hover:border-[var(--gold)] transition">Re-run assessment</button></div>
        </motion.div>}
      </div>
    </div>
  </motion.div>;
}

function CuratingState() {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 sm:py-16 text-center">
    <div className="mx-auto relative h-28 w-28"><motion.div className="absolute inset-0 rounded-full border border-[var(--gold)]/20" animate={{ rotate: 360 }} transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }} /><motion.div className="absolute inset-3 rounded-full border border-[var(--gold)]/35 border-t-transparent" animate={{ rotate: -360 }} transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }} /><div className="absolute inset-0 flex items-center justify-center font-display text-3xl text-gold-gradient">RF</div></div>
    <div className="mt-8 text-[10px] tracking-[0.35em] uppercase text-gold">Private concierge curation</div>
    <h2 className="mt-3 font-display text-3xl sm:text-5xl">Curating the exact ResoFit match…</h2>
    <p className="mt-4 max-w-xl mx-auto text-sm sm:text-base text-muted-foreground leading-relaxed">Checking your goal, level and focus against validated ResoFit offers. The next screen will open the exact recommended checkout.</p>
    <div className="mt-8 mx-auto max-w-sm h-2 rounded-full bg-white/5 overflow-hidden"><motion.div className="h-full bg-gold-gradient" initial={{ width: "8%" }} animate={{ width: "96%" }} transition={{ duration: 1.35, ease: "easeInOut" }} /></div>
  </motion.div>;
}
