/** Provider-neutral types shared by every LLM adapter. */

export type LLMPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };
export type LLMMessage = { role: "user" | "assistant"; content: string | LLMPart[] };

export type LLMTask = "parse" | "vision" | "coach";

export type LLMErrorCode = "config" | "timeout" | "rate_limited" | "upstream" | "invalid_output" | "refused";

export type LLMResult<T> = { ok: true; data: T } | { ok: false; error: { code: LLMErrorCode; detail: string } };

export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** One request as an adapter sees it. `schema` is a strict JSON Schema (already converted). */
export type ProviderRequest = {
  model: string;
  system: string;
  messages: LLMMessage[];
  schema?: { name: string; json: Record<string, unknown> };
  maxTokens: number;
  temperature?: number;
  effort?: Effort;
  signal: AbortSignal;
};

export type ProviderResponse = { text: string; stop: "end" | "max_tokens" | "refusal" };

/** Thrown by adapters so the shared loop can map failures uniformly. */
export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    public detail: string,
  ) {
    super(detail);
  }
}
