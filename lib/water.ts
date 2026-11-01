/**
 * Water: glasses per day against a target from body weight. Stored as
 * `water` records keyed by date, so it syncs like weigh-ins.
 */

export const GLASS_ML = 250;

export type WaterDay = { ml: number; at: number };
export type WaterLog = Record<string, WaterDay>;

/** About 35 ml per kg, in whole glasses, between 2 and 4 litres. Food adds the rest. */
export function waterTarget(weightKg?: number): number {
  if (!weightKg) return 2500;
  const glasses = Math.round((weightKg * 35) / GLASS_ML);
  return Math.min(4000, Math.max(2000, glasses * GLASS_ML));
}

/** Add (or with a negative delta, remove) water for a day, never below zero or above 10 litres. */
export function addWater(log: WaterLog, date: string, deltaMl: number, now = Date.now()): WaterLog {
  const ml = Math.min(10_000, Math.max(0, (log[date]?.ml ?? 0) + deltaMl));
  return { ...log, [date]: { ml, at: now } };
}

/** 250 → "0.25 L", 1500 → "1.5 L". */
export const fmtLitres = (ml: number) => `${Math.round(ml / 10) / 100} L`;
