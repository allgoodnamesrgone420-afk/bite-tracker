/**
 * Micronutrients: sodium, sugar, saturated fat, calcium, iron. Tracked
 * alongside macros but kept secondary. Old items may not have them, so every
 * total also reports how many items it covers.
 */
import type { Micros, Profile } from "./schemas";

/** Per-unit micros in the food library: [sodium mg, sugar g, sat fat g, calcium mg, iron mg]. */
export type M5 = [sodium: number, sugar: number, satfat: number, calcium: number, iron: number];

export const MICRO_KEYS = ["sodium_mg", "sugar_g", "satfat_g", "calcium_mg", "iron_mg"] as const;
export type MicroKey = (typeof MICRO_KEYS)[number];

export const MICRO_META: Record<MicroKey, { label: string; unit: "mg" | "g"; kind: "limit" | "min"; note: string }> = {
  sodium_mg: { label: "Sodium", unit: "mg", kind: "limit", note: "Under 2,000 mg (5 g salt) a day, per WHO and ICMR." },
  sugar_g: { label: "Sugar", unit: "g", kind: "limit", note: "Soft cap at 10% of calories. Includes natural sugar from milk and fruit." },
  satfat_g: { label: "Sat. fat", unit: "g", kind: "limit", note: "Under 10% of calories." },
  calcium_mg: { label: "Calcium", unit: "mg", kind: "min", note: "About 1,000 mg a day for adults (ICMR-NIN 2020)." },
  iron_mg: { label: "Iron", unit: "mg", kind: "min", note: "ICMR-NIN 2020 RDA: 19 mg (men), 29 mg (women)." },
};

export const ZERO_MICROS: Micros = { sodium_mg: 0, sugar_g: 0, satfat_g: 0, calcium_mg: 0, iron_mg: 0 };

export const fromM5 = (m: M5): Micros => ({ sodium_mg: m[0], sugar_g: m[1], satfat_g: m[2], calcium_mg: m[3], iron_mg: m[4] });
export const toM5 = (m: Micros): M5 => [m.sodium_mg, m.sugar_g, m.satfat_g, m.calcium_mg, m.iron_mg];

const r = (key: MicroKey, v: number) => (key === "sodium_mg" || key === "calcium_mg" ? Math.round(v) : Math.round(v * 10) / 10);

/** Micros for `k` units, from per-unit values. */
export function microsFor(perUnit: M5 | undefined, k: number): Micros | undefined {
  if (!perUnit) return undefined;
  const m = fromM5(perUnit);
  return Object.fromEntries(MICRO_KEYS.map((key) => [key, r(key, m[key] * k)])) as Micros;
}

/** Scale an item's micros when its quantity changes. */
export function scaleMicros(m: Micros | undefined, k: number): Micros | undefined {
  if (!m) return undefined;
  return Object.fromEntries(MICRO_KEYS.map((key) => [key, r(key, m[key] * k)])) as Micros;
}

/** Per-unit micros from an item's totals. */
export function perUnitMicros(m: Micros | undefined, quantity: number): M5 | undefined {
  if (!m || quantity <= 0) return undefined;
  return toM5(m).map((v) => Math.round((v / quantity) * 1000) / 1000) as M5;
}

export type MicroTotals = { total: Micros; covered: number; count: number };

export function sumMicros(items: { micros?: Micros }[]): MicroTotals {
  const total = { ...ZERO_MICROS };
  let covered = 0;
  for (const i of items) {
    if (!i.micros) continue;
    covered++;
    for (const k of MICRO_KEYS) total[k] += i.micros[k];
  }
  for (const k of MICRO_KEYS) total[k] = r(k, total[k]);
  return { total, covered, count: items.length };
}

/** Daily limits (sodium, sugar, sat fat) and minimums (calcium, iron). */
export function microTargets(calories: number, sex: Profile["sex"] | undefined): Micros {
  return {
    sodium_mg: 2000,
    sugar_g: Math.round((calories * 0.1) / 4),
    satfat_g: Math.round((calories * 0.1) / 9),
    calcium_mg: 1000,
    iron_mg: sex === "male" ? 19 : 29,
  };
}

export type MicroStatus = "ok" | "high" | "low";

export function microStatus(key: MicroKey, value: number, target: number): MicroStatus {
  const meta = MICRO_META[key];
  if (meta.kind === "limit") return value > target ? "high" : "ok";
  return value < target * 0.7 ? "low" : "ok";
}
