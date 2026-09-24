import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inferProvider, resolveConfig } from "@/lib/llm/config";
import { strictJsonSchema } from "@/lib/llm/schema";
import { callLLM } from "@/lib/llm";
import { ParseResultSchema } from "@/lib/schemas";

describe("provider config", () => {
  it("infers the provider from the key", () => {
    expect(inferProvider("sk-proj-abc")).toBe("openai");
    expect(inferProvider("sk-ant-api03-x")).toBe("anthropic");
    expect(inferProvider("AIzaSyX")).toBe("gemini");
    expect(inferProvider("gsk_x")).toBe("groq");
    expect(inferProvider("sk-or-v1-x")).toBe("openrouter");
    expect(inferProvider("xai-x")).toBe("xai");
    expect(inferProvider("mystery")).toBeNull();
  });
  it("defaults OpenAI to gpt-6-luna at low effort", () => {
    const r = resolveConfig({ LLM_API_KEY: "sk-proj-abc" });
    expect(r.ok && r.config).toMatchObject({ provider: "openai", effort: "low", models: { parse: "gpt-6-luna", vision: "gpt-6-luna", coach: "gpt-6-luna" } });
  });
  it("lets env override provider, models and effort", () => {
    const r = resolveConfig({ LLM_API_KEY: "k", LLM_PROVIDER: "gemini", LLM_MODEL: "m-1", LLM_COACH_MODEL: "m-2", LLM_REASONING_EFFORT: "medium" });
    expect(r.ok && r.config).toMatchObject({ provider: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", models: { parse: "m-1", vision: "m-1", coach: "m-2" }, effort: "medium" });
  });
  it("explains what's missing", () => {
    expect(resolveConfig({})).toEqual({ ok: false, detail: "LLM_API_KEY is not set" });
    expect(resolveConfig({ LLM_API_KEY: "gsk_x" })).toMatchObject({ ok: false, detail: expect.stringContaining("Set LLM_MODEL") });
    expect(resolveConfig({ LLM_API_KEY: "k", LLM_PROVIDER: "compatible", LLM_MODEL: "m" })).toMatchObject({ ok: false, detail: expect.stringContaining("LLM_BASE_URL") });
    expect(resolveConfig({ LLM_API_KEY: "k", LLM_PROVIDER: "nope" })).toMatchObject({ ok: false });
  });
});

describe("strictJsonSchema", () => {
  it("closes objects, requires every property and drops range keywords", () => {
    const s = strictJsonSchema(ParseResultSchema) as { properties: Record<string, { items?: { properties: Record<string, object>; required: string[]; additionalProperties: boolean } }>; required: string[]; additionalProperties: boolean };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["items", "needs_clarification", "suggested_answers"]);
    const item = s.properties.items.items!;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toContain("fibre_g");
    expect(JSON.stringify(s)).not.toMatch(/"(minimum|maximum|maxItems|maxLength)"/);
  });
});

/* ---------- adapters against a local mock of each provider's API ---------- */

type Seen = { path: string; body: Record<string, unknown>; auth?: string };
const seen: Seen[] = [];
let replies: Array<(body: Record<string, unknown>) => { status?: number; json: unknown }> = [];
let base = "";
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    seen.push({ path: req.url ?? "", body, auth: req.headers.authorization ?? (req.headers["x-api-key"] as string) });
    const next = replies.shift();
    const r = next ? next(body) : { status: 500, json: { error: { message: "no reply queued" } } };
    res.writeHead(r.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(r.json));
  });
});
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  seen.length = 0;
  replies = [];
  for (const k of Object.keys(process.env)) if (k.startsWith("LLM_")) delete process.env[k];
});

const good = { items: [{ name: "Whey protein", quantity: 2, unit: "scoop", meal: "snack", calories: 240, protein_g: 48, carbs_g: 6, fat_g: 3, fibre_g: 0, confidence: "high", assumed: false, notes: "" }], needs_clarification: null, suggested_answers: [] };
const responsesReply = (text: string, extra: Record<string, unknown> = {}) => () => ({
  json: { id: "resp_1", object: "response", created_at: 1, model: "gpt-6-luna", status: "completed", output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }], ...extra },
});
const photo = { role: "user" as const, content: [{ type: "image" as const, mediaType: "image/jpeg" as const, data: "AAAA" }, { type: "text" as const, text: "Break down the food in this photo." }] };

describe("OpenAI adapter (Responses API)", () => {
  it("sends gpt-6-luna with low effort, strict schema, image and store:false", async () => {
    Object.assign(process.env, { LLM_API_KEY: "sk-proj-test", LLM_BASE_URL: `${base}/v1` });
    replies.push(responsesReply(JSON.stringify(good)));
    const r = await callLLM({ task: "vision", system: "SYS", messages: [photo], schema: ParseResultSchema, maxTokens: 1000, temperature: 0.2 });
    expect(r).toEqual({ ok: true, data: good });
    const { path, body, auth } = seen[0];
    expect(path).toBe("/v1/responses");
    expect(auth).toBe("Bearer sk-proj-test");
    expect(body).toMatchObject({ model: "gpt-6-luna", instructions: "SYS", reasoning: { effort: "low" }, store: false, max_output_tokens: 3000 });
    expect(body).not.toHaveProperty("temperature");
    expect(body.text).toMatchObject({ format: { type: "json_schema", name: "vision_result", strict: true } });
    expect(body.input).toEqual([{ role: "user", content: [{ type: "input_image", image_url: "data:image/jpeg;base64,AAAA", detail: "auto" }, { type: "input_text", text: "Break down the food in this photo." }] }]);
  });

  it("retries once with the validation error, then succeeds", async () => {
    Object.assign(process.env, { LLM_API_KEY: "sk-proj-test", LLM_BASE_URL: `${base}/v1` });
    replies.push(responsesReply(JSON.stringify({ items: "nope" })), responsesReply("```json\n" + JSON.stringify(good) + "\n```"));
    const r = await callLLM({ task: "parse", system: "SYS", messages: [{ role: "user", content: "2 scoop whey" }], schema: ParseResultSchema, maxTokens: 800 });
    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(2);
    const retryInput = seen[1].body.input as { role: string; content: string }[];
    expect(retryInput.at(-1)!.content).toMatch(/failed validation: items/);
  });

  it("maps refusals, auth errors and truncation", async () => {
    Object.assign(process.env, { LLM_API_KEY: "sk-proj-test", LLM_BASE_URL: `${base}/v1` });
    replies.push(() => ({ json: { id: "r", object: "response", created_at: 1, model: "m", status: "completed", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "no" }] }] } }));
    expect(await callLLM({ task: "coach", system: "S", messages: [{ role: "user", content: "x" }], schema: ParseResultSchema, maxTokens: 100 })).toMatchObject({ ok: false, error: { code: "refused" } });

    replies.push(() => ({ status: 401, json: { error: { message: "bad key", type: "invalid_request_error" } } }));
    expect(await callLLM({ task: "parse", system: "S", messages: [{ role: "user", content: "x" }], schema: ParseResultSchema, maxTokens: 100 })).toMatchObject({ ok: false, error: { code: "config" } });

    replies.push(responsesReply('{"items":[', { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), responsesReply(JSON.stringify(good)));
    expect((await callLLM({ task: "parse", system: "S", messages: [{ role: "user", content: "x" }], schema: ParseResultSchema, maxTokens: 100 })).ok).toBe(true);
    expect(seen.at(-1)!.body.max_output_tokens).toBe(175 + 2000); // retried with more room
  });
});

describe("OpenAI-compatible adapter (Chat Completions)", () => {
  const chatReply = (content: string) => () => ({ json: { id: "c", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content, refusal: null } }] } });

  it("uses json_schema, and falls back to JSON mode when the endpoint rejects it", async () => {
    Object.assign(process.env, { LLM_API_KEY: "k", LLM_PROVIDER: "compatible", LLM_BASE_URL: `${base}/v1`, LLM_MODEL: "some-model" });
    replies.push(() => ({ status: 400, json: { error: { message: "response_format json_schema not supported" } } }), chatReply(JSON.stringify(good)));
    const r = await callLLM({ task: "vision", system: "SYS", messages: [photo], schema: ParseResultSchema, maxTokens: 500, temperature: 0.2 });
    expect(r.ok).toBe(true);
    expect(seen[0].path).toBe("/v1/chat/completions");
    expect(seen[0].body).toMatchObject({ model: "some-model", temperature: 0.2, response_format: { type: "json_schema" } });
    expect((seen[0].body.messages as { role: string }[])[0]).toEqual({ role: "system", content: "SYS" });
    expect((seen[0].body.messages as { content: unknown }[])[1].content).toEqual([{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } }, { type: "text", text: "Break down the food in this photo." }]);
    expect(seen[1].body.response_format).toEqual({ type: "json_object" });
  });
});

describe("Anthropic adapter", () => {
  it("still works when you bring an Anthropic key", async () => {
    Object.assign(process.env, { LLM_API_KEY: "sk-ant-test", LLM_BASE_URL: base });
    replies.push(() => ({ json: { id: "msg", type: "message", role: "assistant", model: "claude-haiku-4-5", content: [{ type: "text", text: JSON.stringify(good) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } }));
    const r = await callLLM({ task: "parse", system: "SYS", messages: [{ role: "user", content: "2 scoop whey" }], schema: ParseResultSchema, maxTokens: 800, temperature: 0.1 });
    expect(r.ok).toBe(true);
    expect(seen[0].path).toBe("/v1/messages");
    expect(seen[0].body).toMatchObject({ model: "claude-haiku-4-5", temperature: 0.1, output_config: { format: { type: "json_schema" } } });
  });
});
