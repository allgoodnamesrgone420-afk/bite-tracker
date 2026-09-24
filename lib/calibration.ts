/**
 * Personal food calibration: every food you log is remembered per unit, and
 * anything you correct by hand becomes "verified" and wins over the built-in
 * library and AI estimates from then on.
 */
import { FOODS, type Food, type N5 } from "./food-db";
import type { ParsedItem } from "./schemas";
import { normalizeUnit, unitToGrams } from "./units";

export type PersonalFood = {
  key: string;
  name: string;
  unit: string;
  /** Nutrients per ONE unit. */
  per: N5;
  /** True once you've edited the numbers yourself. */
  verified: boolean;
  /** Your usual portion (in `unit`), for one-tap quick-add. */
  lastQty?: number;
  uses: number;
  updatedAt: number;
};

export type Origin = { quantity: number; n: N5 };

const MAX_FOODS = 500;

export function foodKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const nutrientsOf = (i: Pick<ParsedItem, "calories" | "protein_g" | "carbs_g" | "fat_g" | "fibre_g">): N5 => [
  i.calories,
  i.protein_g,
  i.carbs_g,
  i.fat_g,
  i.fibre_g,
];

/** Convert a quantity between units; null when there's no sensible conversion. */
export function convertQty(qty: number, from: string, to: string): number | null {
  const f = normalizeUnit(from);
  const t = normalizeUnit(to);
  if (f === t) return qty;
  const gf = unitToGrams(f);
  const gt = unitToGrams(t);
  return gf !== null && gt !== null ? (qty * gf) / gt : null;
}

/** True if the user changed nutrient values (quantity-proportional scaling doesn't count). */
export function wasEdited(item: ParsedItem, origin?: Origin): boolean {
  if (!origin || origin.quantity <= 0) return true;
  const k = item.quantity / origin.quantity;
  const now = nutrientsOf(item);
  return now.some((v, i) => Math.abs(v - origin.n[i] * k) > (i === 0 ? 2 : 0.6));
}

/** Update the personal library from items being committed to the log. */
export function learnFoods(
  foods: Record<string, PersonalFood>,
  rows: Array<ParsedItem & { origin?: Origin; source: "llm" | "manual" }>,
): Record<string, PersonalFood> {
  const next = { ...foods };
  const now = Date.now();
  for (const r of rows) {
    const key = foodKey(r.name);
    if (!key || r.quantity <= 0 || r.calories <= 0) continue;
    const edited = wasEdited(r, r.origin);
    const prev = next[key];
    const per = nutrientsOf(r).map((v) => Math.round((v / r.quantity) * 100) / 100) as N5;
    // Never overwrite values you verified with unedited AI/library values.
    const keepPrev = prev?.verified && !edited;
    const unit = keepPrev ? prev.unit : normalizeUnit(r.unit) || "serving";
    const qtyInUnit = convertQty(r.quantity, r.unit, unit);
    next[key] = {
      key,
      name: prev && keepPrev ? prev.name : r.name.trim(),
      unit,
      per: keepPrev ? prev.per : per,
      lastQty: qtyInUnit !== null ? Math.round(qtyInUnit * 100) / 100 : prev?.lastQty,
      verified: edited || !!prev?.verified,
      uses: (prev?.uses ?? 0) + 1,
      updatedAt: now,
    };
  }
  const keys = Object.keys(next);
  if (keys.length > MAX_FOODS) {
    keys
      .sort((a, b) => Number(next[a].verified) - Number(next[b].verified) || next[a].updatedAt - next[b].updatedAt)
      .slice(0, keys.length - MAX_FOODS)
      .forEach((k) => delete next[k]);
  }
  return next;
}

/** Replace AI/library estimates with your verified values where the unit converts. */
export function applyCalibration(items: ParsedItem[], foods: Record<string, PersonalFood>): ParsedItem[] {
  return items.map((item) => {
    const p = foods[foodKey(item.name)];
    if (!p?.verified) return item;
    const units = convertQty(item.quantity, item.unit, p.unit);
    if (units === null) return item;
    const r = (v: number) => Math.round(v * units * 10) / 10;
    return {
      ...item,
      calories: Math.round(p.per[0] * units),
      protein_g: r(p.per[1]),
      carbs_g: r(p.per[2]),
      fat_g: r(p.per[3]),
      fibre_g: r(p.per[4]),
      confidence: "high",
      notes: "Your saved values",
    };
  });
}

/** Personal foods as parser entries. Verified ones outrank the built-in library. */
export function personalAsFoods(foods: Record<string, PersonalFood>): { verified: Food[]; learned: Food[] } {
  const toFood = (p: PersonalFood): Food => {
    // A calibrated library food keeps its aliases ("whey", "protein powder"...) and unit conversions.
    const builtin = FOODS.find((f) => foodKey(f.name) === p.key);
    if (builtin && builtin.unit === p.unit) return { ...builtin, name: p.name, n: p.per, def: undefined, vague: false };
    return { name: p.name, aliases: [p.key, ...(builtin?.aliases ?? [])], unit: p.unit, grams: unitToGrams(p.unit) ?? 0, n: p.per };
  };
  const all = Object.values(foods);
  return { verified: all.filter((p) => p.verified).map(toFood), learned: all.filter((p) => !p.verified).map(toFood) };
}

/** A ready-to-confirm item from one of your foods at your usual portion. */
export function itemFromPersonal(p: PersonalFood, meal: ParsedItem["meal"]): ParsedItem {
  const q = p.lastQty && p.lastQty > 0 ? p.lastQty : 1;
  const r = (v: number) => Math.round(v * q * 10) / 10;
  return {
    name: p.name,
    quantity: q,
    unit: p.unit,
    meal,
    calories: Math.round(p.per[0] * q),
    protein_g: r(p.per[1]),
    carbs_g: r(p.per[2]),
    fat_g: r(p.per[3]),
    fibre_g: r(p.per[4]),
    confidence: p.verified ? "high" : "medium",
    assumed: false,
    notes: p.verified ? "Your saved values" : "Your usual portion",
  };
}

/** Most-logged foods for quick-add chips. */
export function topFoods(foods: Record<string, PersonalFood>, n = 8): PersonalFood[] {
  return Object.values(foods)
    .filter((f) => f.per[0] > 0)
    .sort((a, b) => b.uses - a.uses || b.updatedAt - a.updatedAt)
    .slice(0, n);
}
