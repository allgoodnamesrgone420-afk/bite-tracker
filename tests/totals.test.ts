import { describe, expect, it } from "vitest";
import { addDays, byMeal, macroSplit, remaining, streak, sumItems } from "@/lib/totals";
import type { LogItem } from "@/lib/schemas";

const item = (over: Partial<LogItem>): LogItem => ({
  id: Math.random().toString(36), source: "llm", createdAt: 0,
  name: "x", quantity: 1, unit: "piece", meal: "lunch",
  calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0,
  confidence: "high", assumed: false, notes: "", ...over,
});

describe("sumItems", () => {
  it("sums every nutrient and avoids float drift", () => {
    const t = sumItems([
      item({ calories: 110.4, protein_g: 0.1, carbs_g: 20, fat_g: 1.5, fibre_g: 3 }),
      item({ calories: 180.3, protein_g: 0.2, carbs_g: 24, fat_g: 5.5, fibre_g: 5 }),
    ]);
    expect(t).toEqual({ calories: 291, protein_g: 0.3, carbs_g: 44, fat_g: 7, fibre_g: 8 });
  });
  it("returns zeros for an empty day", () => {
    expect(sumItems([])).toEqual({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 });
  });
});

describe("byMeal / remaining / macroSplit", () => {
  it("groups by meal with per-meal totals", () => {
    const g = byMeal([item({ meal: "lunch", calories: 200 }), item({ meal: "lunch", calories: 100 }), item({ meal: "dinner", calories: 50 })]);
    expect(g.lunch.totals.calories).toBe(300);
    expect(g.dinner.items).toHaveLength(1);
    expect(g.breakfast.items).toHaveLength(0);
  });
  it("goes negative when over target", () => {
    const r = remaining({ calories: 2000, protein_g: 100, carbs_g: 200, fat_g: 60, fibre_g: 28 },
      { calories: 2240, protein_g: 80, carbs_g: 250, fat_g: 70, fibre_g: 10 });
    expect(r.calories).toBe(-240);
    expect(r.protein_g).toBe(20);
  });
  it("splits calories by macro", () => {
    const s = macroSplit({ calories: 0, protein_g: 25, carbs_g: 25, fat_g: 0, fibre_g: 0 });
    expect(s).toEqual({ protein: 0.5, carbs: 0.5, fat: 0 });
    expect(macroSplit({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }).protein).toBe(0);
  });
});

describe("dates and streak", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });
  it("counts consecutive days ending today", () => {
    expect(streak(["2026-09-21", "2026-09-22", "2026-09-23"], "2026-09-23")).toBe(3);
  });
  it("keeps the streak alive if today isn't logged yet", () => {
    expect(streak(["2026-09-21", "2026-09-22"], "2026-09-23")).toBe(2);
  });
  it("breaks on a gap", () => {
    expect(streak(["2026-09-19", "2026-09-21", "2026-09-22", "2026-09-23"], "2026-09-23")).toBe(3);
    expect(streak(["2026-09-20"], "2026-09-23")).toBe(0);
  });
});
