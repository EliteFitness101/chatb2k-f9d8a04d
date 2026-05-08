import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: pageMeta({ title: "Dashboard", description: "Your XP, weight progression and rewards." }) }),
  component: DashboardPage,
});

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  points: number;
  tier: string;
}

interface WeightLog {
  id: string;
  weight_kg: number;
  logged_at: string;
}

function DashboardPage() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const [{ data: p }, { data: w }] = await Promise.all([
      supabase.from("profiles").select("display_name,avatar_url,xp,points,tier").eq("id", user.id).maybeSingle(),
      supabase.from("weight_logs").select("id,weight_kg,logged_at").eq("user_id", user.id).order("logged_at", { ascending: true }).limit(60),
    ]);
    setProfile(p as Profile | null);
    setLogs((w ?? []) as WeightLog[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const w = parseFloat(weight);
    if (!w || w <= 0 || w >= 500) { setErr("Enter a valid weight in kg."); return; }
    setBusy(true);
    const { error } = await supabase.from("weight_logs").insert({ user_id: user!.id, weight_kg: w });
    if (error) setErr(error.message);
    else {
      // award 10 XP per log
      await supabase.from("profiles").update({ xp: (profile?.xp ?? 0) + 10, points: (profile?.points ?? 0) + 5 }).eq("id", user!.id);
      setWeight("");
      await load();
    }
    setBusy(false);
  }

  const chartData = logs.map((l) => ({
    date: new Date(l.logged_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    kg: Number(l.weight_kg),
  }));

  const xp = profile?.xp ?? 0;
  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;

  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-20">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <SectionHeading
            eyebrow="Sanctuary"
            title={`Welcome, ${profile?.display_name ?? "Operative"}.`}
            sub="Your mechanical record. Logged, audited, irrefutable."
          />
          <button onClick={signOut} className="text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-gold">
            Sign out
          </button>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <StatCard label="Tier" value={(profile?.tier ?? "reset").toUpperCase()} />
          <StatCard label={`Level ${level}`} value={`${xpInLevel}/100 XP`}>
            <div className="mt-3 h-1.5 w-full bg-[var(--ink)] rounded-full overflow-hidden">
              <div className="h-full bg-gold-gradient transition-all" style={{ width: `${xpInLevel}%` }} />
            </div>
          </StatCard>
          <StatCard label="Reward Points" value={(profile?.points ?? 0).toLocaleString()} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="glass rounded-md p-6 lg:col-span-2">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="font-display text-2xl">Weight progression</h3>
              <span className="text-xs text-muted-foreground">{logs.length} entries</span>
            </div>
            {chartData.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Log your first weight to begin the record.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--glass-border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit="kg" />
                    <Tooltip contentStyle={{ background: "var(--ink)", border: "1px solid var(--glass-border)", borderRadius: 4 }} />
                    <Line type="monotone" dataKey="kg" stroke="hsl(45 70% 55%)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <form onSubmit={logWeight} className="glass rounded-md p-6 space-y-4 h-fit">
            <h3 className="font-display text-2xl">Log weight</h3>
            <p className="text-xs text-muted-foreground">+10 XP · +5 points per log</p>
            <input
              type="number"
              step="0.1"
              min="1"
              max="499"
              required
              placeholder="kg"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3 text-sm"
            />
            {err && <div className="text-xs text-destructive">{err}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm disabled:opacity-60"
            >
              {busy ? "…" : "Authorize entry"}
            </button>
            <Link to="/products" className="block text-center text-xs text-muted-foreground hover:text-gold">
              Browse the Arsenal →
            </Link>
          </form>
        </div>
      </section>
    </SiteShell>
  );
}

function StatCard({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="glass rounded-md p-6">
      <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl text-gold-gradient">{value}</div>
      {children}
    </div>
  );
}