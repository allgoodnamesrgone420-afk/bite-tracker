/** Pure progress-tracking logic: day status vs targets, macro flags, calendar and streaks. */
import type { Targets } from "./targets";
import { addDays, dateKey, type Nutrients } from "./totals";

export type DayStatus = "hit" | "over" | "under" | "low";
export type MacroKey = keyof Nutrients;
export type MacroFlag = { key: MacroKey; label: string; kind: "over" | "short"; delta: number; unit: string };

export const STATUS_META: Record<DayStatus, { label: string; short: string; glyph: string }> = {
  hit: { label: "On target", short: "Hit", glyph: "✓" },
  over: { label: "Over", short: "Over", glyph: "↑" },
  under: { label: "Under", short: "Under", glyph: "↓" },
  low: { label: "Looks incomplete", short: "Partial", glyph: "…" },
};

const LABEL: Record<MacroKey, string> = { calories: "Calories", protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat", fibre_g: "Fibre" };

/** Calorie band: over if > target + max(100, 5%); under if < target − max(150, 10%); very low (<50%) = probably incomplete. */
export function classifyDay(consumed: Nutrients, t: Targets): { status: DayStatus; kcalDelta: number; proteinHit: boolean; flags: MacroFlag[] } {
  const kcalDelta = Math.round(consumed.calories - t.calories);
  let status: DayStatus = "hit";
  if (consumed.calories < t.calories * 0.5) status = "low";
  else if (kcalDelta > Math.max(100, t.calories * 0.05)) status = "over";
  else if (kcalDelta < -Math.max(150, t.calories * 0.1)) status = "under";

  const flags: MacroFlag[] = [];
  if (status === "over") flags.push({ key: "calories", label: LABEL.calories, kind: "over", delta: kcalDelta, unit: "kcal" });
  // Limits: going more than 10% over carbs or fat
  for (const k of ["carbs_g", "fat_g"] as const) {
    const d = consumed[k] - t[k];
    if (d > Math.max(5, t[k] * 0.1)) flags.push({ key: k, label: LABEL[k], kind: "over", delta: Math.round(d), unit: "g" });
  }
  // Minimums: protein and fibre short by more than 10%
  for (const k of ["protein_g", "fibre_g"] as const) {
    const d = consumed[k] - t[k];
    if (d < -t[k] * 0.1) flags.push({ key: k, label: LABEL[k], kind: "short", delta: Math.round(d), unit: "g" });
  }
  return { status, kcalDelta, proteinHit: consumed.protein_g >= t.protein_g * 0.9, flags };
}

/** Month as weeks of date keys (Monday first); null for padding cells. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Mon=0
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type DayRow = Nutrients & { date: string; count: number; target?: Targets };

/** Consecutive on-target days, ending today (or yesterday if today isn't on target yet). */
export function targetStreak(rows: Record<string, DayRow>, today: string, fallback: Targets): number {
  const hit = (d: string) => {
    const r = rows[d];
    return !!r && r.count > 0 && classifyDay(r, r.target ?? fallback).status === "hit";
  };
  let cursor = hit(today) ? today : addDays(today, -1);
  let n = 0;
  while (hit(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export type RangeStats = {
  logged: number;
  hit: number;
  over: number;
  under: number;
  low: number;
  proteinHit: number;
  avgCalories: number;
  avgProtein: number;
  best: { date: string; kcalDelta: number } | null;
  worst: { date: string; kcalDelta: number } | null;
};

/** Stats over the given dates (skips days with nothing logged). */
export function rangeStats(rows: Record<string, DayRow>, dates: string[], fallback: Targets): RangeStats {
  const s: RangeStats = { logged: 0, hit: 0, over: 0, under: 0, low: 0, proteinHit: 0, avgCalories: 0, avgProtein: 0, best: null, worst: null };
  let kcal = 0;
  let protein = 0;
  let bestScore = Infinity;
  let worstScore = -Infinity;
  for (const d of dates) {
    const r = rows[d];
    if (!r || r.count === 0) continue;
    const c = classifyDay(r, r.target ?? fallback);
    s.logged++;
    s[c.status]++;
    if (c.proteinHit) s.proteinHit++;
    kcal += r.calories;
    protein += r.protein_g;
    if (c.status !== "low") {
      // Best = closest to calorie target with protein hit; worst = furthest over.
      const score = Math.abs(c.kcalDelta) + (c.proteinHit ? 0 : 400);
      if (score < bestScore) {
        bestScore = score;
        s.best = { date: d, kcalDelta: c.kcalDelta };
      }
      if (c.kcalDelta > worstScore) {
        worstScore = c.kcalDelta;
        s.worst = { date: d, kcalDelta: c.kcalDelta };
      }
    }
  }
  if (s.logged) {
    s.avgCalories = Math.round(kcal / s.logged);
    s.avgProtein = Math.round(protein / s.logged);
  }
  if (s.worst && s.best && s.worst.date === s.best.date) s.worst = null;
  return s;
}

export const lastNDates = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
