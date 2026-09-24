/** Anthropic Messages API adapter (official SDK). */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { LLMError, type LLMMessage, type ProviderRequest, type ProviderResponse } from "../types";

const clients = new Map<string, Anthropic>();
function client(apiKey: string, baseURL?: string): Anthropic {
  const k = `${baseURL ?? ""}|${apiKey}`;
  let c = clients.get(k);
  if (!c) {
    // baseURL pinned so a stray ANTHROPIC_BASE_URL in the host env is never picked up.
    c = new Anthropic({ apiKey, baseURL: baseURL || "https://api.anthropic.com", timeout: 20_000, maxRetries: 1 });
    clients.set(k, c);
  }
  return c;
}

// Model quirks, so callers can pass the same options regardless of model.
const NO_SAMPLING = /^claude-(fable|mythos|opus-5|sonnet-5|opus-4-[78])/; // reject temperature
const THINKING_ALWAYS_ON = /^claude-(fable|mythos|opus-5-5)/; // can't disable; steer with effort
const THINKING_DEFAULT_ON = /^claude-(sonnet-5|opus-5)/; // on by default, can be disabled
const SUPPORTS_EFFORT = /^claude-(fable|mythos|opus|sonnet-5)/;

function toProvider(messages: LLMMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((p): Anthropic.TextBlockParam | Anthropic.ImageBlockParam =>
            p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
          ),
  }));
}

export async function complete(req: ProviderRequest, apiKey: string, baseURL?: string): Promise<ProviderResponse> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens,
    // Static system prompt first, marked for caching; everything per-request lives in messages.
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages: toProvider(req.messages),
  };
  const outputConfig: Anthropic.OutputConfig = {};
  if (req.schema) outputConfig.format = { type: "json_schema", schema: req.schema.json };
  if (THINKING_ALWAYS_ON.test(req.model)) {
    outputConfig.effort = req.effort && req.effort !== "none" && req.effort !== "minimal" ? req.effort : "low";
    params.max_tokens = req.maxTokens + 4000;
  } else if (THINKING_DEFAULT_ON.test(req.model) && !req.effort) {
    params.thinking = { type: "disabled" };
  } else if (req.effort && SUPPORTS_EFFORT.test(req.model) && req.effort !== "none" && req.effort !== "minimal") {
    outputConfig.effort = req.effort;
    params.max_tokens = req.maxTokens + 2000;
  }
  if (Object.keys(outputConfig).length) params.output_config = outputConfig;
  if (req.temperature !== undefined && !NO_SAMPLING.test(req.model)) params.temperature = req.temperature;

  let res: Anthropic.Message;
  try {
    res = await client(apiKey, baseURL).messages.create(params, { signal: req.signal });
  } catch (err) {
    throw mapError(err);
  }
  if (res.stop_reason === "refusal") return { text: "", stop: "refusal" };
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, stop: res.stop_reason === "max_tokens" ? "max_tokens" : "end" };
}

function mapError(err: unknown): LLMError {
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) return new LLMError("timeout", "request timed out");
  if (err instanceof Anthropic.RateLimitError) return new LLMError("rate_limited", "provider 429");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new LLMError("config", `provider auth ${err.status}`);
  if (err instanceof Anthropic.NotFoundError) return new LLMError("config", "model not found");
  if (err instanceof Anthropic.BadRequestError) return new LLMError("upstream", "provider 400");
  if (err instanceof Anthropic.APIError) return new LLMError("upstream", `provider ${err.status ?? "network"}`);
  return new LLMError("upstream", "unknown error");
}
