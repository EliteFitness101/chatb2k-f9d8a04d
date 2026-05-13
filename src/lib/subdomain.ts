/**
 * Sub-Empire detection. Reads window.location.host and resolves to a sub-empire
 * key. DNS / wildcard hosting must be configured separately at the domain level.
 */
export type SubEmpire = "main" | "academy" | "shop" | "vault" | "hub";

const MAP: Record<string, SubEmpire> = {
  academy: "academy",
  shop: "shop",
  vault: "vault",
  hub: "hub",
};

export function getSubEmpire(): SubEmpire {
  if (typeof window === "undefined") return "main";
  const host = window.location.hostname;
  const sub = host.split(".")[0]?.toLowerCase();
  return (sub && MAP[sub]) || "main";
}

export const SUB_EMPIRE_THEME: Record<SubEmpire, { label: string; accent: string }> = {
  main: { label: "ResoFlex", accent: "var(--gold)" },
  academy: { label: "ResoFlex Academy", accent: "#9b6cff" },
  shop: { label: "ResoFlex Shop", accent: "#ffb347" },
  vault: { label: "ResoFlex Vault", accent: "#d4af37" },
  hub: { label: "ResoFlex Hub", accent: "#5cd1c7" },
};