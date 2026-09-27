export type ClientRuntimeConfig = {
  clientKey: string;
  displayName: string;
  destinationUrl: string;
  defaultChannels: string[];
};

export function getClientRuntime(): ClientRuntimeConfig {
  const clientKey = process.env.CLIENT_KEY ?? "xbang";
  return {
    clientKey,
    displayName: process.env.CLIENT_DISPLAY_NAME ?? (clientKey === "xbang" ? "XBang" : clientKey),
    destinationUrl: process.env.CLIENT_DESTINATION_URL ?? "https://xbang.lovable.app",
    defaultChannels: (process.env.CLIENT_DEFAULT_CHANNELS ?? "tiktok,youtube")
      .split(",").map(v => v.trim()).filter(Boolean),
  };
}

export function clientTable(name: "highlights" | "sources" | "clips") {
  const clientKey = getClientRuntime().clientKey.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  return process.env[clientKey.toUpperCase() + "_" + name.toUpperCase() + "_TABLE"] ?? (clientKey + "_" + name);
}
