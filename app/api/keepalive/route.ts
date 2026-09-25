import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Daily Vercel Cron ping (vercel.json) so the free Supabase project never
 * counts as inactive and gets paused. It runs one tiny read through the
 * public REST API: row-level security returns nothing, but the database
 * still does the work. No data, keys or user info in the response.
 * If CRON_SECRET is set in Vercel, only Vercel's cron can call it.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const MIN_INTERVAL_MS = 10 * 60_000;
let lastPing = 0;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ ok: false }, { status: 401 });
  if (!URL || !KEY) return Response.json({ ok: true, skipped: "local-only mode" });
  // Anyone can hit this URL, so don't let it be used to hammer the database.
  if (Date.now() - lastPing < MIN_INTERVAL_MS) return Response.json({ ok: true, skipped: "recent" });
  lastPing = Date.now();
  try {
    const res = await fetch(`${URL}/rest/v1/allowed_emails?select=email&limit=1`, {
      headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) console.error(`[keepalive] Supabase answered ${res.status}`);
    return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    console.error("[keepalive] Supabase unreachable");
    return Response.json({ ok: false }, { status: 502 });
  }
}
