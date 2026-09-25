import { MEALS, type LogItem, type Meal } from "./schemas";
import type { Targets } from "./targets";

export type Nutrients = Targets; // same five fields

export const ZERO: Nutrients = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Totals are always summed here, never taken from the LLM. */
export function sumItems(items: Pick<LogItem, keyof Nutrients>[]): Nutrients {
  const t = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein_g: acc.protein_g + i.protein_g,
      carbs_g: acc.carbs_g + i.carbs_g,
      fat_g: acc.fat_g + i.fat_g,
      fibre_g: acc.fibre_g + i.fibre_g,
    }),
    ZERO,
  );
  return {
    calories: Math.round(t.calories),
    protein_g: round1(t.protein_g),
    carbs_g: round1(t.carbs_g),
    fat_g: round1(t.fat_g),
    fibre_g: round1(t.fibre_g),
  };
}

export function byMeal(items: LogItem[]): Record<Meal, { items: LogItem[]; totals: Nutrients }> {
  return Object.fromEntries(
    MEALS.map((m) => {
      const mealItems = items.filter((i) => i.meal === m);
      return [m, { items: mealItems, totals: sumItems(mealItems) }];
    }),
  ) as Record<Meal, { items: LogItem[]; totals: Nutrients }>;
}

/** Positive = left to eat, negative = over. */
export function remaining(targets: Targets, consumed: Nutrients): Nutrients {
  return {
    calories: targets.calories - consumed.calories,
    protein_g: round1(targets.protein_g - consumed.protein_g),
    carbs_g: round1(targets.carbs_g - consumed.carbs_g),
    fat_g: round1(targets.fat_g - consumed.fat_g),
    fibre_g: round1(targets.fibre_g - consumed.fibre_g),
  };
}

/** Share of calories from each macro (0-1), for the segmented bar. */
export function macroSplit(t: Nutrients): { protein: number; carbs: number; fat: number } {
  const p = t.protein_g * 4;
  const c = t.carbs_g * 4;
  const f = t.fat_g * 9;
  const total = p + c + f;
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: p / total, carbs: c / total, fat: f / total };
}

/* ----------------------------- dates -------------------------------- */

/** Local calendar date key, YYYY-MM-DD (not UTC). */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + delta));
}

/**
 * Consecutive days with at least one item, ending today. If today has nothing
 * yet, the streak is still alive and counts back from yesterday.
 */
export function streak(loggedDates: Iterable<string>, today: string): number {
  const set = new Set(loggedDates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function mealForTime(d: Date = new Date()): Meal {
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins >= 5 * 60 && mins < 11 * 60) return "breakfast";
  if (mins >= 11 * 60 && mins < 15 * 60 + 30) return "lunch";
  if (mins >= 15 * 60 + 30 && mins < 19 * 60) return "snack";
  return "dinner";
}

/** Monday of the week containing `key` (weeks run Monday to Sunday). */
export function weekStart(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return dateKey(new Date(y, m - 1, d - dow));
}

export type StreakInfo = { days: number; frozen: string[] };

/**
 * Consecutive good days ending today (or yesterday while today is still in
 * progress), with a streak freeze: one missed day per Monday-Sunday week is
 * forgiven, as long as the streak carries on the other side of it. Frozen
 * days don't add to the count.
 */
export function streakWithFreeze(ok: (date: string) => boolean, today: string, maxDays = 3650): StreakInfo {
  let cursor = ok(today) ? today : addDays(today, -1);
  let days = 0;
  const frozen: string[] = [];
  const usedWeeks = new Set<string>();
  for (let i = 0; i < maxDays; i++) {
    if (ok(cursor)) {
      days++;
      cursor = addDays(cursor, -1);
      continue;
    }
    const week = weekStart(cursor);
    const before = addDays(cursor, -1);
    if (usedWeeks.has(week) || !ok(before)) break;
    usedWeeks.add(week);
    frozen.push(cursor);
    cursor = before;
  }
  return { days, frozen };
}
