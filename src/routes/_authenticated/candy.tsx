import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Flame, Trophy } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { CandyGeneratorForm } from "@/components/forms/CandyGeneratorForm";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/_authenticated/candy")({
  head: () => ({
    meta: pageMeta({
      title: "Candy Generator — ResoFlex",
      description: "Coach Buchi's personalized meal & workout protocol generator.",
    }),
  }),
  component: CandyPage,
});

function CandyPage() {
  return (
    <div className="min-h-screen flex bg-background ember-bg">
      <AppSidebar />
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-4xl px-4 sm:px-8 py-10 lg:py-14">
          <div className="glass rounded-md p-6 sm:p-8 relative overflow-hidden">
            <div
              className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
              style={{ background: "var(--gradient-gold)" }}
            />
            <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="h-16 w-16 rounded-full bg-gold-gradient grid place-items-center shrink-0 shadow-gold">
                <span className="font-display text-2xl text-[var(--ink)]">CB</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.4em] uppercase text-gold">
                  <ShieldCheck className="h-3 w-3" /> Coach Buchi · Authorized
                </div>
                <h1 className="font-display text-3xl sm:text-4xl mt-1 leading-tight">
                  The Candy Generator.
                </h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  Three declarations. One personalized protocol. A meal map and workout sequence engineered for your mass, your goal, your tempo.
                </p>
              </div>
            </div>

            <div className="relative mt-6 grid grid-cols-3 gap-3 text-center">
              <Pill icon={<Flame className="h-3 w-3" />} label="Personalized" />
              <Pill icon={<Trophy className="h-3 w-3" />} label="Mavia Tier System" />
              <Pill icon={<ShieldCheck className="h-3 w-3" />} label="Coach Verified" />
            </div>
          </div>

          <div className="mt-8">
            <CandyGeneratorForm />
          </div>
        </div>
      </main>
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center justify-center gap-2 rounded-sm border border-[var(--glass-border)] bg-[var(--ink)]/40 px-3 py-2 text-[10px] tracking-[0.3em] uppercase text-foreground/80">
      <span className="text-gold">{icon}</span>
      {label}
    </div>
  );
}
