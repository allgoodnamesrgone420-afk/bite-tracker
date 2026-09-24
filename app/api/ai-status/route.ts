import { describeLLM } from "@/lib/llm";
import { guard, okResponse } from "@/lib/server/guard";

export const runtime = "nodejs";

/** Which provider/models are active (never the key). Signed-in users only when accounts are on. */
export async function GET(req: Request) {
  const blocked = await guard(req, "status");
  if (blocked) return blocked;
  return okResponse(describeLLM());
}
