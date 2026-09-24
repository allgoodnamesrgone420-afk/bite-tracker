import { callLLM } from "@/lib/llm";
import { ChatReplySchema, ChatRequestSchema } from "@/lib/schemas";
import { errorResponse, guard, okResponse, readJsonBody } from "@/lib/server/guard";
import { CHAT_SYSTEM, buildChatMessages } from "@/lib/server/prompts";

export const runtime = "nodejs";

// ~10 short turns + a ~6 KB digest + up to 30 memory notes.
const MAX_BODY_BYTES = 40_000;

export async function POST(req: Request) {
  const blocked = await guard(req, "chat");
  if (blocked) return blocked;

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.code === "too_large" ? errorResponse("too_large", "That message is too long.") : errorResponse("bad_request", "Couldn't read that request.");
  }
  const parsed = ChatRequestSchema.safeParse(body.body);
  if (!parsed.success) return errorResponse("bad_request", parsed.error.issues[0]?.message ?? "Invalid chat request.");

  const result = await callLLM({
    task: "coach",
    system: CHAT_SYSTEM,
    messages: buildChatMessages(parsed.data),
    schema: ChatReplySchema,
    maxTokens: 700,
    temperature: 0.6,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "config":
        return errorResponse("config", "The AI coach isn't set up (no API key).");
      case "timeout":
        return errorResponse("timeout", "The coach took too long. Try again.");
      case "rate_limited":
        return errorResponse("rate_limited", "Too many requests. Try again in a minute.");
      case "refused":
        return errorResponse("refused", "The coach couldn't answer that one.");
      default:
        return errorResponse("upstream", "The coach is having a moment. Try again shortly.");
    }
  }
  const r = result.data;
  // A safety reply never changes memory.
  return okResponse(r.safety_flag ? { ...r, memory_add: [], memory_remove: [] } : r);
}
