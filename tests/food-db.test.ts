import { describe, expect, it } from "vitest";
import { FOODS } from "@/lib/food-db";

const ALCOHOL = new Set(["Beer", "Wine", "Spirits"]);

describe("food library data", () => {
  it("has unique names and aliases that resolve to one food", () => {
    const names = FOODS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const f of FOODS) for (const a of f.aliases) {
      if (seen.has(a) && seen.get(a) !== f.name) dupes.push(`${a}: ${seen.get(a)} / ${f.name}`);
      seen.set(a, f.name);
    }
    expect(dupes).toEqual([]);
  });

  it("gives every food five non-negative macros and five micros", () => {
    for (const f of FOODS) {
      expect(f.n, f.name).toHaveLength(5);
      expect(f.m, f.name).toHaveLength(5);
      expect([...f.n, ...f.m!].every((v) => Number.isFinite(v) && v >= 0), f.name).toBe(true);
      expect(f.grams, f.name).toBeGreaterThan(0);
    }
  });

  it("has calories that roughly match 4/4/9 from the macros (catches typos)", () => {
    const off = FOODS.filter((f) => !ALCOHOL.has(f.name) && f.n[0] > 20).filter((f) => {
      const [kcal, p, c, fat, fibre] = f.n;
      const fromMacros = 4 * p + 4 * (c - fibre / 2) + 9 * fat;
      return Math.abs(kcal - fromMacros) > Math.max(20, kcal * 0.2);
    });
    expect(off.map((f) => `${f.name}: ${f.n[0]} vs ${Math.round(4 * f.n[1] + 4 * f.n[2] + 9 * f.n[3])}`)).toEqual([]);
  });

  it("keeps sugar within carbs and saturated fat within fat", () => {
    const bad = FOODS.filter((f) => f.m![1] > f.n[2] + 0.5 || f.m![2] > f.n[3] + 0.5).map((f) => f.name);
    expect(bad).toEqual([]);
  });
});
