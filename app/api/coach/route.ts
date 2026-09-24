import { callLLM } from "@/lib/llm";
import { CoachRequestSchema, CoachResponseSchema } from "@/lib/schemas";
import { errorResponse, guard, okResponse, readJsonBody } from "@/lib/server/guard";
import { COACH_SYSTEM, buildCoachUserMessage } from "@/lib/server/prompts";

export const runtime = "nodejs";

// Compact payload: profile, targets, today's items, <=14 summary rows, <=12 insight lines.
const MAX_BODY_BYTES = 24_000;

export async function POST(req: Request) {
  const blocked = await guard(req, "coach", 6);
  if (blocked) return blocked;

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.code === "too_large"
      ? errorResponse("too_large", "That's too much history in one go.")
      : errorResponse("bad_request", "Couldn't read that request.");
  }
  const parsed = CoachRequestSchema.safeParse(body.body);
  if (!parsed.success) return errorResponse("bad_request", "Invalid coach request.");

  const result = await callLLM({
    task: "coach",
    system: COACH_SYSTEM,
    messages: [{ role: "user", content: buildCoachUserMessage(parsed.data) }],
    schema: CoachResponseSchema,
    maxTokens: 900,
    temperature: 0.5,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "config":
        return errorResponse("config", "AI coach isn't set up (no API key). Showing your built-in recommendations.");
      case "timeout":
        return errorResponse("timeout", "The coach took too long. Try again in a moment.");
      case "rate_limited":
        return errorResponse("rate_limited", "Too many requests. Try again in a minute.");
      case "refused":
        return errorResponse("refused", "The coach couldn't answer that one.");
      case "invalid_output":
        return errorResponse("invalid_output", "The coach's answer came back garbled. Try again.");
      default:
        return errorResponse("upstream", "The coach is having a moment. Try again shortly.");
    }
  }
  const data = result.data;
  return okResponse({ ...data, changes: data.safety_flag ? [] : data.changes, engine: "llm", generatedAt: Date.now() });
}
