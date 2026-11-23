import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SESSION_COOKIE = "rf_auth_session_v1";

function cookieMap(header: string) {
  const values = new Map<string, string>();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try { values.set(key, decodeURIComponent(raw)); }
    catch { values.set(key, raw); }
  }
  return values;
}

function accessTokenFromCookie(header: string): string | null {
  const cookies = cookieMap(header);
  const count = Number(cookies.get(SESSION_COOKIE + "_count") ?? "0");
  if (!Number.isInteger(count) || count < 1 || count > 64) return null;
  let serialized = "";
  for (let index = 0; index < count; index++) {
    const chunk = cookies.get(SESSION_COOKIE + "_" + index);
    if (chunk === undefined) return null;
    serialized += chunk;
  }
  try {
    const session = JSON.parse(serialized);
    return typeof session?.access_token === "string" ? session.access_token : null;
  } catch {
    return null;
  }
}

/** Authenticates No Cappn server actions using the shared ResoFit session cookie
 * or an explicit Bearer token. The caller's JWT remains the authorization source;
 * service-role access is never used to establish the caller's identity.
 */
export const requireNoCappnAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Response("No Cappn authentication is not configured.", { status: 500 });
    }
    if (!request?.headers) {
      throw new Response("Unauthorized: request headers unavailable.", { status: 401 });
    }
    const authorization = request.headers.get("authorization");
    const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const token = bearer || accessTokenFromCookie(request.headers.get("cookie") ?? "");
    if (!token) {
      throw new Response("Unauthorized: sign in to continue.", { status: 401 });
    }

    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || typeof userId !== "string" || !userId) {
      throw new Response("Unauthorized: session is invalid or expired.", { status: 401 });
    }
    return next({ context: { supabase, userId, claims: data.claims } });
  },
);
