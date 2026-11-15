/**
 * Supabase client for the MCP server: the same project and the same public
 * anon key as the web app, signed in as you. Row-level security means the
 * server can only ever see and change your own rows.
 *
 * The session (refresh token, never your password) lives in
 * ~/.config/bite-mcp/session.json, readable only by you. `npm run mcp:login`
 * creates it; supabase-js keeps it fresh through the storage adapter below.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SESSION_FILE = process.env.BITE_MCP_SESSION ?? join(homedir(), ".config", "bite-mcp", "session.json");

/** The app folder: two levels up from the script being run (mcp/server.ts → repo root). */
const appDir = () => process.env.BITE_APP_DIR ?? resolve(dirname(process.argv[1] ?? "."), "..");

const PUBLIC_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;

/**
 * Reads only the public Supabase settings from the app's .env.local. The file
 * also holds server secrets (database URL, AI key); those are never loaded here.
 */
export function readPublicEnv(file = join(appDir(), ".env.local")): Partial<Record<(typeof PUBLIC_KEYS)[number], string>> {
  const out: Partial<Record<(typeof PUBLIC_KEYS)[number], string>> = {};
  for (const k of PUBLIC_KEYS) if (process.env[k]) out[k] = process.env[k];
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = PUBLIC_KEYS.find((k) => k === m[1]);
    if (key && !out[key]) out[key] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** supabase-js storage adapter backed by one private JSON file. */
export function fileStorage(file = SESSION_FILE) {
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const write = (data: Record<string, string>) => {
    if (!Object.keys(data).length) return rmSync(file, { force: true });
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    chmodSync(file, 0o600); // the mode above only applies when the file is created
  };
  return {
    getItem: (key: string) => read()[key] ?? null,
    setItem: (key: string, value: string) => write({ ...read(), [key]: value }),
    removeItem: (key: string) => {
      const data = read();
      delete data[key];
      write(data);
    },
  };
}

export class SetupError extends Error {}

export function createSupabase(): SupabaseClient {
  const env = readPublicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new SetupError(
      "Bite's accounts aren't configured here. The MCP server reads your synced data, so it needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the app's .env.local (run: npx vercel env pull .env.local).",
    );
  }
  return createClient(url, key, { auth: { storage: fileStorage(), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}

/** The signed-in user's id, or a SetupError that says how to sign in. */
export async function requireUser(sb: SupabaseClient): Promise<{ id: string; email: string }> {
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new SetupError("Not signed in to Bite. In the app folder, run: npm run mcp:login");
  return { id: user.id, email: user.email ?? "" };
}
