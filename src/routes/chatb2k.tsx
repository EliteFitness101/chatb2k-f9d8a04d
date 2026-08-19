import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { productBySku, formatNGN } from "@/lib/catalog";
import { pageMeta, breadcrumbScript, canonicalLink, SITE_URL } from "@/lib/site-meta";
import { getAttribution } from "@/lib/attribution";
import { submitAssessment } from "@/lib/assessment.functions";
import {
  ASSESSMENT_QUESTIONS,
  recommend,
  type AssessmentInput,
  type Recommendation,
} from "@/lib/commerce/recommendation";
import { cryptoEligible, FALLBACK_ROUTE } from "@/lib/commerce/regions";

export const Route = createFileRoute("/chatb2k")({
  head: () => ({
    meta: pageMeta({
      title: "ChatB2K",
      description:
        "ChatB2K — your personal wellness intelligence. Assessment, health profile, recommendation and checkout in one concierge journey.",
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

const STORAGE_KEY = "chatb2k_assessment_v3";

const JOURNEY = [
  "Assessment",
  "Health Profile",
  "Recommendation",
  "Checkout",
  "Payment",
  "Fulfilment",
  "Follow-up",
];

type Answers = Partial<AssessmentInput>;

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const key = "rf_session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}

function ChatB2KPage() {
  const [stage, setStage] = useState<"landing" | "assessment" | "result">("landing");
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = useServerFn(submitAssessment);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { answers?: Answers; result?: Recommendation | null };
      if (parsed.answers) setAnswers(parsed.answers);
      if (parsed.result) {
        setResult(parsed.result);
        setStage("result");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, result }));
    } catch {
      /* ignore */
    }
  }, [answers, result]);

  const total = ASSESSMENT_QUESTIONS.length;
  const current = ASSESSMENT_QUESTIONS[step];
  const complete = ASSESSMENT_QUESTIONS.every((q) => Boolean(answers[q.key]));

  async function finish(final: Answers) {
    const input = final as AssessmentInput;
    setResult(recommend(input));
    setStage("result");
    setSaving(true);
    try {
      const { rsid } = getAttribution();
      const res = await submit({
        data: {
          rsid,
          anon_id: rsid || null,
          session_id: getSessionId() || null,
          answers: input,
        },
      });
      if (res?.recommendation) setResult(res.recommendation);
    } catch {
      /* recommendation already computed client-side */
    } finally {
      setSaving(false);
    }
  }

  function choose(value: string) {
    const next = { ...answers, [current.key]: value } as Answers;
    setAnswers(next);
    if (step + 1 < total) setStep(step + 1);
    else void finish(next);
  }

  function restart() {
    setAnswers({});
    setResult(null);
    setStep(0);
    setStage("assessment");
  }

  const stageIndex = stage === "result" ? 2 : stage === "assessment" ? 0 : -1;

  return (
    <SiteShell>
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Layer · Intelligence"
          title="ChatB2K."
          sub="One continuous journey: assessment → health profile → recommendation → checkout → fulfilment."
        />
        <JourneyTimeline activeIndex={stageIndex} />
        {stage === "landing" && (
          <div className="mt-8 glass rounded-md p-8">
            <h2 className="font-display text-2xl">Your personal wellness intelligence.</h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Seven questions. ChatB2K builds a normalized health profile, then returns a primary
              programme, the equipment that fits your space, a nutrition protocol and — where it is
              warranted — a coaching membership. Every recommendation carries a confidence score.
            </p>
            <button type="button" onClick={() => setStage("assessment")} className="mt-8 px-6 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold">
              Begin assessment →
            </button>
          </div>
        )}
        {stage === "assessment" && current && (
          <div className="mt-8 glass rounded-md p-6 sm:p-8">
            <div className="flex items-center justify-between text-xs tracking-[0.25em] uppercase text-muted-foreground">
              <span>Step {step + 1} / {total}</span>
              {complete && <button type="button" className="text-gold" onClick={() => void finish(answers)}>Jump to result</button>}
            </div>
            <div className="mt-3 h-1 w-full rounded-full bg-[var(--glass-border)]">
              <div className="h-1 rounded-full bg-gold-gradient transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
            </div>
            <div className="mt-8">
              <Question
                label={current.label}
                options={current.options.map((o) => ({ v: o.value, l: o.label }))}
                value={(answers[current.key] as string | undefined) ?? null}
                onChange={choose}
              />
            </div>
            {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="mt-8 text-sm text-muted-foreground hover:text-gold">← Back</button>}
          </div>
        )}
        {stage === "result" && result && <ResultPanel result={result} answers={answers as AssessmentInput} saving={saving} onRestart={restart} />}
      </section>
    </SiteShell>
  );
}

function JourneyTimeline({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="mt-8 flex flex-wrap gap-2 text-[10px] tracking-[0.2em] uppercase">
      {JOURNEY.map((label, i) => (
        <li key={label} className={i <= activeIndex ? "px-3 py-1.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold" : "px-3 py-1.5 rounded-sm border border-[var(--glass-border)] text-muted-foreground"}>
          {label}
        </li>
      ))}
    </ol>
  );
}

function ResultPanel({ result, answers, saving, onRestart }: { result: Recommendation; answers: AssessmentInput; saving: boolean; onRestart: () => void }) {
  const primary = productBySku(result.primary_program_sku);
  const cart = result.ranked_skus.map((sku) => productBySku(sku)).filter(Boolean);
  const crypto = cryptoEligible(result.subtotal_ngn_minor, "NGN", FALLBACK_ROUTE.cryptoThresholdMinor);

  return (
    <div className="mt-8 space-y-6">
      <div className="glass rounded-md p-6">
        <div className="text-xs tracking-[0.3em] uppercase text-gold">Health profile</div>
        <dl className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {ASSESSMENT_QUESTIONS.map((q) => (
            <div key={q.key} className="flex justify-between gap-4 border-b border-[var(--glass-border)] pb-2">
              <dt className="text-muted-foreground">{q.label.replace(/^\d+ · /, "")}</dt>
              <dd className="text-foreground/90">{q.options.find((o) => o.value === answers[q.key])?.label ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="glass rounded-md p-8 border-2 border-[var(--gold)] shadow-gold">
        <div className="flex items-center justify-between">
          <div className="text-xs tracking-[0.3em] uppercase text-gold">Recommendation</div>
          <div className="text-xs text-muted-foreground">Confidence {Math.round(result.confidence_score * 100)}%</div>
        </div>
        <h2 className="font-display text-2xl mt-3">{primary?.title ?? result.primary_program_sku}</h2>
        <p className="text-sm text-muted-foreground mt-2">{primary?.description ?? "Your primary protocol."}</p>
        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          {cart.map((p) => p && (
            <Link key={p.sku} to="/checkout" search={{ sku: p.sku }} className="glass rounded-sm p-4 hover:border-[var(--gold)] transition">
              <div className="text-xs tracking-widest uppercase text-gold">{p.category}</div>
              <div className="font-display mt-1">{p.title}</div>
              <div className="text-sm mt-2">{formatNGN(p.ngnMinor)}</div>
              <div className="text-xs text-muted-foreground mt-2">Continue to checkout →</div>
            </Link>
          ))}
        </div>
        {crypto && (
          <div className="mt-5 text-xs text-gold tracking-widest uppercase">Apex threshold reached · crypto settlement available</div>
        )}
        <button type="button" onClick={onRestart} className="mt-6 text-sm text-muted-foreground hover:text-gold">Retake assessment</button>
      </div>
      {saving && <div className="text-xs text-muted-foreground text-center">Saving your intelligence profile…</div>}
    </div>
  );
}

function Question({ label, options, value, onChange }: { label: string; options: { v: string; l: string }[]; value: string | null; onChange: (value: string) => void }) {
  return (
    <div>
      <h2 className="font-display text-xl">{label}</h2>
      <div className="mt-5 grid gap-3">
        {options.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} className={value === o.v ? "w-full text-left glass rounded-sm p-4 border-2 border-[var(--gold)]" : "w-full text-left glass rounded-sm p-4 hover:border-[var(--gold)] transition"}>
            <span className="text-sm">{o.l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
