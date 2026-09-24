/**
 * The ONLY module that knows about the LLM provider. Swap providers by
 * re-implementing `callLLM` here; route handlers only see the neutral types.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { extractJson } from "./extract-json";

export type LLMPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };
export type LLMMessage = { role: "user" | "assistant"; content: string | LLMPart[] };

/** Neutral message shape → provider message shape. */
function toProvider(messages: LLMMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((p): Anthropic.TextBlockParam | Anthropic.ImageBlockParam =>
            p.type === "text"
              ? { type: "text", text: p.text }
              : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
          ),
  }));
}

export type LLMErrorCode = "config" | "timeout" | "rate_limited" | "upstream" | "invalid_output" | "refused";

export type LLMResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: LLMErrorCode; detail: string } };

export interface CallLLMOptions<S extends z.ZodType> {
  model: string;
  system: string;
  messages: LLMMessage[];
  /** When given, output is constrained to this schema and validated with it. */
  schema?: S;
  maxTokens: number;
  temperature?: number;
}

const REQUEST_TIMEOUT_MS = 20_000;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  client ??= new Anthropic({
    apiKey,
    // Pinned explicitly so a stray ANTHROPIC_BASE_URL in the host env is never picked up.
    baseURL: process.env.LLM_BASE_URL || "https://api.anthropic.com",
    timeout: REQUEST_TIMEOUT_MS,
    // One retry with SDK backoff (honours retry-after) on 408/409/429/5xx/connection errors.
    maxRetries: 1,
  });
  return client;
}

/* Model quirks, so callers can pass the same options regardless of model. */
// Newer models reject temperature/top_p/top_k with a 400.
const NO_SAMPLING = /^claude-(fable|mythos|opus-5|sonnet-5|opus-4-[78])/;
// Thinking is always on and cannot be disabled: steer with low effort and give headroom.
const THINKING_ALWAYS_ON = /^claude-(fable|mythos|opus-5-5)/;
// Adaptive thinking is on by default but can be switched off (short JSON tasks don't need it).
const THINKING_DEFAULT_ON = /^claude-(sonnet-5|opus-5)/;

function buildParams(opts: CallLLMOptions<z.ZodType>, maxTokens: number, messages: LLMMessage[]) {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: opts.model,
    max_tokens: maxTokens,
    // Static system prompt first, marked for caching. Everything per-request lives in messages.
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: toProvider(messages),
  };
  const outputConfig: Anthropic.OutputConfig = {};
  if (opts.schema) {
    const fmt = zodOutputFormat(opts.schema);
    outputConfig.format = { type: fmt.type, schema: fmt.schema };
  }
  if (THINKING_ALWAYS_ON.test(opts.model)) {
    outputConfig.effort = "low";
    params.max_tokens = maxTokens + 4000;
  } else if (THINKING_DEFAULT_ON.test(opts.model)) {
    params.thinking = { type: "disabled" };
  }
  if (Object.keys(outputConfig).length) params.output_config = outputConfig;
  if (opts.temperature !== undefined && !NO_SAMPLING.test(opts.model)) {
    params.temperature = opts.temperature;
  }
  return params;
}

function mapError(err: unknown): { code: LLMErrorCode; detail: string } {
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
    return { code: "timeout", detail: "request timed out" };
  }
  if (err instanceof Anthropic.RateLimitError) return { code: "rate_limited", detail: "provider 429" };
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { code: "config", detail: `provider auth ${err.status}` };
  }
  if (err instanceof Anthropic.NotFoundError) return { code: "config", detail: "model not found" };
  if (err instanceof Anthropic.BadRequestError) return { code: "upstream", detail: "provider 400" };
  if (err instanceof Anthropic.APIError) return { code: "upstream", detail: `provider ${err.status ?? "network"}` };
  return { code: "upstream", detail: "unknown error" };
}

export async function callLLM<S extends z.ZodType>(opts: CallLLMOptions<S>): Promise<LLMResult<z.infer<S>>> {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, error: { code: "config", detail: "LLM_API_KEY is not set" } };

  let messages = opts.messages;
  let maxTokens = opts.maxTokens;
  let lastProblem = "";

  // Attempt 1, then at most one repair attempt with the validation error appended.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create(buildParams(opts, maxTokens, messages), {
        // Hard wall-clock cap across the SDK's internal retry too.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const mapped = mapError(err);
      // Never log payloads or keys; code + short detail only.
      console.error(`[llm] ${opts.model} failed: ${mapped.code} (${mapped.detail})`);
      return { ok: false, error: mapped };
    }

    if (response.stop_reason === "refusal") {
      return { ok: false, error: { code: "refused", detail: "model declined" } };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!opts.schema) return { ok: true, data: text as z.infer<S> };

    if (response.stop_reason === "max_tokens") {
      lastProblem = "Response was cut off before the JSON finished.";
      maxTokens = Math.round(maxTokens * 1.75);
      continue; // retry the same prompt with more room
    }

    let candidate: unknown;
    try {
      candidate = extractJson(text);
    } catch (e) {
      lastProblem = `Invalid JSON: ${(e as Error).message}`;
    }
    if (candidate !== undefined) {
      const parsed = opts.schema.safeParse(candidate);
      if (parsed.success) return { ok: true, data: parsed.data };
      lastProblem = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    }

    messages = [
      ...opts.messages,
      { role: "assistant", content: text || "(empty)" },
      {
        role: "user",
        content: `Your previous JSON failed validation: ${lastProblem}\nReturn the full corrected JSON object only.`,
      },
    ];
  }

  console.error(`[llm] ${opts.model} invalid output after retry`);
  return { ok: false, error: { code: "invalid_output", detail: lastProblem.slice(0, 300) } };
}
