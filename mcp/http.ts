/**
 * The MCP server over HTTP (Streamable HTTP, stateless): one JSON-RPC request
 * in, one JSON response out, a fresh server per request. That suits
 * serverless hosting and lets any assistant that speaks remote MCP connect to
 * a URL. The caller has already established who is asking; this only needs
 * their data store.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { validTimeZone } from "../lib/totals";
import type { BiteStore } from "./store";
import { INSTRUCTIONS, registerTools, type ToolOptions } from "./tools";

/** Where a person's day starts when their profile doesn't say: the app's home market. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** The person's time zone: their profile's (saved by the app), else BITE_TIMEZONE, else India. */
export async function timeZoneFor(store: BiteStore, env: Record<string, string | undefined> = process.env): Promise<string> {
  const { profile } = await store.getProfile();
  if (validTimeZone(profile?.timeZone)) return profile.timeZone;
  return validTimeZone(env.BITE_TIMEZONE) ? env.BITE_TIMEZONE : DEFAULT_TIME_ZONE;
}

export async function serveMcp(req: Request, store: BiteStore, options: ToolOptions & { parsedBody?: unknown } = {}): Promise<Response> {
  const { parsedBody, ...toolOptions } = options;
  const server = new McpServer({ name: "bite", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  registerTools(server, store, toolOptions);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req, { parsedBody });
  } finally {
    void server.close();
  }
}

/** A JSON-RPC error body, for failures before the protocol layer is reached. */
export const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), { status, headers: { "content-type": "application/json", ...headers } });
