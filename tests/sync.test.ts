import { describe, expect, it } from "vitest";
import type { PersonalFood } from "@/lib/calibration";
import type { DayLog, LogItem } from "@/lib/schemas";
import { applyRemoteFoods, applyRemoteItems, diffDay, diffFoods, maxTimestamp } from "@/lib/sync-core";

const item = (id: string, calories: number, createdAt = 1): LogItem => ({
  id, createdAt, source: "llm", name: "Roti", quantity: 1, unit: "piece", meal: "lunch",
  calories, protein_g: 3, carbs_g: 20, fat_g: 1, fibre_g: 3, confidence: "high", assumed: false, notes: "",
});
const day = (date: string, items: LogItem[]): DayLog => ({ date, items });

describe("diffDay", () => {
  it("finds added, changed and removed items", () => {
    const prev = day("2026-09-24", [item("a", 100), item("b", 200)]);
    const next = day("2026-09-24", [item("a", 100), item("b", 250), item("c", 50)]);
    expect(diffDay(prev, next)).toEqual({ b: { date: "2026-09-24", item: item("b", 250) }, c: { date: "2026-09-24", item: item("c", 50) } });
    expect(diffDay(next, day("2026-09-24", [item("a", 100)]))).toEqual({ b: { date: "2026-09-24", item: null }, c: { date: "2026-09-24", item: null } });
  });
  it("treats a brand-new day as all additions", () => {
    expect(Object.keys(diffDay(undefined, day("2026-09-24", [item("a", 1)])))).toEqual(["a"]);
  });
});

describe("applyRemoteItems", () => {
  const local = { "2026-09-24": day("2026-09-24", [item("a", 100, 1), item("b", 200, 2)]) };
  const row = (id: string, calories: number, deleted = false, createdAt = 3) => ({ id, date: "2026-09-24", item: item(id, calories, createdAt), deleted, updated_at: "2026-09-24T10:00:00Z" });

  it("adds, updates and deletes, keeping time order", () => {
    const out = applyRemoteItems(local, [row("c", 50, false, 0), row("a", 120, false, 1), row("b", 0, true)], new Set());
    expect(out["2026-09-24"].items.map((i) => [i.id, i.calories])).toEqual([["c", 50], ["a", 120]]);
  });
  it("never overwrites an item with unpushed local edits", () => {
    const out = applyRemoteItems(local, [row("a", 999, false, 1)], new Set(["a"]));
    expect(out).toEqual({});
  });
  it("reports no change when remote matches local", () => {
    expect(applyRemoteItems(local, [{ ...row("a", 100), item: item("a", 100, 1) }], new Set())).toEqual({});
  });
  it("creates days that don't exist locally yet", () => {
    const out = applyRemoteItems({}, [{ ...row("z", 80), date: "2026-09-20" }], new Set());
    expect(out["2026-09-20"].items).toHaveLength(1);
  });
});

describe("foods", () => {
  const whey = { key: "whey protein", name: "Whey protein", unit: "scoop", per: [120, 24, 3, 1.5, 0], verified: false, uses: 1, updatedAt: 1 } as PersonalFood;
  it("diffs and applies with pending protection", () => {
    expect(diffFoods({}, { "whey protein": whey })).toEqual({ "whey protein": whey });
    expect(diffFoods({ "whey protein": whey }, {})).toEqual({ "whey protein": null });
    const cal = { ...whey, verified: true, per: [130, 25, 4, 2, 1] as PersonalFood["per"] };
    expect(applyRemoteFoods({ "whey protein": whey }, [{ key: "whey protein", food: cal, deleted: false, updated_at: "x" }], new Set())).toEqual({ "whey protein": cal });
    expect(applyRemoteFoods({ "whey protein": whey }, [{ key: "whey protein", food: cal, deleted: false, updated_at: "x" }], new Set(["whey protein"]))).toBeNull();
    expect(applyRemoteFoods({ "whey protein": whey }, [{ key: "whey protein", food: null, deleted: true, updated_at: "x" }], new Set())).toEqual({});
  });
});

describe("maxTimestamp", () => {
  it("compares timestamps as dates, not strings", () => {
    expect(maxTimestamp(null, [{ updated_at: "2026-09-24T10:00:00.12+00:00" }, { updated_at: "2026-09-24T10:00:00.119999+00:00" }])).toBe("2026-09-24T10:00:00.12+00:00");
    expect(maxTimestamp("2026-09-25T00:00:00Z", [{ updated_at: "2026-09-24T00:00:00Z" }])).toBe("2026-09-25T00:00:00Z");
  });
});
