/**
 * Which provider, key and models to use, from env. Bring any supported key:
 *   LLM_API_KEY            the provider's API key (required)
 *   LLM_PROVIDER           optional; inferred from the key prefix when unset
 *   LLM_MODEL              one model for every task, or per task:
 *   LLM_PARSER_MODEL / LLM_VISION_MODEL / LLM_COACH_MODEL
 *   LLM_REASONING_EFFORT   none|minimal|low|medium|high|xhigh|max (where supported)
 *   LLM_BASE_URL           endpoint for LLM_PROVIDER=compatible (any OpenAI-compatible API)
 */
import type { Effort, LLMTask } from "./types";

export const PROVIDERS = ["anthropic", "openai", "gemini", "groq", "openrouter", "deepseek", "xai", "mistral", "compatible"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** OpenAI-compatible Chat Completions endpoints for providers without their own adapter. */
export const COMPAT_BASE_URL: Partial<Record<Provider, string>> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
};

/** Defaults only where they've been verified; other providers need LLM_MODEL set. */
const DEFAULT_MODELS: Partial<Record<Provider, Record<LLMTask, string>>> = {
  anthropic: { parse: "claude-haiku-4-5", vision: "claude-sonnet-5", coach: "claude-sonnet-5" },
  openai: { parse: "gpt-6-luna", vision: "gpt-6-luna", coach: "gpt-6-luna" },
};
const DEFAULT_EFFORT: Partial<Record<Provider, Effort>> = { openai: "low" };

const EFFORTS: Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

export function inferProvider(key: string): Provider | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("xai-")) return "xai";
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("sk-")) return "openai"; // also sk-proj-; DeepSeek keys look alike, so set LLM_PROVIDER=deepseek
  return null;
}

export type LLMConfig = {
  provider: Provider;
  apiKey: string;
  baseURL?: string;
  models: Record<LLMTask, string>;
  effort?: Effort;
};

export function resolveConfig(env: Record<string, string | undefined> = process.env): { ok: true; config: LLMConfig } | { ok: false; detail: string } {
  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) return { ok: false, detail: "LLM_API_KEY is not set" };

  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit && !PROVIDERS.includes(explicit as Provider)) {
    return { ok: false, detail: `Unknown LLM_PROVIDER "${explicit}". Use one of: ${PROVIDERS.join(", ")}` };
  }
  const provider = (explicit as Provider | undefined) ?? inferProvider(apiKey);
  if (!provider) return { ok: false, detail: "Couldn't tell the provider from the key. Set LLM_PROVIDER." };

  const baseURL = provider === "compatible" ? env.LLM_BASE_URL?.trim() : env.LLM_BASE_URL?.trim() || COMPAT_BASE_URL[provider];
  if (provider === "compatible" && !baseURL) return { ok: false, detail: "LLM_PROVIDER=compatible needs LLM_BASE_URL" };

  const d = DEFAULT_MODELS[provider];
  const all = env.LLM_MODEL?.trim();
  const models = {
    parse: env.LLM_PARSER_MODEL?.trim() || all || d?.parse,
    vision: env.LLM_VISION_MODEL?.trim() || all || d?.vision,
    coach: env.LLM_COACH_MODEL?.trim() || all || d?.coach,
  };
  if (!models.parse || !models.vision || !models.coach) {
    return { ok: false, detail: `Set LLM_MODEL (or LLM_PARSER_MODEL, LLM_VISION_MODEL, LLM_COACH_MODEL) for ${provider}` };
  }

  const e = env.LLM_REASONING_EFFORT?.trim().toLowerCase();
  if (e && !EFFORTS.includes(e as Effort)) return { ok: false, detail: `LLM_REASONING_EFFORT must be one of ${EFFORTS.join(", ")}` };
  const effort = (e as Effort | undefined) ?? DEFAULT_EFFORT[provider];

  return { ok: true, config: { provider, apiKey, baseURL, models: models as Record<LLMTask, string>, effort } };
}
