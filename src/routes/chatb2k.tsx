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

function ChatB2KPage() {
  const [stage, setStage] = useState<"landing" | "assessment" | "result">("landing");
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = useServerFn(submitAssessment);

  // Hydrate a prior session so the journey survives refreshes.
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
      const res = await submit({ data: { rsid, answers: input } });
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
            <button
              type="button"
              onClick={() => setStage("assessment")}
              className="mt-8 px-6 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold"
            >
              Begin assessment →
            </button>
          </div>
        )}

        {stage === "assessment" && current && (
          <div className="mt-8 glass rounded-md p-6 sm:p-8">
            <div className="flex items-center justify-between text-xs tracking-[0.25em] uppercase text-muted-foreground">
              <span>
                Step {step + 1} / {total}
              </span>
              {complete && (
                <button type="button" className="text-gold" onClick={() => void finish(answers)}>
                  Jump to result
                </button>
              )}
            </div>
            <div className="mt-3 h-1 w-full rounded-full bg-[var(--glass-border)]">
              <div
                className="h-1 rounded-full bg-gold-gradient transition-all"
                style={{ width: `${((step + 1) / total) * 100}%` }}
              />
            </div>

            <div className="mt-8">
              <Question
                label={current.label}
                options={current.options.map((o) => ({ v: o.value, l: o.label }))}
                value={(answers[current.key] as string | undefined) ?? null}
                onChange={choose}
              />
            </div>

            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="mt-8 text-sm text-muted-foreground hover:text-gold"
              >
                ← Back
              </button>
            )}
          </div>
        )}

        {stage === "result" && result && (
          <ResultPanel
            result={result}
            answers={answers as AssessmentInput}
            saving={saving}
            onRestart={restart}
          />
        )}
      </section>
    </SiteShell>
  );
}

function JourneyTimeline({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="mt-8 flex flex-wrap gap-2 text-[10px] tracking-[0.2em] uppercase">
      {JOURNEY.map((label, i) => (
        <li
          key={label}
          className={
            i <= activeIndex
              ? "px-3 py-1.5 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold"
              : "px-3 py-1.5 rounded-sm border border-[var(--glass-border)] text-muted-foreground"
          }
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

function ResultPanel({
  result,
  answers,
  saving,
  onRestart,
}: {
  result: Recommendation;
  answers: AssessmentInput;
  saving: boolean;
  onRestart: () => void;
}) {
  const primary = productBySku(result.primary_program_sku);
  const cart = result.ranked_skus.map((sku) => productBySku(sku)).filter(Boolean);
  const crypto = cryptoEligible(
    result.subtotal_ngn_minor,
    "NGN",
    FALLBACK_ROUTE.cryptoThresholdMinor,
  );

  return (
    <div className="mt-8 space-y-6">
      <div className="glass rounded-md p-6">
        <div className="text-xs tracking-[0.3em] uppercase text-gold">Health profile</div>
        <dl className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {ASSESSMENT_QUESTIONS.map((q) => (
            <div
              key={q.key}
              className="flex justify-between gap-4 border-b border-[var(--glass-border)] pb-2"
            >
              <dt className="text-muted-foreground">{q.label.replace(/^\d+ · /, "")}</dt>
              <dd className="text-foreground/90">
                {q.options.find((o) => o.value === answers[q.key])?.label ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="glass rounded-md p-8 border-2 border-[var(--gold)] shadow-gold">
        <div className="flex items-center justify-between">
          <div className="text-xs tracking-[0.3em] uppercase text-gold">
            ChatB2K recommendation {saving && <span className="opacity-60">· saving…</span>}
          </div>
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
            {result.engine_version}
          </div>
        </div>

        {primary && (
          <>
            <h2 className="font-display text-2xl mt-3">{primary.title}</h2>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {primary.description}
            </p>
          </>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4">
          <Score label="Confidence" value={result.confidence_score} />
          <Score label="Upsell propensity" value={result.upsell_score} />
        </div>

        <ul className="mt-6 space-y-1.5 text-xs text-muted-foreground">
          {result.rationale.map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>

        <div className="mt-8 space-y-3">
          <div className="text-xs tracking-[0.25em] uppercase text-gold">Recommended stack</div>
          {cart.map(
            (p) =>
              p && (
                <div
                  key={p.sku}
                  className="flex items-center justify-between gap-4 border-b border-[var(--glass-border)] pb-2"
                >
                  <div>
                    <div className="text-sm">{p.title}</div>
                    <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
                      {p.sku}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-gold">{formatNGN(p.ngnMinor)}</span>
                    <Link
                      to="/checkout"
                      search={{ sku: p.sku }}
                      className="text-[10px] tracking-widest uppercase border border-[var(--glass-border)] rounded-sm px-2 py-1 hover:border-[var(--gold)]"
                    >
                      Checkout
                    </Link>
                  </div>
                </div>
              ),
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
              Stack subtotal
            </div>
            <div className="font-display text-2xl text-gold-gradient">
              {formatNGN(result.subtotal_ngn_minor)}
            </div>
          </div>
          {primary && (
            <Link
              to="/checkout"
              search={{ sku: primary.sku }}
              className="shrink-0 px-5 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm"
            >
              Proceed to checkout
            </Link>
          )}
        </div>

        {crypto && (
          <div className="mt-5 text-xs tracking-widest uppercase text-gold">
            High-ticket stack · USDT / BTC settlement and concierge fulfilment unlocked
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button type="button" onClick={onRestart} className="hover:text-gold">
          ↺ Retake assessment
        </button>
        <Link to="/programs" className="text-gold">
          Browse programmes →
        </Link>
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--glass-border)]">
        <div className="h-1.5 rounded-full bg-gold-gradient" style={{ width: `${value * 100}%` }} />
      </div>
      <div className="mt-1 text-xs text-gold">{Math.round(value * 100)}%</div>
    </div>
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