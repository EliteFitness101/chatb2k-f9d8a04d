import { hmacMatches, type NormalizedEvent, type ProviderAdapter } from "./framework.server";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

function mapType(raw: string): NormalizedEvent["type"] {
  if (/success|successful|completed|paid|confirmed/i.test(raw)) return "paid";
  if (/refund|reversal|dispute/i.test(raw)) return "refunded";
  if (/fail|declin|cancel/i.test(raw)) return "failed";
  return "ignored";
}

/** Paystack — LIVE. HMAC-SHA512 over the raw body in `x-paystack-signature`. */
export const paystackAdapter: ProviderAdapter = {
  code: "paystack",
  verify: (raw, headers) =>
    hmacMatches(raw, headers.get("x-paystack-signature"), process.env["PAYSTACK_SECRET_KEY"] ?? "", "sha512"),
  normalize: (payload) => {
    const p = obj(payload);
    const data = obj(p["data"]);
    const meta = obj(data["metadata"]);
    const event = str(p["event"]) ?? "";
    const reference = str(data["reference"]);
    return {
      eventKey: `${event}:${reference ?? str(data["id"]) ?? crypto.randomUUID()}`,
      type: /charge\.success/i.test(event) ? "paid" : mapType(event),
      reference,
      amountMinor: num(data["amount"]),
      currency: str(data["currency"]) ?? "NGN",
      email: str(obj(data["customer"])["email"]),
      metadata: meta,
    };
  },
};

/** Flutterwave — stubbed adapter, wired but disabled until keys land. */
export const flutterwaveAdapter: ProviderAdapter = {
  code: "flutterwave",
  verify: (_raw, headers) => {
    const secret = process.env["FLUTTERWAVE_SECRET_HASH"];
    return Boolean(secret) && headers.get("verif-hash") === secret;
  },
  normalize: (payload) => {
    const p = obj(payload);
    const data = obj(p["data"]);
    return {
      eventKey: `${str(p["event"]) ?? "flw"}:${str(data["tx_ref"]) ?? String(num(data["id"]))}`,
      type: mapType(`${str(p["event"]) ?? ""} ${str(data["status"]) ?? ""}`),
      reference: str(data["tx_ref"]),
      amountMinor: Math.round(num(data["amount"]) * 100),
      currency: str(data["currency"]) ?? "NGN",
      email: str(obj(data["customer"])["email"]),
      metadata: obj(data["meta"]),
    };
  },
};

/** PalmPay — stubbed adapter. HMAC-SHA256 over the raw body. */
export const palmpayAdapter: ProviderAdapter = {
  code: "palmpay",
  verify: (raw, headers) => {
    const secret = process.env["PALMPAY_WEBHOOK_SECRET"];
    return Boolean(secret) && hmacMatches(raw, headers.get("x-palmpay-signature"), secret!, "sha256");
  },
  normalize: (payload) => {
    const p = obj(payload);
    const data = obj(p["data"]);
    return {
      eventKey: `palmpay:${str(data["orderNo"]) ?? str(p["orderNo"]) ?? crypto.randomUUID()}`,
      type: mapType(str(data["orderStatus"]) ?? str(p["status"]) ?? ""),
      reference: str(data["reference"]) ?? str(p["reference"]),
      amountMinor: num(data["amount"]),
      currency: str(data["currency"]) ?? "NGN",
      email: str(data["email"]),
      metadata: obj(data["metadata"]),
    };
  },
};

/** Crypto settlement — concierge-confirmed, HMAC-SHA256 shared secret. */
export const cryptoAdapter: ProviderAdapter = {
  code: "crypto",
  verify: (raw, headers) => {
    const secret = process.env["CRYPTO_WEBHOOK_SECRET"];
    return Boolean(secret) && hmacMatches(raw, headers.get("x-crypto-signature"), secret!, "sha256");
  },
  normalize: (payload) => {
    const p = obj(payload);
    return {
      eventKey: `crypto:${str(p["tx_hash"]) ?? str(p["reference"]) ?? crypto.randomUUID()}`,
      type: mapType(str(p["status"]) ?? ""),
      reference: str(p["reference"]),
      amountMinor: num(p["amount_minor"]),
      currency: str(p["currency"]) ?? "USD",
      email: str(p["email"]),
      metadata: { ...obj(p["metadata"]), tx_hash: str(p["tx_hash"]) },
    };
  },
};