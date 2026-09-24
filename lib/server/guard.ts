import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@/lib/schemas";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  too_large: 413,
  unauthorized: 401,
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  invalid_output: 502,
  refused: 422,
  config: 500,
  offline: 503,
};

export function errorResponse(code: ApiErrorCode, message: string) {
  return Response.json({ ok: false, error: { code, message } }, { status: STATUS[code] });
}

export function okResponse<T>(data: T) {
  return Response.json({ ok: true, data });
}

/* -------------------------- passcode ------------------------------ */

const sha = (s: string) => createHash("sha256").update(s).digest();

export function checkPasscode(req: Request): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return true;
  const given = req.headers.get("x-app-passcode") ?? "";
  // Hash both sides so lengths match and the compare is constant-time.
  return timingSafeEqual(sha(given), sha(expected));
}

/* ------------------------ rate limiting ---------------------------- */
// In-memory token bucket per IP + route. Resets on cold start; fine for a personal app.

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export function rateLimit(key: string, perMinute: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, updated: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.updated) / 60_000) * perMinute);
  b.updated = now;
  if (buckets.size > 5_000) buckets.clear(); // crude memory guard
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/* ------------------------- body reading ---------------------------- */

export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; body: unknown } | { ok: false; code: "too_large" | "bad_request" }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, code: "too_large" };
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > maxBytes) return { ok: false, code: "too_large" };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, code: "bad_request" };
  }
}

/* --------------------------- account auth ---------------------------- */
// With Supabase connected, AI routes require a signed-in user whose email is
// still on the invite list. Without it (local-only mode) the optional passcode applies.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const accountsEnabled = Boolean(SB_URL && SB_KEY);

const verified = new Map<string, { userId: string; until: number }>();
const TOKEN_CACHE_MS = 60_000;

async function verifyUser(req: Request): Promise<{ userId: string } | { error: Response }> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { error: errorResponse("unauthorized", "Sign in to use AI features.") };
  const key = createHash("sha256").update(token).digest("hex");
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return { userId: hit.userId };

  const sb = createClient(SB_URL!, SB_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user?.email) return { error: errorResponse("unauthorized", "Your session expired. Sign in again.") };
  // RLS lets a user read only their own invite row.
  const invite = await sb.from("allowed_emails").select("email").eq("email", data.user.email.toLowerCase()).maybeSingle();
  if (!invite.data) return { error: errorResponse("unauthorized", "This account's invite was removed. Ask the owner.") };

  if (verified.size > 1_000) verified.clear();
  verified.set(key, { userId: data.user.id, until: Date.now() + TOKEN_CACHE_MS });
  return { userId: data.user.id };
}

/** Common preamble for every LLM route. Returns an error Response, or null to continue. */
export async function guard(req: Request, route: string, perMinute: number): Promise<Response | null> {
  let who = clientIp(req);
  if (accountsEnabled) {
    const v = await verifyUser(req);
    if ("error" in v) return v.error;
    who = v.userId;
  } else if (!checkPasscode(req)) {
    return errorResponse("unauthorized", "Passcode required.");
  }
  if (!rateLimit(`${route}:${who}`, perMinute)) {
    return errorResponse("rate_limited", "Too many requests. Give it a few seconds.");
  }
  return null;
}
