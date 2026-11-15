import { MCP_PATH, authServer, publicOrigin } from "@/lib/server/mcp-origin";

export const runtime = "nodejs";

/**
 * OAuth protected-resource metadata (RFC 9728) for the hosted MCP endpoint:
 * tells an assistant that /api/mcp needs a token and which authorization
 * server (Supabase Auth) issues it. Served at the bare well-known path and
 * with the resource path appended, since clients try both.
 */
export async function GET(req: Request) {
  const issuer = authServer();
  if (!issuer) return new Response("Accounts aren't enabled on this deployment.", { status: 404 });
  return Response.json(
    {
      resource: `${publicOrigin(req)}${MCP_PATH}`,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource_name: "Bite",
    },
    // Public, non-secret, and read by browser-based MCP clients too.
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
