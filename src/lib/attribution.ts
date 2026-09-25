// Revenue OS attribution — shared across the ResoFit ecosystem.
// RSID/UTM are non-authentication attribution identifiers. They are mirrored
// into a first-party parent-domain cookie so they survive subdomain changes.

const RSID_KEY = "rf_rsid";
const UTM_KEY = "rf_utm";
const COOKIE_KEY = "resofit_attribution_v2";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

function readSharedCookie(): { rsid?: string; utm?: Utm } {
  if (typeof document === "undefined") return {};
  try {
    const prefix = `${COOKIE_KEY}=`;
    const raw = document.cookie.split("; ").find((item) => item.startsWith(prefix))?.slice(prefix.length);
    return raw ? (JSON.parse(decodeURIComponent(raw)) as { rsid?: string; utm?: Utm }) : {};
  } catch {
    return {};
  }
}

function writeSharedCookie(value: { rsid: string; utm: Utm }) {
  if (typeof document === "undefined") return;
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    document.cookie = `${COOKIE_KEY}=${encoded}; Max-Age=${COOKIE_MAX_AGE}; Path=/; Domain=.resofit.fit; Secure; SameSite=Lax`;
  } catch {
    /* cookie unavailable */
  }
}

export function getRSID(): string {
  if (typeof window === "undefined") return "";
  try {
    const shared = readSharedCookie();
    if (shared.rsid) {
      localStorage.setItem(RSID_KEY, shared.rsid);
      return shared.rsid;
    }
    let id = localStorage.getItem(RSID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `rsid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(RSID_KEY, id);
    }
    const utm = captureUTM();
    writeSharedCookie({ rsid: id, utm });
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
      if (v) incoming[k] = v.slice(0, 120);
    }
    const shared = readSharedCookie();
    const raw = localStorage.getItem(UTM_KEY);
    const stored = raw ? (JSON.parse(raw) as Utm) : {};
    const utm = Object.keys(incoming).length ? incoming : shared.utm ?? stored;
    localStorage.setItem(UTM_KEY, JSON.stringify(utm));
    const rsid = localStorage.getItem(RSID_KEY) ?? shared.rsid ?? "";
    if (rsid) writeSharedCookie({ rsid, utm });
    return utm;
  } catch {
    return {};
  }
}

export function getAttribution(): { rsid: string; utm: Utm } {
  const shared = readSharedCookie();
  return { rsid: getRSID() || shared.rsid || "", utm: captureUTM() };
}
