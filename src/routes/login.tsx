import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { SiteShell } from "@/components/site/SiteShell";
import { SectionHeading } from "@/components/site/SectionHeading";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/login")({
  validateSearch: (s) => z.object({ redirect: z.string().optional() }).parse(s),
  head: () => ({ meta: pageMeta({ title: "Sign in", description: "Access your ResoFlex dashboard." }) }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: redirect ?? "/dashboard" });
  }, [user, navigate, redirect]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: name },
          },
        });
        if (error) throw error;
        setErr("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setErr(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) setErr(result.error.message ?? "Google sign-in failed");
  }

  return (
    <SiteShell>
      <section className="mx-auto max-w-md px-4 sm:px-6 pt-12 pb-20">
        <SectionHeading
          eyebrow="Membership"
          title={mode === "signin" ? "Welcome back." : "Join the Sanctuary."}
          sub="Track XP, log weight, climb the leaderboard."
        />
        <div className="mt-8 glass rounded-md p-6 space-y-4">
          <button
            onClick={handleGoogle}
            className="w-full px-4 py-3 rounded-sm border border-[var(--glass-border)] hover:bg-white/5 text-sm font-medium"
          >
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-[var(--glass-border)]" />
            or
            <div className="h-px flex-1 bg-[var(--glass-border)]" />
          </div>
          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3 text-sm"
              />
            )}
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3 text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--glass-border)] rounded-sm px-4 py-3 text-sm"
            />
            {err && <div className="text-xs text-destructive">{err}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-3 rounded-sm bg-gold-gradient text-[var(--ink)] font-semibold text-sm disabled:opacity-60"
            >
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <button
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="w-full text-xs text-muted-foreground hover:text-gold"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
        <div className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">← Back home</Link>
        </div>
      </section>
    </SiteShell>
  );
}