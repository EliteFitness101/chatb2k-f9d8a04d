import { describe, expect, it, afterEach } from "vitest";
import { getMediaDelivery } from "@/lib/media-delivery";

describe("XBang media delivery contract", () => {
  const old = process.env.CLOUDFLARE_MEDIA_BASE_URL;
  afterEach(() => {
    if (old === undefined) delete process.env.CLOUDFLARE_MEDIA_BASE_URL;
    else process.env.CLOUDFLARE_MEDIA_BASE_URL = old;
  });

  it("keeps the backup master when Cloudflare is not configured", () => {
    delete process.env.CLOUDFLARE_MEDIA_BASE_URL;
    const r = getMediaDelivery("https://origin.example/master.mp4");
    expect(r.mode).toBe("master");
    expect(r.deliveryUrl).toBe(r.masterUrl);
  });

  it("generates a Cloudflare delivery URL while retaining the master", () => {
    process.env.CLOUDFLARE_MEDIA_BASE_URL = "https://media.example";
    const r = getMediaDelivery("https://origin.example/master.mp4");
    expect(r.mode).toBe("cloudflare");
    expect(r.masterUrl).toContain("origin.example");
    expect(r.deliveryUrl).toContain("media.example/cdn-cgi/media/");
  });
});
