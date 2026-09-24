import { callLLM } from "@/lib/llm";
import { ParseRequestSchema, ParseResultSchema, type ParseResult } from "@/lib/schemas";
import { errorResponse, guard, okResponse, readJsonBody } from "@/lib/server/guard";
import { PARSER_SYSTEM, buildParserUserMessage } from "@/lib/server/prompts";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4_000; // 500-char text + optional correction item and context

export async function POST(req: Request) {
  const blocked = await guard(req, "parse", 20);
  if (blocked) return blocked;

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.code === "too_large"
      ? errorResponse("too_large", "That's a lot of food. Keep it under 500 characters.")
      : errorResponse("bad_request", "Couldn't read that request.");
  }

  const parsed = ParseRequestSchema.safeParse(body.body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big" && i.path[0] === "text");
    return tooLong
      ? errorResponse("too_large", "Keep it under 500 characters.")
      : errorResponse("bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const result = await callLLM({
    model: process.env.LLM_PARSER_MODEL || "claude-haiku-4-5",
    system: PARSER_SYSTEM,
    messages: [{ role: "user", content: buildParserUserMessage(parsed.data) }],
    schema: ParseResultSchema,
    maxTokens: 800,
    temperature: 0.1,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "config":
        return errorResponse("config", "The server isn't set up yet (missing or invalid API key).");
      case "timeout":
        return errorResponse("timeout", "That took too long. Try again, or add it manually.");
      case "rate_limited":
        return errorResponse("rate_limited", "We're being rate limited. Try again in a moment.");
      case "refused":
        return errorResponse("refused", "Couldn't process that one. Add it manually?");
      case "invalid_output":
        return errorResponse("invalid_output", "That one slipped past us. Add it manually?");
      default:
        return errorResponse("upstream", "The estimator is having a moment. Try again, or add it manually.");
    }
  }

  return okResponse({ ...normalise(result.data), engine: "llm" });
}

/** Defensive clean-up; the schema already guarantees shape and ranges. */
function normalise(r: ParseResult): ParseResult {
  const hasItems = r.items.length > 0;
  return {
    items: r.items.map((i) => ({ ...i, name: i.name.trim(), unit: i.unit.trim() || "serving" })),
    // A question only makes sense with no items; don't show both.
    needs_clarification: hasItems ? null : r.needs_clarification?.trim() || null,
    suggested_answers: hasItems ? [] : r.suggested_answers.filter(Boolean).slice(0, 4),
  };
}
