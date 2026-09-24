/**
 * OpenAI adapters (official SDK).
 *  - completeResponses: OpenAI's own API via the Responses endpoint (GPT-6 family):
 *    reasoning effort, strict JSON schema, image input, store: false.
 *  - completeChat: any OpenAI-compatible Chat Completions endpoint (Gemini, Groq,
 *    OpenRouter, DeepSeek, xAI, Mistral, custom). Falls back to plain JSON mode
 *    when an endpoint doesn't support json_schema.
 */
import "server-only";
import OpenAI from "openai";
import { LLMError, type LLMMessage, type ProviderRequest, type ProviderResponse } from "../types";

const clients = new Map<string, OpenAI>();
function client(apiKey: string, baseURL?: string): OpenAI {
  const k = `${baseURL ?? ""}|${apiKey}`;
  let c = clients.get(k);
  if (!c) {
    // baseURL pinned so a stray OPENAI_BASE_URL in the host env is never picked up.
    c = new OpenAI({ apiKey, baseURL: baseURL || "https://api.openai.com/v1", timeout: 20_000, maxRetries: 1 });
    clients.set(k, c);
  }
  return c;
}

const dataUrl = (p: Extract<Exclude<LLMMessage["content"], string>[number], { type: "image" }>) => `data:${p.mediaType};base64,${p.data}`;

/* ------------------------------ Responses API ------------------------------ */

export async function completeResponses(req: ProviderRequest, apiKey: string, baseURL?: string): Promise<ProviderResponse> {
  const input: OpenAI.Responses.ResponseInput = req.messages.map((m) =>
    typeof m.content === "string" || m.role === "assistant"
      ? { role: m.role, content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("") }
      : {
          role: "user",
          content: m.content.map((p): OpenAI.Responses.ResponseInputContent =>
            p.type === "text" ? { type: "input_text", text: p.text } : { type: "input_image", image_url: dataUrl(p), detail: "auto" },
          ),
        },
  );
  const reasoning = req.effort && req.effort !== "none";
  let res: OpenAI.Responses.Response;
  try {
    res = await client(apiKey, baseURL).responses.create(
      {
        model: req.model,
        instructions: req.system, // static, so OpenAI's automatic prompt caching can reuse it
        input,
        // Reasoning tokens count toward this limit, so leave headroom when reasoning is on.
        max_output_tokens: req.maxTokens + (reasoning ? 2_000 : 0),
        ...(req.effort ? { reasoning: { effort: req.effort } } : {}),
        ...(req.schema ? { text: { format: { type: "json_schema", name: req.schema.name, schema: req.schema.json, strict: true } } } : {}),
        store: false, // don't keep user food logs/photos on OpenAI's side
      },
      { signal: req.signal },
    );
  } catch (err) {
    throw mapError(err);
  }

  const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
  if (refused) return { text: "", stop: "refusal" };
  if (res.status === "incomplete" && res.incomplete_details?.reason === "max_output_tokens") return { text: res.output_text, stop: "max_tokens" };
  return { text: res.output_text, stop: "end" };
}

/* --------------------------- Chat Completions API --------------------------- */

function toChat(system: string, messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: system },
    ...messages.map((m): OpenAI.Chat.ChatCompletionMessageParam =>
      typeof m.content === "string" || m.role === "assistant"
        ? { role: m.role, content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("") }
        : {
            role: "user",
            content: m.content.map((p): OpenAI.Chat.ChatCompletionContentPart =>
              p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: dataUrl(p) } },
            ),
          },
    ),
  ];
}

export async function completeChat(req: ProviderRequest, apiKey: string, baseURL?: string): Promise<ProviderResponse> {
  const base: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: req.model,
    messages: toChat(req.system, req.messages),
    max_tokens: req.maxTokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.effort && req.effort !== "none" ? { reasoning_effort: req.effort } : {}),
  };
  const withSchema = req.schema
    ? { ...base, response_format: { type: "json_schema" as const, json_schema: { name: req.schema.name, schema: req.schema.json, strict: true } } }
    : base;

  let res: OpenAI.Chat.ChatCompletion;
  try {
    res = await client(apiKey, baseURL).chat.completions.create(withSchema, { signal: req.signal });
  } catch (err) {
    // Some compatible endpoints only support plain JSON mode; the prompt already asks for JSON and Zod validates.
    if (req.schema && err instanceof OpenAI.BadRequestError) {
      try {
        res = await client(apiKey, baseURL).chat.completions.create({ ...base, response_format: { type: "json_object" } }, { signal: req.signal });
      } catch (err2) {
        throw mapError(err2);
      }
    } else throw mapError(err);
  }

  const choice = res.choices[0];
  if (!choice) throw new LLMError("upstream", "empty response");
  if (choice.message.refusal || choice.finish_reason === "content_filter") return { text: "", stop: "refusal" };
  return { text: choice.message.content ?? "", stop: choice.finish_reason === "length" ? "max_tokens" : "end" };
}

function mapError(err: unknown): LLMError {
  if (err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIUserAbortError) return new LLMError("timeout", "request timed out");
  if (err instanceof OpenAI.RateLimitError) return new LLMError("rate_limited", "provider 429");
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) return new LLMError("config", `provider auth ${err.status}`);
  if (err instanceof OpenAI.NotFoundError) return new LLMError("config", "model not found");
  if (err instanceof OpenAI.BadRequestError) return new LLMError("upstream", "provider 400");
  if (err instanceof OpenAI.APIError) return new LLMError("upstream", `provider ${err.status ?? "network"}`);
  return new LLMError("upstream", "unknown error");
}
