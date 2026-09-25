import { describe, expect, it } from "vitest";
import { targetStreakInfo, type DayRow } from "@/lib/progress";
import { buildWeekReport, defaultReportWeek, reportText } from "@/lib/report";
import type { DayLog } from "@/lib/schemas";
import { streakWithFreeze, weekStart } from "@/lib/totals";

const T = { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60, fibre_g: 28 };
const row = (date: string, calories: number, extra: Partial<DayRow> = {}): DayRow => ({ date, count: 4, calories, protein_g: 125, carbs_g: 200, fat_g: 55, fibre_g: 25, ...extra });
const has = (dates: string[]) => (d: string) => dates.includes(d);

describe("weeks", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-09-25")).toBe("2026-09-21"); // Friday
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-10-01")).toBe("2026-09-28");
  });

  it("shows this week on Sunday, last week otherwise", () => {
    expect(defaultReportWeek("2026-09-27")).toBe("2026-09-21");
    expect(defaultReportWeek("2026-09-28")).toBe("2026-09-21");
    expect(defaultReportWeek("2026-09-25")).toBe("2026-09-14");
  });
});

describe("streak freeze", () => {
  it("forgives one missed day a week", () => {
    // Mon 21 - Fri 25 logged except Wed 23.
    const r = streakWithFreeze(has(["2026-09-21", "2026-09-22", "2026-09-24", "2026-09-25"]), "2026-09-25");
    expect(r).toEqual({ days: 4, frozen: ["2026-09-23"] });
  });

  it("doesn't forgive two misses in the same week", () => {
    const r = streakWithFreeze(has(["2026-09-21", "2026-09-23", "2026-09-25"]), "2026-09-25");
    expect(r).toEqual({ days: 2, frozen: ["2026-09-24"] });
  });

  it("gets a new freeze each week", () => {
    // Misses on Sat 19 (previous week) and Wed 23 (this week).
    const logged = ["2026-09-17", "2026-09-18", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-24", "2026-09-25"];
    expect(streakWithFreeze(has(logged), "2026-09-25")).toEqual({ days: 7, frozen: ["2026-09-23", "2026-09-19"] });
  });

  it("never spends a freeze on a gap with nothing behind it", () => {
    expect(streakWithFreeze(has(["2026-09-24", "2026-09-25"]), "2026-09-25")).toEqual({ days: 2, frozen: [] });
    expect(streakWithFreeze(has([]), "2026-09-25")).toEqual({ days: 0, frozen: [] });
  });

  it("keeps today in progress and forgives a missed yesterday", () => {
    expect(streakWithFreeze(has(["2026-09-22", "2026-09-23"]), "2026-09-25")).toEqual({ days: 2, frozen: ["2026-09-24"] });
  });

  it("applies to the on-target streak", () => {
    const rows = { "2026-09-22": row("2026-09-22", 2000), "2026-09-23": row("2026-09-23", 2600), "2026-09-24": row("2026-09-24", 1990) };
    expect(targetStreakInfo(rows, "2026-09-24", T)).toEqual({ days: 2, frozen: ["2026-09-23"] });
  });
});

describe("weekly report card", () => {
  const rows: Record<string, DayRow> = {
    "2026-09-07": row("2026-09-07", 2400),
    "2026-09-14": row("2026-09-14", 2000, { micros: { sodium_mg: 2600, sugar_g: 40, satfat_g: 15, calcium_mg: 800, iron_mg: 12 }, microCovered: 4 }),
    "2026-09-15": row("2026-09-15", 2650, { micros: { sodium_mg: 1800, sugar_g: 40, satfat_g: 15, calcium_mg: 800, iron_mg: 12 }, microCovered: 4 }),
    "2026-09-16": row("2026-09-16", 1950),
    "2026-09-18": row("2026-09-18", 1500),
  };
  const logs: DayLog[] = ["2026-09-14", "2026-09-15"].map((date) => ({
    date,
    items: [{ id: date, name: "Samosa", quantity: 2, unit: "piece", meal: "snack", calories: 520, protein_g: 8, carbs_g: 60, fat_g: 28, fibre_g: 4, confidence: "high", assumed: false, notes: "", source: "manual", createdAt: 0 }],
  }));
  const weights = { "2026-09-13": { kg: 80, at: 0 }, "2026-09-16": { kg: 79.6, at: 0 }, "2026-09-20": { kg: 79.2, at: 0 } };
  const r = buildWeekReport({ start: "2026-09-14", today: "2026-09-25", rows, logs, weights, fallback: T, profile: null });

  it("summarises days, weight, sodium and foods", () => {
    expect(r.end).toBe("2026-09-20");
    expect(r.partial).toBe(false);
    expect(r.stats).toMatchObject({ logged: 4, hit: 2, over: 1, under: 1 });
    expect(r.days.map((d) => d.status)).toEqual(["hit", "over", "hit", null, "under", null, null]);
    expect(r.weight?.start).toBe(80);
    expect(r.weight?.change).toBeLessThan(0);
    expect(r.sodium).toEqual({ over: 1, tracked: 2, limit: 2000 });
    expect(r.topFoods).toEqual([{ name: "Samosa", kcal: 1040, n: 2 }]);
  });

  it("compares with the week before", () => {
    expect(r.vsPrev).toEqual({ avgCalories: r.stats.avgCalories - 2400, avgProtein: 0, hit: 2 });
  });

  it("marks the current week as partial and makes shareable text", () => {
    const now = buildWeekReport({ start: "2026-09-21", today: "2026-09-25", rows, logs, weights, fallback: T, profile: null });
    expect(now.partial).toBe(true);
    expect(reportText(r)).toContain("On target 2/4 logged days");
  });
});
