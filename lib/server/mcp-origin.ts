import "server-only";

/** The public origin this request came in on (Vercel sets the forwarded headers). */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Path of the hosted MCP endpoint, and of the metadata that describes how to sign in to it. */
export const MCP_PATH = "/api/mcp";
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** Supabase Auth, which is the OAuth authorization server for the MCP endpoint. */
export function authServer(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? `${url.replace(/\/+$/, "")}/auth/v1` : null;
}
