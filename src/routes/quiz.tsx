import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SiteShell } from "@/components/site/SiteShell";
import { pageMeta } from "@/lib/site-meta";
import { products } from "@/lib/catalog";

export const Route = createFileRoute("/quiz")({
  head: () => ({
    meta: pageMeta({
      title: "Metabolic Reset Quiz",
      description:
        "Three questions. One Bionic Readiness Report. Discover your assigned Overseer and your custom 315 Bundle.",
    }),
  }),
  component: QuizPage,
});

type Goal = "strength" | "shred" | "longevity";
type Load = 1 | 2 | 3;
type Focus = "hardware" | "supplements" | "apparel";

interface Answers {
  goal?: Goal;
  load?: Load;
  focus?: Focus;
}

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

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("resoflex.quiz.v1");
      if (raw) {
        const saved = JSON.parse(raw) as { answers?: Answers; step?: 0 | 1 | 2 | 3 };
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.step === "number") setStep(saved.step);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist on every change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "resoflex.quiz.v1",
        JSON.stringify({ answers, step }),
      );
    } catch {
      /* ignore */
    }
  }, [answers, step]);

  const total = 3;
  const progress = step === 3 ? 100 : (step / total) * 100;

  return (
    <SiteShell>
      <section className="relative">
        <div className="absolute inset-0 ember-bg pointer-events-none" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-24">
          {/* Progress */}
          {step < 3 && (
            <div className="mb-10">
              <div className="flex items-center justify-between text-xs tracking-[0.3em] uppercase text-gold mb-3">
                <span>Metabolic Reset</span>
                <span>Step {step + 1} / {total}</span>
              </div>
              <div className="h-[2px] bg-[var(--glass-border)] overflow-hidden rounded-full">
                <motion.div
                  className="h-full bg-gold-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 0 && (
              <StepCard key="goal" eyebrow="01 · Intent" title="Select your goal.">
                {goalOptions.map((o) => (
                  <Choice
                    key={o.id}
                    selected={answers.goal === o.id}
                    onClick={() => {
                      setAnswers((a) => ({ ...a, goal: o.id }));
                      setTimeout(() => setStep(1), 220);
                    }}
                    title={`${o.symbol}  ${o.title}`}
                    sub={o.sub}
                  />
                ))}
              </StepCard>
            )}

            {step === 1 && (
              <StepCard key="load" eyebrow="02 · Physiological Load" title="Where do you stand?">
                {loadOptions.map((o) => (
                  <Choice
                    key={o.id}
                    selected={answers.load === o.id}
                    onClick={() => {
                      setAnswers((a) => ({ ...a, load: o.id }));
                      setTimeout(() => setStep(2), 220);
                    }}
                    title={o.title}
                    sub={o.sub}
                  />
                ))}
                <BackButton onClick={() => setStep(0)} />
              </StepCard>
            )}

            {step === 2 && (
              <StepCard key="focus" eyebrow="03 · Focus Area" title="Where should we begin?">
                {focusOptions.map((o) => (
                  <Choice
                    key={o.id}
                    selected={answers.focus === o.id}
                    onClick={() => {
                      setAnswers((a) => ({ ...a, focus: o.id }));
                      setTimeout(() => setStep(3), 220);
                    }}
                    title={o.title}
                    sub={o.sub}
                  />
                ))}
                <BackButton onClick={() => setStep(1)} />
              </StepCard>
            )}

            {step === 3 && answers.goal && answers.load && answers.focus && (
              <ResultCard
                key="result"
                answers={answers as Required<Answers>}
                onRestart={() => {
                  setAnswers({});
                  setStep(0);
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem("resoflex.quiz.v1");
                  }
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </section>
    </SiteShell>
  );
}

function StepCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">{eyebrow}</div>
      <h1 className="font-display text-4xl sm:text-5xl mb-10 leading-tight">{title}</h1>
      <div className="space-y-3">{children}</div>
    </motion.div>
  );
}

function Choice({
  title,
  sub,
  selected,
  onClick,
}: {
  title: string;
  sub: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left glass rounded-md p-5 sm:p-6 transition-all duration-300 group ${
        selected
          ? "border-[var(--gold)] shadow-gold scale-[0.99]"
          : "hover:border-[var(--gold)] hover:shadow-gold"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-2xl group-hover:text-gold transition">{title}</div>
          <div className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{sub}</div>
        </div>
        <div className="text-gold text-xl opacity-40 group-hover:opacity-100 transition shrink-0">→</div>
      </div>
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 text-xs tracking-widest uppercase text-muted-foreground hover:text-gold transition"
    >
      ← Previous
    </button>
  );
}

// --- Result Logic ---

function buildReport(a: Required<Answers>) {
  // Overseer assignment: Buchi for strength/longevity, Mavia for shred
  const overseer = a.goal === "shred" ? "mavia" : "buchi";

  // Pick the Apex bundle product if exists, otherwise the first matching category product
  const apex = products.find((p) => p.apex);
  const ironPick =
    products.find((p) => p.category === "iron" && p.weightKg === (a.load === 1 ? 15 : a.load === 2 ? 30 : 50)) ||
    products.find((p) => p.category === "iron");
  const recommended = a.load === 3 && apex ? apex : ironPick || products[0];

  const goalCopy: Record<Goal, string> = {
    strength: "Mechanical authority. Iron, load and compound dominance.",
    shred: "Metabolic precision. Lean composition without losing watts.",
    longevity: "Sustainable resonance. Recovery-first, decade-scale output.",
  };

  const focusCopy: Record<Focus, string> = {
    hardware: "Cast iron leads. Bio-Fuel and uniform follow.",
    supplements: "Bio-Fuel leads. Hardware and uniform follow.",
    apparel: "Uniform leads. Hardware and Bio-Fuel follow.",
  };

  const tier = a.load === 1 ? "Initiate" : a.load === 2 ? "Verified" : "Apex";

  return { overseer, recommended, goalCopy: goalCopy[a.goal], focusCopy: focusCopy[a.focus], tier };
}

function ResultCard({
  answers,
  onRestart,
}: {
  answers: Required<Answers>;
  onRestart: () => void;
}) {
  const r = buildReport(answers);
  const [authorized, setAuthorized] = useState(false);

  // Build share payload
  const checkoutUrl =
    (typeof window !== "undefined" ? window.location.origin : "") +
    `/paystack?sku=${encodeURIComponent(r.recommended.sku)}`;

  const overseerName = r.overseer === "buchi" ? "Coach Buchi" : "Coach Mavia";
  const priceNgn = `₦${(r.recommended.ngnMinor / 100).toLocaleString("en-NG")}`;
  const reportText =
    `ResoFlex™ Bionic Readiness Report\n` +
    `Tier: ${r.tier}\n` +
    `Overseer: ${overseerName}\n` +
    `Bundle: ${r.recommended.title} — ${priceNgn}\n\n` +
    `${r.goalCopy} ${r.focusCopy}\n\n` +
    `Authorize & checkout: ${checkoutUrl}`;

  const waUrl = `https://wa.me/?text=${encodeURIComponent(reportText)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(checkoutUrl)}&text=${encodeURIComponent(reportText)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(
    `ResoFlex™ Bionic Readiness Report — Tier ${r.tier}`,
  )}&body=${encodeURIComponent(reportText)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="text-xs tracking-[0.3em] uppercase text-gold mb-3">Bionic Readiness Report</div>
      <h1 className="font-display text-4xl sm:text-6xl mb-2 leading-[1.05]">
        Tier: <span className="text-gold-gradient">{r.tier}</span>
      </h1>
      <p className="text-muted-foreground mb-10 max-w-xl">{r.goalCopy} {r.focusCopy}</p>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Overseer card */}
        <div className="glass rounded-md overflow-hidden">
          <div className="relative h-64 bg-[var(--ink)] flex items-center justify-center border-b border-[var(--glass-border)]">
            <div className="absolute inset-0 ember-bg" />
            <div className="relative text-center">
              <div className="font-display text-7xl text-gold-gradient leading-none">
                {r.overseer === "buchi" ? "B" : "M"}
              </div>
              <div className="mt-3 tracking-[0.3em] text-[10px] text-gold uppercase">
                Assigned Overseer
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="font-display text-2xl">
              {r.overseer === "buchi" ? "Coach Buchi" : "Coach Mavia"}
            </div>
            <div className="text-xs tracking-widest uppercase text-gold mt-1">
              {r.overseer === "buchi" ? "White Turban · Strength Doctrine" : "Charcoal Gear · Metabolic Doctrine"}
            </div>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {r.overseer === "buchi"
                ? "Architect of cast iron protocol. Verifies your load and your lineage."
                : "Architect of metabolic precision. Cuts the noise. Calibrates the fuel."}
            </p>
          </div>
        </div>

        {/* Recommended bundle */}
        <div className="glass rounded-md p-6 flex flex-col">
          <div className="text-xs tracking-[0.3em] uppercase text-gold mb-2">Your 315 Bundle</div>
          <div className="font-display text-2xl">{r.recommended.title}</div>
          <p className="text-sm text-muted-foreground mt-2 flex-1 leading-relaxed">
            {r.recommended.description}
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {r.recommended.highlights.slice(0, 3).map((h) => (
              <li key={h} className="flex gap-2">
                <span className="text-gold">◆</span> {h}
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-5 border-t border-[var(--glass-border)] flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Verified pricing</span>
            <span className="font-display text-2xl text-gold-gradient">
              ₦{(r.recommended.ngnMinor / 100).toLocaleString("en-NG")}
            </span>
          </div>
        </div>
      </div>

      {/* Slide to Authorize */}
      <div className="mt-10">
        <SlideToAuthorize onComplete={() => setAuthorized(true)} done={authorized} />
        <AnimatePresence>
          {authorized && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 space-y-5"
            >
              <div className="flex flex-wrap gap-3 justify-center">
                <Link
                  to="/paystack"
                  search={{ sku: r.recommended.sku }}
                  className="px-6 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold shadow-gold"
                >
                  Proceed to Paystack Checkout →
                </Link>
                <button
                  onClick={onRestart}
                  className="px-6 py-3 rounded-sm glass text-foreground hover:border-[var(--gold)] transition"
                >
                  Re-run quiz
                </button>
              </div>

              <div>
                <div className="text-center text-[10px] tracking-[0.3em] uppercase text-gold mb-3">
                  Send report to yourself
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-sm glass text-sm hover:border-[var(--gold)] transition"
                  >
                    WhatsApp
                  </a>
                  <a
                    href={tgUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-sm glass text-sm hover:border-[var(--gold)] transition"
                  >
                    Telegram
                  </a>
                  <a
                    href={mailUrl}
                    className="px-4 py-2 rounded-sm glass text-sm hover:border-[var(--gold)] transition"
                  >
                    Email
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function SlideToAuthorize({ onComplete, done }: { onComplete: () => void; done: boolean }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const TRACK_PAD = 8;
  const KNOB = 56;

  return (
    <div ref={trackRef} className="relative h-16 w-full glass rounded-full overflow-hidden select-none">
      {/* Fill */}
      <motion.div
        className="absolute inset-y-0 left-0 bg-gold-gradient opacity-30"
        animate={{ width: done ? "100%" : `${x + KNOB + TRACK_PAD}px` }}
        transition={dragging ? { duration: 0 } : { duration: 0.3 }}
      />
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="font-display text-lg tracking-[0.25em] uppercase text-gold">
          {done ? "Authorized ✓" : "Slide to Authorize"}
        </span>
      </div>
      {/* Knob */}
      {!done && (
        <motion.button
          drag="x"
          dragConstraints={trackRef}
          dragElastic={0}
          dragMomentum={false}
          onDragStart={() => setDragging(true)}
          onDrag={(_, info) => setX(Math.max(0, info.offset.x))}
          onDragEnd={(_, info) => {
            setDragging(false);
            const parentWidth = trackRef.current?.clientWidth ?? 600;
            const threshold = parentWidth - KNOB - TRACK_PAD * 2 - 20;
            if (info.offset.x > threshold) {
              onComplete();
              setX(parentWidth - KNOB - TRACK_PAD * 2);
            } else {
              setX(0);
            }
          }}
          className="absolute top-1 left-1 h-14 w-14 rounded-full bg-gold-gradient text-[var(--ink)] flex items-center justify-center font-bold text-xl shadow-gold cursor-grab active:cursor-grabbing z-10"
          style={{ touchAction: "none" }}
        >
          →
        </motion.button>
      )}
    </div>
  );
}