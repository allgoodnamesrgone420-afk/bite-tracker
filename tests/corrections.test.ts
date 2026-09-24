import { describe, expect, it } from "vitest";
import { itemFromPersonal, learnFoods, topFoods } from "@/lib/calibration";
import { localCorrection } from "@/lib/corrections";
import type { ParsedItem } from "@/lib/schemas";

const roti: ParsedItem = { name: "Roti", quantity: 2, unit: "piece", meal: "lunch", calories: 220, protein_g: 7, carbs_g: 40, fat_g: 3, fibre_g: 6, confidence: "high", assumed: false, notes: "" };
const dal: ParsedItem = { name: "Dal tadka", quantity: 1, unit: "bowl", meal: "lunch", calories: 420, protein_g: 9, carbs_g: 24, fat_g: 32, fibre_g: 5, confidence: "medium", assumed: false, notes: "3 tbsp oil" };

describe("localCorrection", () => {
  it("rescales on a bare quantity", () => {
    expect(localCorrection(roti, "it was 3 not 2")).toMatchObject({ quantity: 3, calories: 330, protein_g: 10.5, meal: "lunch" });
    expect(localCorrection(roti, "only half")).toMatchObject({ quantity: 0.5, calories: 55 });
  });
  it("accepts a restatement of the same food", () => {
    expect(localCorrection(roti, "3 rotis")).toMatchObject({ name: "Roti", quantity: 3, calories: 330 });
  });
  it("refuses recipe changes it can't do honestly", () => {
    expect(localCorrection(dal, "that was 1 tbsp of oil, not 3")).toBeNull();
    expect(localCorrection(roti, "it was paratha not roti")).toBeNull();
    expect(localCorrection(roti, "less salt")).toBeNull();
  });
});

describe("quick-add", () => {
  it("offers your most-logged foods at your usual portion", () => {
    const row = (name: string, quantity: number, calories: number) => ({ ...roti, name, quantity, calories, source: "llm" as const });
    const foods = learnFoods(learnFoods({}, [row("Whey protein", 1, 120), row("Roti", 2, 220)]), [row("Whey protein", 1.5, 180)]);
    const top = topFoods(foods);
    expect(top.map((f) => f.name)).toEqual(["Whey protein", "Roti"]);
    expect(itemFromPersonal(top[0], "snack")).toMatchObject({ quantity: 1.5, calories: 180, meal: "snack" });
  });
});
