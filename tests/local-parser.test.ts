import { describe, expect, it } from "vitest";
import { localParse } from "@/lib/local-parser";

const at = (h: number) => {
  const d = new Date(2026, 8, 23, h, 0);
  return { now: d };
};

describe("localParse", () => {
  it("knows whey by the scoop", () => {
    const r = localParse("2 scoop whey", at(8));
    expect(r.complete).toBe(true);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Whey protein", quantity: 2, unit: "scoop", calories: 240, protein_g: 48, assumed: false, confidence: "high" });
  });

  it("handles quantity after the food and glued units", () => {
    const r = localParse("whey 1.5 scoops, paneer 150g", at(18));
    expect(r.items.map((i) => [i.name, i.quantity, i.unit, i.calories])).toEqual([
      ["Whey protein", 1.5, "scoop", 180],
      ["Paneer", 150, "g", 398],
    ]);
  });

  it("parses the brief's multi-item lunch", () => {
    const r = localParse("2 rotis, a bowl of dal and a small bowl of curd at lunch", at(20));
    expect(r.complete).toBe(true);
    expect(r.items.map((i) => [i.name, i.quantity, i.unit, i.meal])).toEqual([
      ["Roti", 2, "piece", "lunch"],
      ["Dal", 1, "bowl", "lunch"],
      ["Curd", 1, "katori", "lunch"],
    ]);
    expect(r.items[1].calories).toBe(292); // 250 ml bowl of a 150 g katori food
  });

  it("understands Hinglish", () => {
    const r = localParse("aaj lunch mein 3 roti, sabzi aur chaas", at(9));
    expect(r.items.map((i) => [i.name, i.quantity, i.meal])).toEqual([
      ["Roti", 3, "lunch"],
      ["Mixed sabzi", 1, "lunch"],
      ["Chaas", 1, "lunch"],
    ]);
    expect(r.items[1].assumed).toBe(true);
  });

  it("handles fractions and Hindi number words", () => {
    const r = localParse("dedh glass milk and ½ plate poha", at(8));
    expect(r.items[0]).toMatchObject({ name: "Milk (toned)", quantity: 1.5, calories: 225 });
    expect(r.items[1]).toMatchObject({ name: "Poha", quantity: 0.5, calories: 135 });
  });

  it("treats 'with X' as a small add-on and ignores negations", () => {
    const r = localParse("2 roti with ghee, chai no sugar", at(13));
    expect(r.items.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ["Roti", 2, "piece"],
      ["Ghee", 1, "tsp"],
      ["Chai (milk + sugar)", 1, "cup"],
    ]);
  });

  it("splits meals and reads times", () => {
    const r = localParse("poha for breakfast, 2 boiled eggs at 5pm and dal chawal for dinner", at(22));
    expect(r.items.map((i) => [i.name, i.meal])).toEqual([
      ["Poha", "breakfast"],
      ["Egg", "snack"],
      ["Dal", "dinner"],
      ["Cooked rice", "dinner"],
    ]);
    expect(r.items[1].quantity).toBe(2); // "5pm" is a time, not a quantity
  });

  it("flags vague input as incomplete but still estimates", () => {
    const r = localParse("had some rice", at(13));
    expect(r.complete).toBe(false);
    expect(r.items[0]).toMatchObject({ name: "Cooked rice", assumed: true, confidence: "low" });
  });

  it("refuses to guess unknown dishes", () => {
    const r = localParse("2 plates shakshuka and 1 banana", at(13));
    expect(r.unknown).toEqual(["2 plates shakshuka"]);
    expect(r.items.map((i) => i.name)).toEqual(["Banana"]);
    expect(r.complete).toBe(false);
  });

  it("returns nothing for non-food", () => {
    const r = localParse("remind me to call mom", at(13));
    expect(r.items).toEqual([]);
    expect(r.complete).toBe(false);
  });

  it("prefers verified personal foods over the library", () => {
    const myWhey = { name: "Whey protein", aliases: ["whey"], unit: "scoop", grams: 0, n: [130, 25, 4, 2, 1] as [number, number, number, number, number] };
    const r = localParse("2 scoops whey", { ...at(8), verified: [myWhey] });
    expect(r.items[0]).toMatchObject({ calories: 260, protein_g: 50, notes: "Your saved values" });
  });
});

describe("calibration", async () => {
  const { learnFoods, personalAsFoods, applyCalibration } = await import("@/lib/calibration");

  it("remembers edited values and applies them to the short alias", () => {
    const edited = { name: "Whey protein", quantity: 1, unit: "scoop", meal: "breakfast" as const, calories: 130, protein_g: 25, carbs_g: 4, fat_g: 2, fibre_g: 1, confidence: "high" as const, assumed: false, notes: "", source: "llm" as const, origin: { quantity: 1, n: [120, 24, 3, 1.5, 0] as [number, number, number, number, number] } };
    const foods = learnFoods({}, [edited]);
    expect(foods["whey protein"].verified).toBe(true);
    const r = localParse("2 scoop whey", personalAsFoods(foods));
    expect(r.items[0]).toMatchObject({ calories: 260, protein_g: 50, notes: "Your saved values" });
  });

  it("does not mark proportional quantity scaling as an edit", () => {
    const scaled = { name: "Egg", quantity: 3, unit: "piece", meal: "breakfast" as const, calories: 216, protein_g: 18.9, carbs_g: 1.2, fat_g: 14.4, fibre_g: 0, confidence: "high" as const, assumed: false, notes: "", source: "llm" as const, origin: { quantity: 2, n: [144, 12.6, 0.8, 9.6, 0] as [number, number, number, number, number] } };
    expect(learnFoods({}, [scaled]).egg.verified).toBe(false);
  });

  it("applies verified values to AI results with unit conversion", () => {
    const foods = learnFoods({}, [{ name: "Dal", quantity: 1, unit: "katori", meal: "lunch" as const, calories: 200, protein_g: 10, carbs_g: 25, fat_g: 6, fibre_g: 5, confidence: "high" as const, assumed: false, notes: "", source: "manual" as const }]);
    const [item] = applyCalibration([{ name: "Dal", quantity: 1, unit: "bowl", meal: "lunch", calories: 290, protein_g: 14, carbs_g: 38, fat_g: 9, fibre_g: 8, confidence: "medium", assumed: false, notes: "" }], foods);
    expect(item.calories).toBe(333); // 250 ml bowl / 150 ml katori × 200
    expect(item.notes).toBe("Your saved values");
  });
});
