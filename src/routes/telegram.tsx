import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/telegram")({
  component: TelegramControlPage,
});

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: "light" | "dark";
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type BootstrapResponse = {
  ok: boolean;
  authenticated: boolean;
  user: {
    id: string;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  client: {
    destination_id: string;
    display_name: string;
    bot_username: string;
  };
  support_url: string;
  start_param?: string;
  authenticated_at: string;
};

type ViewState =
  | { status: "loading"; message: string }
  | { status: "outside" }
  | { status: "error"; message: string }
  | { status: "ready"; data: BootstrapResponse };

function TelegramControlPage() {
  const [view, setView] = useState<ViewState>({
    status: "loading",
    message: "Connecting to Telegram…",
  });

  useEffect(() => {
    let cancelled = false;
    let started = false;

    const bootstrap = async () => {
      if (started || cancelled) return;
      const webApp = window.Telegram?.WebApp;
      if (!webApp) {
        if (!cancelled) {
          setView({ status: "error", message: "Telegram Mini App could not initialize. Reopen this page from the ChatB2K bot." });
        }
        return;
      }
      started = true;
      webApp.ready();
      webApp.expand();

      if (!webApp.initData) {
        setView({ status: "outside" });
        return;
      }

      setView({ status: "loading", message: "Verifying your Telegram identity…" });
      const { data, error } = await supabase.functions.invoke<BootstrapResponse>(
        "telegram-miniapp",
        { body: { action: "bootstrap", initData: webApp.initData } },
      );

      if (cancelled) return;
      if (error || !data?.ok || !data.authenticated) {
        setView({
          status: "error",
          message: data && "error" in data && typeof data.error === "string"
            ? data.error
            : error?.message || "Telegram identity verification failed. Reopen the Mini App from your connected bot.",
        });
        return;
      }
      setView({ status: "ready", data });
    };

    const existing = window.Telegram?.WebApp;
    if (existing) {
      void bootstrap();
      return () => { cancelled = true; };
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => void bootstrap();
    script.onerror = () => {
      if (!cancelled) setView({ status: "error", message: "Telegram's Mini App SDK did not load. Check your connection and reopen from the bot." });
    };
    document.head.appendChild(script);

    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen bg-[#090909] text-[#f4f0e8] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-[#b99b61]/25 pb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-[#c5a66a]">ResoFit · Governed distribution</p>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl">ChatB2K Control</h1>
          </div>
          <div className="rounded-full border border-[#b99b61]/40 px-3 py-1 text-[10px] uppercase tracking-widest text-[#d7bd88]">Mini App</div>
        </header>

        <section className="mt-8 rounded-xl border border-[#b99b61]/25 bg-white/[0.035] p-6 sm:p-8 shadow-2xl">
          {view.status === "loading" && (
            <div className="py-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#b99b61]/25 border-t-[#d7bd88]" />
              <p className="mt-5 text-sm text-[#c9c2b5]">{view.message}</p>
            </div>
          )}

          {view.status === "outside" && (
            <div className="py-8 text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-[#c5a66a]">Telegram session required</p>
              <h2 className="mt-3 font-display text-2xl">Open from your connected bot</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#b8b1a5]">
                For security, this control panel only opens with Telegram's signed Mini App session. Return to ChatB2K in Telegram and launch the dashboard there.
              </p>
            </div>
          )}

          {view.status === "error" && (
            <div className="py-8 text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-[#d9a17f]">Verification not completed</p>
              <h2 className="mt-3 font-display text-2xl">Connection needs attention</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#c8bfb2]">{view.message}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-6 rounded-lg border border-[#b99b61]/50 px-5 py-3 text-xs uppercase tracking-widest text-[#e0c58d] hover:bg-[#b99b61]/10"
              >
                Retry verification
              </button>
            </div>
          )}

          {view.status === "ready" && (
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-[#9fc7a6]">
                <span className="h-2 w-2 rounded-full bg-[#83c995]" />
                Telegram identity verified
              </div>
              <h2 className="mt-4 font-display text-3xl">Welcome, {view.data.user.first_name}</h2>
              <p className="mt-2 text-sm text-[#b8b1a5]">
                Signed in as {view.data.user.username ? `@${view.data.user.username}` : `Telegram user ${view.data.user.id}`}
              </p>

              <div className="mt-7 rounded-lg border border-[#b99b61]/25 bg-black/30 p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5a66a]">Authenticated workspace</p>
                <p className="mt-2 text-xl font-medium">{view.data.client.display_name}</p>
                <p className="mt-1 text-sm text-[#b8b1a5]">Bot: @{view.data.client.bot_username}</p>
                <p className="mt-4 break-all text-[11px] text-[#817b70]">Workspace reference: {view.data.client.destination_id}</p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-[#a9a194]">Session status</p>
                  <p className="mt-2 text-sm text-[#a9d2ae]">Authenticated</p>
                </div>
                <div className="rounded-lg border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-[#a9a194]">Identity timestamp</p>
                  <p className="mt-2 text-sm">{new Date(view.data.authenticated_at).toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-7 rounded-lg border border-[#b99b61]/20 bg-[#b99b61]/[0.06] p-4">
                <p className="text-sm font-medium text-[#e2cb9c]">Publishing controls are protected</p>
                <p className="mt-2 text-xs leading-5 text-[#b8b1a5]">
                  This release verifies the signed Telegram session and connected workspace. Queue approval, rejection and publish actions remain unavailable until their server-side authorization and callback paths pass separate verification.
                </p>
              </div>

              <a
                href={view.data.support_url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#b99b61] to-[#e0c58d] px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#111]"
              >
                Return to connected bot
              </a>
            </div>
          )}
        </section>

        <footer className="mt-6 text-center text-[10px] tracking-wide text-[#746e64]">
          ChatB2K101 · ResoFit · Signed Telegram session required
        </footer>
      </div>
    </main>
  );
}
