/**
 * Bite's MCP server (stdio): lets an assistant such as Claude read your food
 * log and add to it. Sign in once with `npm run mcp:login`, then point the
 * client at `node_modules/.bin/tsx mcp/server.ts` (see "MCP server" in the README).
 *
 * stdout carries the protocol, so anything for a human goes to stderr, and the
 * server is started with tsx directly: `npm run` would print a banner to stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SetupError, createSupabase, requireUser } from "./auth";
import { SupabaseStore } from "./store";
import { INSTRUCTIONS, registerTools } from "./tools";

async function main() {
  const sb = createSupabase();
  const user = await requireUser(sb);
  const server = new McpServer({ name: "bite", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  registerTools(server, new SupabaseStore(sb, user.id));
  await server.connect(new StdioServerTransport());
  console.error(`Bite MCP server running for ${user.email}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof SetupError ? e.message : e);
  process.exit(1);
});
