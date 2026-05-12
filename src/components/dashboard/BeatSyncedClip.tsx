import { useEffect, useState } from "react";
import { Play } from "lucide-react";

interface Props {
  title: string;
  poster: string;
  bpm?: number | null;
  /** monotonic beat counter from useBeatSync */
  beat: number;
  /** 0..1 smoothed bass energy */
  intensity: number;
  /** when true, react to beats; otherwise stay idle */
  syncing: boolean;
  /** stagger so the gallery doesn't pulse identically */
  offset?: number;
}

/**
 * One clip tile that pulses, scales and shifts hue on every detected kick
 * when `syncing` is on. With sync off it falls back to a calm hover state.
 */
export function BeatSyncedClip({ title, poster, bpm, beat, intensity, syncing, offset = 0 }: Props) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!syncing) return;
    if ((beat + offset) % 1 !== 0) return; // every kick (offset shifts which kick triggers)
    if (offset > 0 && beat % (offset + 1) !== 0) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 180);
    return () => clearTimeout(t);
  }, [beat, syncing, offset]);

  const scale = syncing ? 1 + intensity * 0.06 + (pulse ? 0.04 : 0) : 1;
  const glow = syncing ? 0.3 + intensity * 0.7 : 0.15;

  return (
    <div
      className="relative aspect-[9/16] rounded-md overflow-hidden border border-[var(--glass-border)] bg-[var(--ink)] group cursor-pointer"
      style={{
        transform: `scale(${scale})`,
        boxShadow: `0 0 ${20 + intensity * 60}px oklch(0.78 0.13 87 / ${glow})`,
        transition: "transform 120ms ease-out, box-shadow 120ms ease-out",
      }}
    >
      <img
        src={poster}
        alt={title}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: syncing
            ? `saturate(${1 + intensity * 0.8}) brightness(${0.85 + intensity * 0.4}) hue-rotate(${pulse ? 8 : 0}deg)`
            : "saturate(0.95) brightness(0.9)",
          transition: "filter 120ms ease-out",
        }}
      />
      {/* gold overlay reacts to beat */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent 40%, oklch(0.06 0 0 / 0.85) 100%)",
          opacity: 1,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "var(--gradient-gold)",
          opacity: syncing ? intensity * 0.25 + (pulse ? 0.15 : 0) : 0,
          mixBlendMode: "overlay",
          transition: "opacity 120ms ease-out",
        }}
      />
      {/* play affordance */}
      <div className="absolute inset-0 grid place-items-center opacity-80 group-hover:opacity-100 transition-opacity">
        <div
          className="h-12 w-12 rounded-full bg-gold-gradient grid place-items-center shadow-gold"
          style={{ transform: `scale(${1 + (pulse && syncing ? 0.15 : 0)})`, transition: "transform 120ms" }}
        >
          <Play className="h-5 w-5 text-[var(--ink)] ml-0.5" />
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3">
        <div className="text-xs font-display text-foreground truncate">{title}</div>
        {bpm ? (
          <div className="text-[9px] tracking-[0.3em] uppercase text-gold mt-0.5">
            {bpm} BPM · {syncing ? "Synced" : "Idle"}
          </div>
        ) : null}
      </div>
    </div>
  );
}