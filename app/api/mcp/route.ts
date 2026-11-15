import { createClient } from "@supabase/supabase-js";
import { authorize, readJsonBody } from "@/lib/server/guard";
import { MCP_PATH, RESOURCE_METADATA_PATH, publicOrigin } from "@/lib/server/mcp-origin";
import { rpcError, serveMcp, timeZoneFor } from "@/mcp/http";
import { SupabaseStore } from "@/mcp/store";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64_000; // a log_food call with 25 items is a few KB

/**
 * Bite's MCP server for assistants that connect to a URL (ChatGPT, Claude,
 * Gemini CLI, Cursor…). Callers sign in through Supabase's OAuth server and
 * send the access token as a Bearer header; every query then runs as that
 * person under row-level security, exactly like the app.
 */
export async function POST(req: Request) {
  const who = await authorize(req, "mcp");
  if (!who.ok) {
    if (who.reason === "unauthorized") {
      // Points the client at the metadata that says where to sign in (RFC 9728).
      return rpcError(401, "Sign in to Bite to use this server.", { "WWW-Authenticate": `Bearer resource_metadata="${publicOrigin(req)}${RESOURCE_METADATA_PATH}"` });
    }
    return rpcError(429, who.reason === "day" ? "Today's limit for this server is used up. It resets at midnight UTC." : "Too many requests. Give it a few seconds.", { "Retry-After": who.reason === "day" ? "3600" : "5" });
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return rpcError(body.code === "too_large" ? 413 : 400, body.code === "too_large" ? "That request is too large." : "Couldn't read that request.");

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!, {
    global: { headers: { Authorization: `Bearer ${who.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = new SupabaseStore(sb, who.userId);
  try {
    return await serveMcp(req, store, { timeZone: await timeZoneFor(store), parsedBody: body.body });
  } catch {
    return rpcError(503, "Bite's database couldn't be reached. Try again in a moment.");
  }
}

// Stateless server: there's no event stream to open and no session to end.
const notAllowed = () => rpcError(405, `Use POST ${MCP_PATH}.`, { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
