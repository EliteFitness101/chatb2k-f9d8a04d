import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Web-Audio beat detector.
 *
 * Plays a track and emits:
 *  - `beat` (incrementing counter on every detected kick)
 *  - `intensity` (0..1, smoothed bass-band energy)
 *  - `bpm` (running estimate)
 *
 * Visuals subscribe via the returned values and react in sync.
 */
export function useBeatSync(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const lastBeatAtRef = useRef(0);
  const beatIntervalsRef = useRef<number[]>([]);
  const energyHistoryRef = useRef<number[]>([]);

  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const [intensity, setIntensity] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);

  const ensureGraph = useCallback(() => {
    if (!audioRef.current) return;
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    const ctx = ctxRef.current!;
    if (!sourceRef.current) {
      sourceRef.current = ctx.createMediaElementSource(audioRef.current);
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 1024;
      analyserRef.current.smoothingTimeConstant = 0.6;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
    }
  }, []);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);

    // Bass band energy (≈ first 8% of bins maps to ~0–250Hz)
    const bassEnd = Math.floor(buf.length * 0.08);
    let sum = 0;
    for (let i = 0; i < bassEnd; i++) sum += buf[i];
    const bassEnergy = sum / bassEnd / 255; // 0..1

    // Rolling history → adaptive threshold
    const hist = energyHistoryRef.current;
    hist.push(bassEnergy);
    if (hist.length > 60) hist.shift();
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    const threshold = Math.max(0.18, avg * 1.45);

    setIntensity((prev) => prev * 0.7 + bassEnergy * 0.3);

    const now = performance.now();
    if (bassEnergy > threshold && now - lastBeatAtRef.current > 220) {
      const dt = now - lastBeatAtRef.current;
      lastBeatAtRef.current = now;
      setBeat((b) => b + 1);
      if (dt > 0 && dt < 1500) {
        const ints = beatIntervalsRef.current;
        ints.push(dt);
        if (ints.length > 16) ints.shift();
        const meanDt = ints.reduce((a, b) => a + b, 0) / ints.length;
        setBpm(Math.round(60000 / meanDt));
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    if (!audioRef.current || !src) return;
    ensureGraph();
    if (ctxRef.current?.state === "suspended") await ctxRef.current.resume();
    try {
      await audioRef.current.play();
      setPlaying(true);
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    } catch {
      setPlaying(false);
    }
  }, [ensureGraph, src, tick]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // Reset graph when source changes
  useEffect(() => {
    stop();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    energyHistoryRef.current = [];
    beatIntervalsRef.current = [];
    setBeat(0);
    setBpm(null);
    setIntensity(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return { audioRef, playing, beat, intensity, bpm, start, stop };
}