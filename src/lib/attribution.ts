// Revenue OS attribution — RSID + UTM persistence. Browser-only.

const RSID_KEY = "rf_rsid";
const UTM_KEY = "rf_utm";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export function getRSID(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(RSID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `rsid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(RSID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function captureUTM(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const incoming: Utm = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) incoming[k] = v;
    }
    if (incoming.utm_source) {
      localStorage.setItem(UTM_KEY, JSON.stringify(incoming));
      return incoming;
    }
    const raw = localStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as Utm) : {};
  } catch {
    return {};
  }
}

export function getAttribution(): { rsid: string; utm: Utm } {
  return { rsid: getRSID(), utm: captureUTM() };
}