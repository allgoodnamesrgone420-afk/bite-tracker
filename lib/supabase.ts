"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Public Supabase config. The anon/publishable key is designed to be public:
 * row-level security in supabase/schema.sql is what protects the data. The
 * service-role key is never used by this app.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False in local-only mode (no Supabase connected): the app then works on-device only. */
export const syncConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!syncConfigured || typeof window === "undefined") return null;
  client ??= createClient(URL!, KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "bite-auth" },
  });
  return client;
}

/** Bearer token for our own API routes (AI endpoints require a signed-in, invited user). */
export async function accessToken(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
