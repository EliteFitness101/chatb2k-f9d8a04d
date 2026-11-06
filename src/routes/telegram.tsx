import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, CircleAlert, Crown, MessageCircle, Package, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta, canonicalLink } from "@/lib/site-meta";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready: () => void; expand: () => void; openLink?: (url: string) => void } };
  }
}
type MiniAppSession = {
  user: { id: string; first_name: string; last_name?: string; username?: string };
  client: { destination_id: string; display_name: string; bot_username?: string };
  support_url: string;
};
export const Route = createFileRoute("/telegram")({
  head: () => ({
    meta: pageMeta({ title: "ChatB2K Telegram Mini App", description: "Your ChatB2K client hub for support, purchases and membership pathways.", url: "https://chatb2k.resofit.fit/telegram" }),
    links: [canonicalLink("https://chatb2k.resofit.fit/telegram")],
  }),
  component: TelegramMiniApp,
});
function TelegramMiniApp() {
  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "outside" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const authenticate = async () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) { if (active) setStatus("outside"); return; }
      webApp.ready();
      webApp.expand();
      if (!webApp.initData) { if (active) { setError("Telegram did not provide a signed launch session. Reopen this page from your connected bot."); setStatus("error"); } return; }
      const { data, error: invokeError } = await supabase.functions.invoke("telegram-miniapp", { body: { action: "bootstrap", initData: webApp.initData } });
      if (!active) return;
      if (invokeError || !data?.ok || !data?.authenticated) { setError(data?.error || invokeError?.message || "Telegram authentication could not be completed."); setStatus("error"); return; }
      setSession(data as MiniAppSession);
      setStatus("ready");
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-telegram-webapp="true"]');
    if (existing) { void authenticate(); return () => { active = false; }; }
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.dataset.telegramWebapp = "true";
    script.onload = () => { void authenticate(); };
    script.onerror = () => { if (active) { setStatus("outside"); setError("Telegram Web App SDK could not be loaded."); } };
    document.head.appendChild(script);
    return () => { active = false; };
  }, []);
  const open = (url: string) => {
    if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
    else window.location.assign(url);
  };
  const fullName = [session?.user.first_name, session?.user.last_name].filter(Boolean).join(" ");
  return (
    <main className="min-h-screen bg-[#090909] text-[#f4f0e8] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4 border-b border-[#c9a96e]/20 pb-5">
          <div><div className="text-[10px] uppercase tracking-[0.32em] text-[#c9a96e]">ChatB2K · Client access</div><div className="mt-1 font-display text-2xl">Your connected hub</div></div>
          <div className="rounded-full border border-[#c9a96e]/35 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#d8bd8e]">Telegram Mini App</div>
        </header>
        {status === "loading" && <div className="glass mt-8 rounded-2xl p-8 text-center text-sm text-white/65">Securing your Telegram session…</div>}
        {(status === "outside" || status === "error") && <section className="glass mt-8 rounded-2xl border border-[#c9a96e]/20 p-7 sm:p-9"><CircleAlert className="h-8 w-8 text-[#c9a96e]" /><h1 className="mt-5 font-display text-3xl">Open this hub from Telegram</h1><p className="mt-3 text-sm leading-6 text-white/65">{error || "Launch this Mini App from the menu of your connected ChatB2K Telegram bot to authenticate securely."}</p><a href="https://t.me/resonancefitness_bot" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#c9a96e] px-5 py-3 text-sm font-semibold text-black">Open Telegram bot <ArrowUpRight className="h-4 w-4" /></a></section>}
        {status === "ready" && session && <>
          <section className="relative mt-7 overflow-hidden rounded-2xl border border-[#c9a96e]/25 bg-gradient-to-br from-[#1b1915] via-[#101010] to-[#090909] p-7 sm:p-9">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#c9a96e]/10 blur-3xl" />
            <div className="relative"><div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#c9a96e]"><Sparkles className="h-4 w-4" /> Welcome back</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">{fullName || session.user.username || "Telegram member"}</h1><p className="mt-3 text-sm text-white/60">Authenticated through {session.client.display_name}.</p><div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200"><ShieldCheck className="h-4 w-4" /> Telegram identity verified</div></div>
          </section>
          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            <button onClick={() => open("https://chatb2k.resofit.fit/products")} className="glass rounded-2xl border border-white/10 p-6 text-left transition hover:border-[#c9a96e]/50"><Package className="h-6 w-6 text-[#c9a96e]" /><h2 className="mt-4 font-display text-2xl">Explore & purchase</h2><p className="mt-2 text-sm leading-6 text-white/60">Browse current offers and continue through the existing secure checkout.</p><span className="mt-5 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#d8bd8e]">Browse offers <ArrowUpRight className="h-4 w-4" /></span></button>
            <button onClick={() => open("https://chatb2k.resofit.fit/products")} className="glass rounded-2xl border border-white/10 p-6 text-left transition hover:border-[#c9a96e]/50"><Crown className="h-6 w-6 text-[#c9a96e]" /><h2 className="mt-4 font-display text-2xl">Plans & subscriptions</h2><p className="mt-2 text-sm leading-6 text-white/60">Explore eligible plans. Payment and subscription entitlements remain in their existing systems.</p><span className="mt-5 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#d8bd8e]">View plans <ArrowUpRight className="h-4 w-4" /></span></button>
            <button onClick={() => open(session.support_url)} className="glass rounded-2xl border border-white/10 p-6 text-left transition hover:border-[#c9a96e]/50"><MessageCircle className="h-6 w-6 text-[#c9a96e]" /><h2 className="mt-4 font-display text-2xl">Talk to support</h2><p className="mt-2 text-sm leading-6 text-white/60">Continue in your connected Telegram bot for help and customer support.</p><span className="mt-5 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#d8bd8e]">Open support <ArrowUpRight className="h-4 w-4" /></span></button>
            <div className="glass rounded-2xl border border-white/10 p-6"><Wallet className="h-6 w-6 text-[#c9a96e]" /><h2 className="mt-4 font-display text-2xl">Payment security</h2><p className="mt-2 text-sm leading-6 text-white/60">Your purchases use the existing approved payment rails. This Mini App does not collect card details or wallet credentials.</p><div className="mt-5 inline-flex items-center gap-2 text-xs text-emerald-200"><ShieldCheck className="h-4 w-4" /> Existing checkout preserved</div></div>
          </section>
          <p className="mt-7 text-center text-[11px] leading-5 text-white/35">Telegram launch data is verified server-side. Bot credentials remain server-only.</p>
        </>}
        <footer className="mt-10 border-t border-white/10 pt-5 text-center text-[10px] tracking-widest text-white/35">CHATB2K · GOVERNED CLIENT EXPERIENCE</footer>
      </div>
    </main>
  );
}
