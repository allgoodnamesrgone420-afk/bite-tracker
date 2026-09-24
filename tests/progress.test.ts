import { describe, expect, it } from "vitest";
import { classifyDay, monthGrid, rangeStats, targetStreak, type DayRow } from "@/lib/progress";
import { computeInsights, localCoach } from "@/lib/insights";
import type { DayLog, LogItem } from "@/lib/schemas";

const T = { calories: 2000, protein_g: 120, carbs_g: 220, fat_g: 60, fibre_g: 28 };
const N = (calories: number, protein_g = 120, fat_g = 60, carbs_g = 200, fibre_g = 28) => ({ calories, protein_g, carbs_g, fat_g, fibre_g });

describe("classifyDay", () => {
  it("is on target within the band", () => expect(classifyDay(N(2080), T).status).toBe("hit"));
  it("is over beyond +100/5%", () => expect(classifyDay(N(2150), T)).toMatchObject({ status: "over", kcalDelta: 150 }));
  it("is under beyond −10%", () => expect(classifyDay(N(1700), T).status).toBe("under"));
  it("flags a probably-incomplete day", () => expect(classifyDay(N(800), T).status).toBe("low"));
  it("flags macros individually", () => {
    const c = classifyDay(N(1990, 80, 85), T);
    expect(c.status).toBe("hit");
    expect(c.flags.map((f) => `${f.key}:${f.kind}:${f.delta}`)).toEqual(["fat_g:over:25", "protein_g:short:-40"]);
    expect(c.proteinHit).toBe(false);
  });
});

describe("calendar & stats", () => {
  it("builds a Monday-first month grid", () => {
    const g = monthGrid(2026, 8); // Sept 2026 starts on a Tuesday
    expect(g[0]).toEqual([null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
  });
  const rows: Record<string, DayRow> = {
    "2026-09-20": { date: "2026-09-20", count: 3, ...N(2600) },
    "2026-09-21": { date: "2026-09-21", count: 3, ...N(2010) },
    "2026-09-22": { date: "2026-09-22", count: 3, ...N(1950) },
    "2026-09-23": { date: "2026-09-23", count: 3, ...N(2050) },
  };
  it("counts on-target streaks", () => expect(targetStreak(rows, "2026-09-23", T)).toBe(3));
  it("computes range stats with best and worst days", () => {
    const s = rangeStats(rows, Object.keys(rows), T);
    expect(s).toMatchObject({ logged: 4, hit: 3, over: 1, avgCalories: 2153 });
    expect(s.best?.date).toBe("2026-09-21");
    expect(s.worst?.date).toBe("2026-09-20");
  });
  it("judges a day by its own target snapshot", () => {
    const r = { "2026-09-23": { date: "2026-09-23", count: 1, ...N(2600), target: { ...T, calories: 2600 } } };
    expect(rangeStats(r, ["2026-09-23"], T).hit).toBe(1);
  });
});

const item = (name: string, meal: LogItem["meal"], calories: number, protein_g: number, fat_g = 5): LogItem => ({
  id: name + Math.random(), source: "llm", createdAt: new Date(2026, 8, 20, 13).getTime(),
  name, quantity: 1, unit: "piece", meal, calories, protein_g, carbs_g: 30, fat_g, fibre_g: 2,
  confidence: "high", assumed: false, notes: "",
});

describe("insights", () => {
  const days: DayLog[] = ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"].map((date) => ({
    date,
    items: [item("Aloo paratha", "breakfast", 900, 12, 40), item("Samosa", "snack", 780, 8, 40), item("Whey protein", "snack", 120, 24, 1.5), item("Dal", "dinner", 500, 20)],
  }));
  const input = { today: "2026-09-23", days, targets: T, profile: null, now: new Date(2026, 8, 23, 12) };

  it("recommends from foods you already eat", () => {
    const ins = computeInsights(input);
    const protein = ins.find((i) => i.id === "protein-short")!;
    expect(protein.detail).toContain("whey protein");
    const over = ins.find((i) => i.id === "over")!;
    expect(over.title).toBe("Over target on 4 of 4 days");
    expect(over.detail).toContain("Aloo paratha");
  });

  it("builds a local coach response", () => {
    const c = localCoach("weekly", input);
    expect(c.safety_flag).toBe(false);
    expect(c.changes.length).toBeGreaterThan(0);
    expect(c.snapshot).toMatch(/4 days logged/);
  });

  it("switches to the safety response on sensitive health notes", () => {
    const profile = { age: 30, sex: "female" as const, heightCm: 160, weightKg: 60, activity: "light" as const, goal: "lose" as const, rateKgPerWeek: 0.5, diet: "", healthNotes: "pregnant, 20 weeks" };
    const c = localCoach("daily", { ...input, profile });
    expect(c.safety_flag).toBe(true);
    expect(c.changes).toEqual([]);
  });
});
