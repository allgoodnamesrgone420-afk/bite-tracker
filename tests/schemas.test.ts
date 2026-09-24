import { describe, expect, it } from "vitest";
import { ParseRequestSchema, ParseResultSchema } from "@/lib/schemas";
import { extractJson } from "@/lib/extract-json";
import valid from "./fixtures/parse-valid.json";
import clarification from "./fixtures/parse-clarification.json";
import malformed from "./fixtures/parse-malformed.json";
import nonfood from "./fixtures/parse-nonfood.json";

describe("ParseResultSchema fixtures", () => {
  it("accepts a valid multi-item response", () => {
    const r = ParseResultSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.items).toHaveLength(3);
  });

  it("accepts a clarification response", () => {
    const r = ParseResultSchema.parse(clarification);
    expect(r.items).toEqual([]);
    expect(r.needs_clarification).toMatch(/rice/);
    expect(r.suggested_answers).toHaveLength(3);
  });

  it("accepts a non-food response (empty, no question)", () => {
    const r = ParseResultSchema.parse(nonfood);
    expect(r.items).toEqual([]);
    expect(r.needs_clarification).toBeNull();
  });

  it("rejects malformed output with precise issue paths", () => {
    const r = ParseResultSchema.safeParse(malformed);
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining([
      "items.0.quantity", "items.0.meal", "items.0.calories", "items.0.fibre_g",
      "items.0.confidence", "items.0.assumed", "items.0.notes", "needs_clarification",
    ]));
  });

  it("rejects more than 4 suggested answers", () => {
    const r = ParseResultSchema.safeParse({ ...clarification, suggested_answers: ["a", "b", "c", "d", "e"] });
    expect(r.success).toBe(false);
  });
});

describe("extractJson", () => {
  it("strips code fences and surrounding prose", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify(nonfood) + "\n```";
    expect(extractJson(text)).toEqual(nonfood);
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("sorry, no")).toThrow();
  });
});

describe("ParseRequestSchema", () => {
  it("enforces the 500-char limit", () => {
    expect(ParseRequestSchema.safeParse({ text: "a".repeat(501), localTime: "13:00" }).success).toBe(false);
    expect(ParseRequestSchema.safeParse({ text: "2 roti", localTime: "13:00" }).success).toBe(true);
  });
  it("rejects blank text and bad times", () => {
    expect(ParseRequestSchema.safeParse({ text: "   ", localTime: "13:00" }).success).toBe(false);
    expect(ParseRequestSchema.safeParse({ text: "roti", localTime: "1pm" }).success).toBe(false);
  });
});

describe("PhotoParseRequestSchema", async () => {
  const { PhotoParseRequestSchema } = await import("@/lib/schemas");
  const img = "A".repeat(200);
  it("accepts a base64 JPEG with an optional note", () => {
    expect(PhotoParseRequestSchema.safeParse({ image: img, mediaType: "image/jpeg", localTime: "13:00", note: "half plate" }).success).toBe(true);
  });
  it("rejects non-base64 payloads and unsupported types", () => {
    expect(PhotoParseRequestSchema.safeParse({ image: "<svg>".repeat(40), mediaType: "image/jpeg", localTime: "13:00" }).success).toBe(false);
    expect(PhotoParseRequestSchema.safeParse({ image: img, mediaType: "image/svg+xml", localTime: "13:00" }).success).toBe(false);
  });
});
