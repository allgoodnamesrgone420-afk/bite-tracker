/**
 * Saved meals (a group of items you log together, e.g. "usual breakfast") and
 * recipes (ingredients cooked into N servings). A recipe also becomes one of
 * your calibrated foods, so typing "1 serving rajma" uses your recipe.
 */
import { foodKey, nutrientsOf, type PersonalFood } from "./calibration";
import type { N5 } from "./food-db";
import { MICRO_KEYS, sumMicros, toM5, type M5 } from "./micros";
import type { ParsedItem } from "./schemas";
import { sumItems } from "./totals";

export type SavedMeal = { id: string; name: string; items: ParsedItem[]; createdAt: number; uses: number };

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  ingredients: ParsedItem[];
  /** The text you typed, so you can edit it later. */
  text: string;
  createdAt: number;
  updatedAt: number;
};

export const MAX_MEALS = 60;
export const MAX_RECIPES = 100;

/** Nutrients for one serving. Micros only when every ingredient has them. */
export function perServing(r: Pick<Recipe, "servings" | "ingredients">): { n: N5; m?: M5 } {
  const s = Math.max(r.servings, 0.1);
  const t = sumItems(r.ingredients);
  const n = nutrientsOf(t).map((v, i) => (i === 0 ? Math.round(v / s) : Math.round((v / s) * 10) / 10)) as N5;
  const mt = sumMicros(r.ingredients);
  const m = mt.covered === r.ingredients.length && mt.covered > 0 ? (toM5(mt.total).map((v, i) => (MICRO_KEYS[i].endsWith("_mg") ? Math.round(v / s) : Math.round((v / s) * 10) / 10)) as M5) : undefined;
  return { n, m };
}

/** The calibrated food entry a recipe provides (per serving). */
export function recipeFood(r: Recipe, prev?: PersonalFood): PersonalFood {
  const { n, m } = perServing(r);
  return {
    key: foodKey(r.name),
    name: r.name,
    unit: "serving",
    per: n,
    pm: m,
    verified: true,
    lastQty: prev?.unit === "serving" ? prev.lastQty : 1,
    uses: prev?.uses ?? 0,
    updatedAt: r.updatedAt,
  };
}
