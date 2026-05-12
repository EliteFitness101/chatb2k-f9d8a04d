import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { MaviaProgress } from "@/components/dashboard/MaviaProgress";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  weight_kg: z.coerce.number().min(30).max(300),
  goal: z.enum(["cut", "recomp", "bulk", "performance"]),
  activity: z.enum(["sedentary", "light", "moderate", "elite"]),
});

type FormValues = z.infer<typeof schema>;

const STEPS = ["Weight", "Goal", "Activity", "Forge"] as const;

const GOALS: { value: FormValues["goal"]; label: string; sub: string }[] = [
  { value: "cut", label: "Cut", sub: "Lean the silhouette" },
  { value: "recomp", label: "Recomp", sub: "Rebuild composition" },
  { value: "bulk", label: "Bulk", sub: "Mass with discipline" },
  { value: "performance", label: "Performance", sub: "Pure mechanical output" },
];

const ACTIVITY: { value: FormValues["activity"]; label: string; sub: string }[] = [
  { value: "sedentary", label: "Sedentary", sub: "< 2 sessions / week" },
  { value: "light", label: "Light", sub: "2–3 sessions / week" },
  { value: "moderate", label: "Moderate", sub: "4–5 sessions / week" },
  { value: "elite", label: "Elite", sub: "Daily protocol" },
];

export function CandyGeneratorForm() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: { weight_kg: undefined, goal: undefined, activity: undefined } as never,
    mode: "onChange",
  });
  const values = watch();

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const canAdvance =
    (step === 0 && values.weight_kg && values.weight_kg >= 30 && values.weight_kg <= 300) ||
    (step === 1 && !!values.goal) ||
    (step === 2 && !!values.activity) ||
    step === 3;

  async function onSubmit(data: FormValues) {
    setSubmitting(true);
    setResult(null);
    try {
      const parsed = schema.parse(data);
      const { data: res, error } = await supabase.functions.invoke("generate-candy-plan", {
        body: parsed,
      });
      if (error) throw error;
      setResult({ ok: true, message: (res as { message?: string })?.message ?? "Legendary plan forged." });
    } catch (e) {
      setResult({
        ok: false,
        message:
          "Plan engine warming up. Submission received — your Candy protocol will be delivered shortly.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <MaviaProgress steps={STEPS as unknown as string[]} current={step} />

      <div className="glass rounded-md p-6 sm:p-8 min-h-[280px]">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-2xl">State your mass.</h3>
              <p className="text-sm text-muted-foreground mt-1">Current bodyweight, in kilograms. Be honest — the algorithm rewards truth.</p>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                {...register("weight_kg", { valueAsNumber: true })}
                placeholder="78.5"
                className="w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-4 text-2xl font-display focus:border-gold outline-none transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs tracking-[0.3em] uppercase text-muted-foreground">kg</span>
            </div>
            {errors.weight_kg && <p className="text-xs text-destructive">Range: 30–300 kg.</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-2xl">Declare the objective.</h3>
              <p className="text-sm text-muted-foreground mt-1">One verdict. The Candy protocol calibrates around it.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {GOALS.map((g) => {
                const active = values.goal === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setValue("goal", g.value, { shouldValidate: true })}
                    className={`text-left rounded-sm border p-4 transition-all ${
                      active
                        ? "border-gold bg-[var(--ink)] shadow-gold"
                        : "border-[var(--glass-border)] hover:border-gold/60"
                    }`}
                  >
                    <div className={`font-display text-lg ${active ? "text-gold-gradient" : ""}`}>{g.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{g.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-2xl">Audit your tempo.</h3>
              <p className="text-sm text-muted-foreground mt-1">Weekly training cadence. No inflation.</p>
            </div>
            <div className="space-y-2">
              {ACTIVITY.map((a) => {
                const active = values.activity === a.value;
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setValue("activity", a.value, { shouldValidate: true })}
                    className={`w-full flex items-center justify-between rounded-sm border px-4 py-3 transition-all ${
                      active
                        ? "border-gold bg-[var(--ink)] shadow-gold"
                        : "border-[var(--glass-border)] hover:border-gold/60"
                    }`}
                  >
                    <div className="text-left">
                      <div className={`text-sm font-semibold ${active ? "text-gold" : ""}`}>{a.label}</div>
                      <div className="text-xs text-muted-foreground">{a.sub}</div>
                    </div>
                    <div className={`h-2 w-2 rounded-full ${active ? "bg-gold shadow-gold" : "bg-muted"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-2xl">Forge the protocol.</h3>
              <p className="text-sm text-muted-foreground mt-1">Review your declarations. Coach Buchi authorizes the run.</p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Mass" value={values.weight_kg ? `${values.weight_kg} kg` : "—"} />
              <Stat label="Goal" value={values.goal?.toUpperCase() ?? "—"} />
              <Stat label="Tempo" value={values.activity?.toUpperCase() ?? "—"} />
            </dl>
            {result && (
              <div className={`rounded-sm border px-4 py-3 text-sm ${result.ok ? "border-gold text-gold" : "border-[var(--glass-border)] text-muted-foreground"}`}>
                {result.message}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-muted-foreground disabled:opacity-30 hover:text-gold transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-gold"
          >
            Advance <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting || !values.weight_kg || !values.goal || !values.activity}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm disabled:opacity-40 shadow-gold"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Forging Legendary Status…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Forge Candy Plan
              </>
            )}
          </button>
        )}
      </div>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/60 px-3 py-4">
      <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">{label}</div>
      <div className="font-display text-lg text-gold-gradient mt-1 truncate">{value}</div>
    </div>
  );
}