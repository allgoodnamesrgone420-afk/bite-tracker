/**
 * Offline fallback for "correct this". Handles quantity fixes ("it was 3",
 * "only half") and restating the same food ("2 scoops whey"). Anything that
 * changes what's in a dish ("1 tbsp oil, not 3") needs the AI, so this
 * returns null rather than guess.
 */
import { foodKey } from "./calibration";
import { FOODS, type Food } from "./food-db";
import { localParse } from "./local-parser";
import { scaleMicros } from "./micros";
import type { ParsedItem } from "./schemas";

const ALIASES = [...new Set(FOODS.flatMap((f) => f.aliases))].sort((a, b) => b.length - a.length);

function mentionsFood(t: string, item: ParsedItem): boolean {
  const own = foodKey(item.name);
  return ALIASES.some((a) => !own.includes(a) && new RegExp(`\\b${a}(s|es)?\\b`).test(t));
}

const WORD_QTY: Record<string, number> = { half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ek: 1, do: 2, teen: 3, aadha: 0.5, dedh: 1.5 };

export function localCorrection(item: ParsedItem, text: string, personal: { verified?: Food[]; learned?: Food[] } = {}): ParsedItem | null {
  const t = text.toLowerCase();
  const parsed = localParse(t, personal);
  const same = (name: string) => {
    const a = foodKey(name);
    const b = foodKey(item.name);
    return a === b || a.includes(b) || b.includes(a);
  };

  if (parsed.items.length === 1 && parsed.unknown.length === 0 && same(parsed.items[0].name)) {
    return { ...parsed.items[0], name: item.name, meal: item.meal, notes: `Corrected: ${text}`.slice(0, 200) };
  }
  // Mentions a different food or ingredient ("oil", "paratha"): that's a recipe change, needs the AI.
  if (parsed.items.length > 0 || mentionsFood(t, item)) return null;

  // Bare quantity: "it was 3", "only 1.5", "half", "3 not 2" (first number wins).
  const num = t.match(/\d+(?:\.\d+)?/);
  const word = Object.keys(WORD_QTY).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  const q = num ? Number(num[0]) : word ? WORD_QTY[word] : null;
  if (!q || q <= 0 || item.quantity <= 0) return null;
  const k = q / item.quantity;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return {
    ...item,
    quantity: q,
    calories: Math.round(item.calories * k),
    protein_g: r(item.protein_g),
    carbs_g: r(item.carbs_g),
    fat_g: r(item.fat_g),
    fibre_g: r(item.fibre_g),
    micros: scaleMicros(item.micros, k),
    notes: `Corrected: ${text}`.slice(0, 200),
  };
}
