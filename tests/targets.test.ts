import { describe, expect, it } from "vitest";
import { computeTargets, mifflinStJeor } from "@/lib/targets";
import type { Profile } from "@/lib/schemas";

const base: Profile = {
  age: 30, sex: "female", heightCm: 165, weightKg: 70, activity: "light",
  goal: "lose", rateKgPerWeek: 0.5, diet: "", healthNotes: "",
};

describe("mifflinStJeor", () => {
  it("matches the published formula for both sexes", () => {
    expect(mifflinStJeor(base)).toBeCloseTo(1420.25, 2);
    expect(mifflinStJeor({ age: 25, sex: "male", heightCm: 180, weightKg: 80 })).toBeCloseTo(1805, 2);
  });
});

describe("computeTargets", () => {
  it("computes a fat-loss target with macros", () => {
    const { targets, tdee, warnings } = computeTargets(base);
    expect(tdee).toBe(1953); // 1420.25 × 1.375
    expect(targets.calories).toBe(1400); // 1952.8 − 550, rounded to 10
    expect(targets.protein_g).toBe(122); // 140 g by weight, capped at 35% of kcal
    expect(targets.fat_g).toBe(44);
    expect(targets.carbs_g).toBe(129);
    expect(targets.fibre_g).toBe(20);
    expect(warnings).toEqual([]);
  });

  it("uses g/kg protein when under the cap", () => {
    const { targets } = computeTargets({ ...base, age: 25, sex: "male", heightCm: 180, weightKg: 80, activity: "moderate" });
    expect(targets.calories).toBe(2250);
    expect(targets.protein_g).toBe(160);
    expect(targets.fat_g).toBe(70);
    expect(targets.carbs_g).toBe(245);
    expect(targets.fibre_g).toBe(32);
  });

  it("macro calories add back up to the target (within rounding)", () => {
    const { targets } = computeTargets(base);
    const kcal = targets.protein_g * 4 + targets.carbs_g * 4 + targets.fat_g * 9;
    expect(Math.abs(kcal - targets.calories)).toBeLessThanOrEqual(10);
  });

  it("caps loss rate at 1% of body weight per week", () => {
    const r = computeTargets({ ...base, weightKg: 60, activity: "active", rateKgPerWeek: 1.0 });
    expect(r.effectiveRateKg).toBe(-0.6);
    expect(r.warnings.join(" ")).toMatch(/Capped at 0.6 kg\/week/);
  });

  it("never goes below the female floor of 1,200 kcal", () => {
    const r = computeTargets({ ...base, age: 50, heightCm: 150, weightKg: 45, activity: "sedentary", rateKgPerWeek: 0.45 });
    expect(r.targets.calories).toBe(1200);
    expect(r.warnings.some((w) => w.includes("safe minimum"))).toBe(true);
  });

  it("never goes below the male floor of 1,500 kcal", () => {
    const r = computeTargets({ ...base, sex: "male", age: 70, heightCm: 160, weightKg: 55, activity: "sedentary", rateKgPerWeek: 0.55 });
    expect(r.targets.calories).toBe(1500);
  });

  it("clamps a manual calorie override to the floor", () => {
    const r = computeTargets(base, { calories: 900 });
    expect(r.targets.calories).toBe(1200);
    expect(r.warnings.some((w) => w.includes("override"))).toBe(true);
  });

  it("recomputes macros from an overridden calorie target, but keeps explicit macro overrides", () => {
    const r = computeTargets(base, { calories: 1800, protein_g: 110 });
    expect(r.targets.calories).toBe(1800);
    expect(r.targets.protein_g).toBe(110);
    expect(r.targets.fat_g).toBe(56); // 1800 × 28% ÷ 9
  });

  it("maintain = TDEE, gain surplus capped at 500 kcal", () => {
    const m = computeTargets({ ...base, goal: "maintain" });
    expect(m.targets.calories).toBe(1950);
    const g = computeTargets({ ...base, goal: "gain", rateKgPerWeek: 1 });
    expect(g.targets.calories).toBe(2450); // 1952.8 + 500
    expect(g.warnings.join(" ")).toMatch(/capped at 500/);
  });
});
