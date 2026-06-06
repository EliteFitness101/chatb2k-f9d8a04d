// Smart Image Priority v2 — lazy decay (browser-only, no schedulers).
// Score persists in localStorage; decay applied only on access if > 24h stale.

const KEY = "rf_image_priority_v2";
const DAY_MS = 24 * 60 * 60 * 1000;
const DECAY = 0.95;

type Entry = { score: number; lastUpdated: number };
type Store = Record<string, Entry>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

function decayed(e: Entry, now: number): Entry {
  if (now - e.lastUpdated > DAY_MS) {
    return { score: e.score * DECAY, lastUpdated: now };
  }
  return e;
}

export function getImagePriority(slug: string): number {
  const store = read();
  const now = Date.now();
  const cur = store[slug];
  if (!cur) return 0;
  const next = decayed(cur, now);
  if (next !== cur) {
    store[slug] = next;
    write(store);
  }
  return next.score;
}

export function bumpImagePriority(slug: string, delta = 1): number {
  const store = read();
  const now = Date.now();
  const cur = store[slug] ? decayed(store[slug], now) : { score: 0, lastUpdated: now };
  const next: Entry = { score: cur.score + delta, lastUpdated: now };
  store[slug] = next;
  write(store);
  return next.score;
}

export function shouldEagerLoad(slug: string, threshold = 3): boolean {
  return getImagePriority(slug) >= threshold;
}