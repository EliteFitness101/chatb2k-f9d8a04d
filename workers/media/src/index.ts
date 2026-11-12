interface Env {
  MEDIA_PUBLIC: R2Bucket;
}

const CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

function error(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function parseRange(value: string | null, size: number): { offset: number; length: number } | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return "invalid";
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1 };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    }

    let key: string;
    try {
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return error(400, "Invalid media path");
    }
    if (!key || key.split("/").some((part) => part === "." || part === "..") || key.includes("\\") || key.includes("\0")) {
      return error(400, "Invalid media path");
    }

    const object = await env.MEDIA_PUBLIC.get(key);
    if (!object) return error(404, "Media not found");

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Cache-Control", CACHE_CONTROL);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Accept-Ranges", "bytes");

    if (request.method === "HEAD") {
      headers.set("Content-Length", String(object.size));
      return new Response(null, { status: 200, headers });
    }

    const range = parseRange(request.headers.get("Range"), object.size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      const partial = await env.MEDIA_PUBLIC.get(key, { range });
      if (!partial) return error(404, "Media not found");
      headers.set("Content-Length", String(range.length));
      headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
      return new Response(partial.body, { status: 206, headers });
    }

    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { status: 200, headers });
  },
};
