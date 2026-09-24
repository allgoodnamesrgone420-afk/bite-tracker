import { callLLM } from "@/lib/llm";
import { PhotoParseRequestSchema, ParseResultSchema } from "@/lib/schemas";
import { errorResponse, guard, okResponse, readJsonBody } from "@/lib/server/guard";
import { PHOTO_SYSTEM, buildPhotoUserText } from "@/lib/server/prompts";

export const runtime = "nodejs";

// Downsized JPEG as base64 plus a short note. Photos are analysed in memory and never stored.
const MAX_BODY_BYTES = 3_000_000;

export async function POST(req: Request) {
  const blocked = await guard(req, "photo", 8);
  if (blocked) return blocked;

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.code === "too_large"
      ? errorResponse("too_large", "That photo is too large. Try again.")
      : errorResponse("bad_request", "Couldn't read that photo.");
  }
  const parsed = PhotoParseRequestSchema.safeParse(body.body);
  if (!parsed.success) return errorResponse("bad_request", "Couldn't read that photo.");
  const { image, mediaType } = parsed.data;

  const result = await callLLM({
    model: process.env.LLM_VISION_MODEL || "claude-sonnet-5",
    system: PHOTO_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mediaType, data: image },
          { type: "text", text: buildPhotoUserText(parsed.data) },
        ],
      },
    ],
    schema: ParseResultSchema,
    maxTokens: 1000,
    temperature: 0.2,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "config":
        return errorResponse("config", "Photo breakdown needs the AI key (LLM_API_KEY). Add it manually for now.");
      case "timeout":
        return errorResponse("timeout", "That photo took too long. Try again, or add it manually.");
      case "rate_limited":
        return errorResponse("rate_limited", "Too many photos at once. Try again in a moment.");
      case "refused":
        return errorResponse("refused", "Couldn't analyse that photo. Add it manually?");
      case "invalid_output":
        return errorResponse("invalid_output", "Couldn't make sense of that photo. Add it manually?");
      default:
        return errorResponse("upstream", "The photo analyser is having a moment. Try again, or add it manually.");
    }
  }
  const r = result.data;
  const hasItems = r.items.length > 0;
  return okResponse({
    items: r.items.map((i) => ({ ...i, name: i.name.trim(), unit: i.unit.trim() || "serving" })),
    needs_clarification: hasItems ? null : r.needs_clarification?.trim() || null,
    suggested_answers: hasItems ? [] : r.suggested_answers.slice(0, 4),
    engine: "llm",
  });
}
