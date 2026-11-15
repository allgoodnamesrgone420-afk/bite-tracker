import { authServer } from "@/lib/server/mcp-origin";

export const runtime = "nodejs";

/**
 * Older MCP clients look for the authorization server's metadata on the MCP
 * server's own origin instead of following the protected-resource metadata.
 * Relay Supabase Auth's document so they find the same endpoints.
 */
export async function GET() {
  const issuer = authServer();
  if (!issuer) return new Response("Accounts aren't enabled on this deployment.", { status: 404 });
  try {
    const res = await fetch(`${issuer}/.well-known/oauth-authorization-server`, { next: { revalidate: 3600 } });
    if (!res.ok) return new Response("The sign-in server isn't accepting OAuth clients yet (enable the OAuth server in Supabase).", { status: 404 });
    return Response.json(await res.json(), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("Couldn't reach the sign-in server.", { status: 502 });
  }
}
