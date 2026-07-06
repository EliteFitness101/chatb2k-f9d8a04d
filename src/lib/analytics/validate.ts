/**
 * Read-only analytics diagnostics.
 *
 * Zero side effects: never writes to storage, never fires events, never mutates
 * inputs. Intended for admin dashboards, one-off debugging, and QA validation
 * against the existing funnel_events pipeline.
 *
 * Contract stays compatible with the existing `track()` payload shape:
 *   { event, rsid, utm, session_id?, product_sku?, ...props, t/timestamp }
 */

export interface AnalyticsEvent {
  event: string;
  rsid?: string | null;
  utm?: Record<string, unknown> | null;
  session_id?: string | null;
  product_sku?: string | null;
  timestamp?: string | number | null;
  t?: number | null;
  props?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface FunnelRow {
  id?: string;
  event_name: string;
  rsid?: string | null;
  props?: Record<string, unknown> | null;
  occurred_at?: string | null;
}

export interface ValidationReport {
  totals: {
    client: number;
    server: number;
    byEvent: Record<string, { client: number; server: number }>;
  };
  missingOnServer: string[]; // events fired on client but never landed in funnel_events
  duplicateClient: string[]; // (event|rsid|session_id|surface) fingerprints firing >1x
  duplicateServer: string[];
  attribution: {
    clientMissingRsid: number;
    clientMissingSession: number;
    clientMissingUtm: number;
    serverMissingRsid: number;
  };
  timestampAnomalies: number; // client timestamps outside a plausible window
  expectedCoverage: Array<{ event: string; client: number; server: number; ok: boolean }>;
}

const EXPECTED_EVENTS = [
  "landing_view",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_90",
  "scroll_depth_100",
  "assessment_started",
  "add_to_cart",
  "checkout_started",
  "purchase_success",
  "whatsapp_click",
  "telegram_join_click",
];

function fingerprint(e: AnalyticsEvent | FunnelRow, isServer = false): string {
  const name = isServer ? (e as FunnelRow).event_name : (e as AnalyticsEvent).event;
  const props = (isServer ? (e as FunnelRow).props : (e as AnalyticsEvent).props ?? e) ?? {};
  const rsid = (e as AnalyticsEvent).rsid ?? (props as Record<string, unknown>).rsid ?? "";
  const sid = (e as AnalyticsEvent).session_id ?? (props as Record<string, unknown>).session_id ?? "";
  const surface = (props as Record<string, unknown>).surface ?? "";
  const sku = (e as AnalyticsEvent).product_sku ?? (props as Record<string, unknown>).product_sku ?? "";
  return [name, rsid, sid, surface, sku].join("|");
}

/**
 * Diagnose client vs server-side event streams.
 * Both inputs are read-only; the report is a plain JSON-serializable object.
 */
export function validateAnalytics(
  clientEvents: readonly AnalyticsEvent[],
  serverEvents: readonly FunnelRow[],
): ValidationReport {
  const byEvent: Record<string, { client: number; server: number }> = {};
  const seenClient = new Map<string, number>();
  const seenServer = new Map<string, number>();
  const attribution = {
    clientMissingRsid: 0,
    clientMissingSession: 0,
    clientMissingUtm: 0,
    serverMissingRsid: 0,
  };
  let timestampAnomalies = 0;
  const now = Date.now();
  const YEAR = 365 * 24 * 60 * 60 * 1000;

  for (const e of clientEvents) {
    const key = e.event;
    byEvent[key] = byEvent[key] ?? { client: 0, server: 0 };
    byEvent[key].client += 1;
    const fp = fingerprint(e);
    seenClient.set(fp, (seenClient.get(fp) ?? 0) + 1);
    if (!e.rsid && !(e.props?.rsid)) attribution.clientMissingRsid += 1;
    if (!e.session_id && !(e.props?.session_id)) attribution.clientMissingSession += 1;
    const utm = e.utm ?? (e.props?.utm as Record<string, unknown> | undefined);
    if (!utm || Object.keys(utm).length === 0) attribution.clientMissingUtm += 1;
    const ts = typeof e.timestamp === "string"
      ? Date.parse(e.timestamp)
      : typeof e.timestamp === "number"
        ? e.timestamp
        : typeof e.t === "number" ? e.t : NaN;
    if (Number.isFinite(ts) && Math.abs(now - ts) > YEAR) timestampAnomalies += 1;
  }

  for (const r of serverEvents) {
    const key = r.event_name;
    byEvent[key] = byEvent[key] ?? { client: 0, server: 0 };
    byEvent[key].server += 1;
    const fp = fingerprint(r, true);
    seenServer.set(fp, (seenServer.get(fp) ?? 0) + 1);
    if (!r.rsid) attribution.serverMissingRsid += 1;
  }

  const missingOnServer = Object.entries(byEvent)
    .filter(([, v]) => v.client > 0 && v.server === 0)
    .map(([k]) => k);

  const duplicateClient = [...seenClient.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);
  const duplicateServer = [...seenServer.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  const expectedCoverage = EXPECTED_EVENTS.map((event) => {
    const v = byEvent[event] ?? { client: 0, server: 0 };
    return { event, client: v.client, server: v.server, ok: v.client > 0 || v.server > 0 };
  });

  return {
    totals: {
      client: clientEvents.length,
      server: serverEvents.length,
      byEvent,
    },
    missingOnServer,
    duplicateClient,
    duplicateServer,
    attribution,
    timestampAnomalies,
    expectedCoverage,
  };
}

/**
 * Funnel consistency: compare checkouts to purchases without live gateway calls.
 * Both inputs are plain rows already fetched by the caller.
 */
export interface FunnelConsistencyReport {
  checkoutsStarted: number;
  purchases: number;
  orphanCheckouts: number; // checkout_started without matching revenue row
  orphanPurchases: number; // revenue rows with no matching checkout_started
  duplicatePurchases: string[]; // duplicate references
  rsidMismatch: number; // purchase rsid differs from most recent checkout rsid
}

export function validateFunnelConsistency(
  checkoutStarted: readonly FunnelRow[],
  revenueRows: readonly {
    reference: string;
    rsid?: string | null;
    product_sku?: string | null;
    status?: string | null;
  }[],
): FunnelConsistencyReport {
  const paid = revenueRows.filter((r) => (r.status ?? "success") === "success");
  const refSeen = new Map<string, number>();
  for (const r of paid) refSeen.set(r.reference, (refSeen.get(r.reference) ?? 0) + 1);
  const duplicatePurchases = [...refSeen.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  const checkoutIndex = new Map<string, FunnelRow[]>();
  for (const c of checkoutStarted) {
    const sku = (c.props as Record<string, unknown> | null)?.product_sku as string | undefined;
    const key = `${c.rsid ?? ""}|${sku ?? ""}`;
    const arr = checkoutIndex.get(key) ?? [];
    arr.push(c);
    checkoutIndex.set(key, arr);
  }

  let orphanPurchases = 0;
  let rsidMismatch = 0;
  const matchedCheckoutKeys = new Set<string>();
  for (const r of paid) {
    const key = `${r.rsid ?? ""}|${r.product_sku ?? ""}`;
    const matches = checkoutIndex.get(key);
    if (!matches || matches.length === 0) {
      orphanPurchases += 1;
    } else {
      matchedCheckoutKeys.add(key);
      if (r.rsid && matches[0].rsid && r.rsid !== matches[0].rsid) rsidMismatch += 1;
    }
  }

  let orphanCheckouts = 0;
  for (const [key, rows] of checkoutIndex.entries()) {
    if (!matchedCheckoutKeys.has(key)) orphanCheckouts += rows.length;
  }

  return {
    checkoutsStarted: checkoutStarted.length,
    purchases: paid.length,
    orphanCheckouts,
    orphanPurchases,
    duplicatePurchases,
    rsidMismatch,
  };
}