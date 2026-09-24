/**
 * The app's single entry point to an LLM. Route handlers call `callLLM` with a
 * task; which provider/model/effort serves it comes from env (see config.ts).
 * Every provider gets the same treatment: strict JSON schema output, Zod
 * validation, one repair retry with the validation error, a 20 s wall clock,
 * and typed errors the UI can map to friendly messages.
 */
import "server-only";
import type { z } from "zod";
import { extractJson } from "../extract-json";
import { resolveConfig, type Provider } from "./config";
import * as anthropic from "./providers/anthropic";
import * as openai from "./providers/openai";
import { strictJsonSchema } from "./schema";
import { LLMError, type LLMMessage, type LLMResult, type LLMTask, type ProviderRequest, type ProviderResponse } from "./types";

export type { LLMMessage, LLMPart, LLMResult, LLMTask } from "./types";

export interface CallLLMOptions<S extends z.ZodType> {
  task: LLMTask;
  system: string;
  messages: LLMMessage[];
  /** When given, output is constrained to this schema and validated with it. */
  schema?: S;
  maxTokens: number;
  /** Used where the provider/model accepts it; ignored otherwise. */
  temperature?: number;
}

const REQUEST_TIMEOUT_MS = 20_000;

function adapter(provider: Provider): (req: ProviderRequest, key: string, baseURL?: string) => Promise<ProviderResponse> {
  if (provider === "anthropic") return anthropic.complete;
  if (provider === "openai") return openai.completeResponses;
  return openai.completeChat; // every other provider speaks OpenAI-compatible Chat Completions
}

/** Non-secret summary for the Settings screen. */
export function describeLLM(): { configured: boolean; provider?: string; models?: Record<LLMTask, string>; effort?: string; problem?: string } {
  const r = resolveConfig();
  if (!r.ok) return { configured: false, problem: r.detail };
  return { configured: true, provider: r.config.provider, models: r.config.models, effort: r.config.effort };
}

export async function callLLM<S extends z.ZodType>(opts: CallLLMOptions<S>): Promise<LLMResult<z.infer<S>>> {
  const cfg = resolveConfig();
  if (!cfg.ok) return { ok: false, error: { code: "config", detail: cfg.detail } };
  const { provider, apiKey, baseURL, models, effort } = cfg.config;
  const model = models[opts.task];
  const complete = adapter(provider);
  // OpenAI's GPT-6 docs don't list temperature for reasoning models; don't send it there.
  const temperature = provider === "openai" ? undefined : opts.temperature;
  const schema = opts.schema ? { name: `${opts.task}_result`, json: strictJsonSchema(opts.schema) } : undefined;

  let messages = opts.messages;
  let maxTokens = opts.maxTokens;
  let lastProblem = "";

  // Attempt 1, then at most one repair attempt with the validation error appended.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: ProviderResponse;
    try {
      res = await complete(
        { model, system: opts.system, messages, schema, maxTokens, temperature, effort, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        apiKey,
        baseURL,
      );
    } catch (err) {
      const e = err instanceof LLMError ? err : new LLMError("upstream", "unknown error");
      // Never log payloads or keys; provider, model, code and a short detail only.
      console.error(`[llm] ${provider}/${model} failed: ${e.code} (${e.detail})`);
      return { ok: false, error: { code: e.code, detail: e.detail } };
    }

    if (res.stop === "refusal") return { ok: false, error: { code: "refused", detail: "model declined" } };
    if (!opts.schema) return { ok: true, data: res.text as z.infer<S> };
    if (res.stop === "max_tokens") {
      lastProblem = "Response was cut off before the JSON finished.";
      maxTokens = Math.round(maxTokens * 1.75);
      continue; // same prompt, more room
    }

    let candidate: unknown;
    try {
      candidate = extractJson(res.text);
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
      { role: "assistant", content: res.text || "(empty)" },
      { role: "user", content: `Your previous JSON failed validation: ${lastProblem}\nReturn the full corrected JSON object only.` },
    ];
  }

  console.error(`[llm] ${provider}/${model} invalid output after retry`);
  return { ok: false, error: { code: "invalid_output", detail: lastProblem.slice(0, 300) } };
}
