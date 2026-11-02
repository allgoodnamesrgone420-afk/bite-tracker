import { describe, expect, it } from "vitest";
import { ProfileSchema } from "@/lib/schemas";
import { addWater, fmtLitres, servingOf, setWaterTotal, waterGoal, waterTarget, type WaterLog } from "@/lib/water";

describe("waterTarget", () => {
  it("is about 35 ml/kg in whole 250 ml glasses", () => {
    expect(waterTarget(65)).toBe(2250);
    expect(waterTarget(80)).toBe(2750);
  });
  it("stays between 2 and 4 litres, with 2.5 L when weight is unknown", () => {
    expect(waterTarget(40)).toBe(2000);
    expect(waterTarget(150)).toBe(4000);
    expect(waterTarget(undefined)).toBe(2500);
  });
});

describe("addWater", () => {
  it("adds and removes per day without touching other days", () => {
    let log: WaterLog = { "2026-10-31": { ml: 1000, at: 1 } };
    log = addWater(log, "2026-11-01", 250, 5);
    log = addWater(log, "2026-11-01", 250, 6);
    expect(log["2026-11-01"]).toEqual({ ml: 500, at: 6 });
    expect(log["2026-10-31"]).toEqual({ ml: 1000, at: 1 });
  });
  it("never goes below zero or above 10 litres", () => {
    expect(addWater({}, "d", -250)["d"].ml).toBe(0);
    expect(addWater({ d: { ml: 9900, at: 0 } }, "d", 250)["d"].ml).toBe(10_000);
  });
});

describe("fmtLitres", () => {
  it("shows glasses exactly", () => {
    expect(fmtLitres(250)).toBe("0.25 L");
    expect(fmtLitres(1500)).toBe("1.5 L");
    expect(fmtLitres(2250)).toBe("2.25 L");
    expect(fmtLitres(0)).toBe("0 L");
  });
});

describe("your own water settings", () => {
  it("uses the goal you set instead of the one from your weight", () => {
    expect(waterGoal({}, 65)).toBe(2250);
    expect(waterGoal({ waterGoalMl: 3000 }, 65)).toBe(3000);
    expect(waterGoal(null, undefined)).toBe(2500);
  });
  it("taps add your chosen amount, a glass by default", () => {
    expect(servingOf(null)).toBe(250);
    expect(servingOf({ waterServingMl: 500 })).toBe(500);
  });
  it("sets a day's total outright, within the same limits", () => {
    const log: WaterLog = { d: { ml: 2000, at: 1 }, other: { ml: 500, at: 1 } };
    expect(setWaterTotal(log, "d", 1500, 9)).toEqual({ d: { ml: 1500, at: 9 }, other: { ml: 500, at: 1 } });
    expect(setWaterTotal(log, "new", 750)["new"].ml).toBe(750);
    expect(setWaterTotal(log, "d", 20_000)["d"].ml).toBe(10_000);
  });
  it("keeps the settings on the profile and rejects silly values", () => {
    const base = { age: 30, sex: "female", heightCm: 165, weightKg: 65, activity: "light", goal: "lose", rateKgPerWeek: 0.5 };
    expect(ProfileSchema.parse({ ...base, waterGoalMl: 3000, waterServingMl: 330 })).toMatchObject({ waterGoalMl: 3000, waterServingMl: 330 });
    expect(ProfileSchema.safeParse({ ...base, waterGoalMl: 100 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...base, waterServingMl: 5000 }).success).toBe(false);
  });
});
