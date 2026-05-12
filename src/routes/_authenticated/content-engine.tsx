import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Music, Pause, Play, Radio } from "lucide-react";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { BeatSyncedClip } from "@/components/dashboard/BeatSyncedClip";
import { useBeatSync } from "@/hooks/use-beat-sync";
import { AFRO_LIBRARY } from "@/lib/afro-fusion-library";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/site-meta";

export const Route = createFileRoute("/_authenticated/content-engine")({
  head: () => ({
    meta: pageMeta({ title: "Content Engine", description: "Beat-synced gym pull-up clips. Afro-fusion drives the visuals." }),
  }),
  component: ContentEnginePage,
});

interface ContentRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  asset_url: string | null;
  bpm: number | null;
  type: string;
}

// Fallback gallery (used when no published rows exist yet)
const FALLBACK: ContentRow[] = Array.from({ length: 8 }).map((_, i) => ({
  id: `seed-${i}`,
  title: ["Iron Pull · Set 01", "Eko Hang", "Ladder Drill", "Wide-grip Detonate", "Tempo Pull", "Kip + Hold", "Negative Drop", "Centurion Set"][i] ?? `Clip ${i + 1}`,
  thumbnail_url: `https://images.unsplash.com/photo-${["1599058917212-d750089bc07e","1517836357463-d25dfeac3438","1534438327276-14e5300c3a48","1571019613454-1cb2f99b2d8b","1584863431664-bbc1bc2a8d8d","1581009146145-b5ef050c2e1e","1583454110551-21f2fa2afe61","1518611012118-696072aa579a"][i]}?auto=format&fit=crop&w=600&q=70`,
  asset_url: null,
  bpm: null,
  type: "video",
}));

function ContentEnginePage() {
  const [clips, setClips] = useState<ContentRow[]>(FALLBACK);
  const [trackId, setTrackId] = useState(AFRO_LIBRARY[0].id);
  const [syncing, setSyncing] = useState(true);
  const track = AFRO_LIBRARY.find((t) => t.id === trackId)!;

  const { audioRef, playing, beat, intensity, bpm, start, stop } = useBeatSync(track.src);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("generated_content")
        .select("id,title,thumbnail_url,asset_url,bpm,type,status")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(12);
      if (!cancelled && data && data.length > 0) {
        setClips(
          data.map((d) => ({
            id: d.id,
            title: d.title,
            thumbnail_url: d.thumbnail_url,
            asset_url: d.asset_url,
            bpm: d.bpm,
            type: d.type,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex bg-background ember-bg">
      <AppSidebar />
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-6xl px-4 sm:px-8 py-10 lg:py-14 space-y-8">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] tracking-[0.4em] uppercase text-gold">Content Engine</div>
              <h1 className="font-display text-3xl sm:text-4xl mt-1">Gym pull-up clips · beat-driven.</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                Toggle <span className="text-gold">Sync Music</span> to map every visual pulse to the kick of an Afro-fusion track.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">Live BPM</div>
              <div className="font-display text-3xl text-gold-gradient">{bpm ?? "—"}</div>
            </div>
          </header>

          {/* Music control bar */}
          <div className="glass rounded-md p-4 sm:p-5 flex flex-wrap items-center gap-4">
            <button
              onClick={() => (playing ? stop() : start())}
              className="h-12 w-12 rounded-full bg-gold-gradient grid place-items-center shadow-gold shrink-0"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-5 w-5 text-[var(--ink)]" /> : <Play className="h-5 w-5 text-[var(--ink)] ml-0.5" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                <Music className="h-3 w-3 text-gold" /> Afro-fusion · Coach Buchi library
              </div>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="mt-1 w-full bg-transparent font-display text-lg text-foreground outline-none"
              >
                {AFRO_LIBRARY.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[var(--ink)]">
                    {t.title} — {t.artist} · {t.bpm} BPM
                  </option>
                ))}
              </select>
            </div>

            {/* Intensity meter */}
            <div className="hidden sm:flex items-center gap-2 w-40">
              <Radio className="h-3 w-3 text-gold" />
              <div className="h-1.5 flex-1 rounded-full bg-[var(--ink)] overflow-hidden">
                <div
                  className="h-full bg-gold-gradient transition-[width] duration-75"
                  style={{ width: `${Math.min(100, intensity * 140)}%` }}
                />
              </div>
            </div>

            {/* Sync toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={syncing}
              onClick={() => setSyncing((s) => !s)}
              className={`relative h-9 w-44 rounded-full border transition-all ${
                syncing
                  ? "border-gold bg-gold-gradient text-[var(--ink)] shadow-gold"
                  : "border-[var(--glass-border)] text-muted-foreground"
              }`}
            >
              <span className="text-[10px] tracking-[0.3em] uppercase font-semibold">
                {syncing ? "Sync Music · ON" : "Sync Music · OFF"}
              </span>
            </button>

            <audio ref={audioRef} src={track.src} crossOrigin="anonymous" preload="metadata" />
          </div>

          {/* Gallery */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {clips.map((c, i) => (
              <BeatSyncedClip
                key={c.id}
                title={c.title}
                poster={c.thumbnail_url ?? FALLBACK[i % FALLBACK.length].thumbnail_url!}
                bpm={c.bpm ?? track.bpm}
                beat={beat}
                intensity={intensity}
                syncing={syncing && playing}
                offset={i % 3}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}