import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
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

/** Common preamble for every LLM route. Returns an error Response, or null to continue. */
export function guard(req: Request, route: string, perMinute: number): Response | null {
  if (!checkPasscode(req)) return errorResponse("unauthorized", "Passcode required.");
  if (!rateLimit(`${route}:${clientIp(req)}`, perMinute)) {
    return errorResponse("rate_limited", "Too many requests. Give it a few seconds.");
  }
  return null;
}
