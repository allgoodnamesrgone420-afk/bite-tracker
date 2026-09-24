/**
 * Weigh-ins, the smoothed trend, and maintenance calories estimated from your
 * own data: over the last few weeks, (average intake) minus (energy stored or
 * lost, from the weight trend) is what you actually burn. Pure and unit-tested.
 */
import { classifyDay, type DayRow } from "./progress";
import { KCAL_PER_KG, type Targets } from "./targets";
import { addDays } from "./totals";

export type WeighIn = { kg: number; at: number };
export type Weights = Record<string, WeighIn>;

/** Smoothing for the trend line (like a ~10-day moving average, but it never jumps). */
export const TREND_ALPHA = 0.1;
/** Weigh-ins older than this don't drive targets. */
export const WEIGHT_STALE_DAYS = 45;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type TrendPoint = { date: string; kg: number | null; trend: number };

/** One point per day from the first weigh-in to `until`: the raw weight on weigh-in days, the trend every day. */
export function trendSeries(weights: Weights, until: string): TrendPoint[] {
  const dates = Object.keys(weights)
    .filter((d) => d <= until)
    .sort();
  if (!dates.length) return [];
  const out: TrendPoint[] = [];
  let trend = weights[dates[0]].kg;
  for (let d = dates[0]; d <= until; d = addDays(d, 1)) {
    const kg = weights[d]?.kg ?? null;
    if (kg !== null) trend += TREND_ALPHA * (kg - trend);
    out.push({ date: d, kg, trend: round2(trend) });
  }
  return out;
}

/** Latest trend weight, if you've weighed in recently enough for it to count. */
export function currentWeight(weights: Weights, today: string): { trend: number; last: string; lastKg: number } | null {
  const dates = Object.keys(weights)
    .filter((d) => d <= today)
    .sort();
  const last = dates.at(-1);
  if (!last || last < addDays(today, -WEIGHT_STALE_DAYS)) return null;
  const series = trendSeries(weights, last);
  return { trend: series.at(-1)!.trend, last, lastKg: weights[last].kg };
}

/** Least-squares slope (y per x); null with fewer than 2 distinct x values. */
export function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

const dayIndex = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** Weekly rate of change (kg/week) from weigh-ins in the last `days` days. */
export function weeklyRate(weights: Weights, today: string, days = 28): number | null {
  const from = addDays(today, -days);
  const pts = Object.entries(weights)
    .filter(([d]) => d >= from && d <= today)
    .map(([d, w]) => ({ x: dayIndex(d), y: w.kg }));
  const span = pts.length ? Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) : 0;
  if (pts.length < 3 || span < 7) return null;
  const s = slope(pts);
  return s === null ? null : round2(s * 7);
}

export type TdeeEstimate =
  | {
      ok: true;
      /** What targets use: the data estimate, blended with the formula while confidence is low. */
      tdee: number;
      /** The pure data estimate (after the ±25% sanity clamp). */
      fromData: number;
      intake: number;
      kgPerWeek: number;
      days: number;
      weighIns: number;
      confidence: "low" | "medium" | "high";
      clamped: boolean;
    }
  | { ok: false; days: number; weighIns: number; need: string };

export const TDEE_WINDOW = 28;
const MIN_DAYS = 10;
const MIN_WEIGH_INS = 4;
const MIN_SPAN = 10;

/**
 * Maintenance from your data over the last 4 weeks (today excluded, it's not
 * finished). Days that look incomplete (under half your target) are skipped
 * because they'd make your maintenance look lower than it is.
 */
export function estimateTdee(input: { rows: Record<string, DayRow>; weights: Weights; today: string; fallback: Targets; formulaTdee: number }): TdeeEstimate {
  const { rows, weights, today, fallback, formulaTdee } = input;
  const start = addDays(today, -TDEE_WINDOW);
  const end = addDays(today, -1);

  const intakes: number[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const r = rows[d];
    if (r?.count && classifyDay(r, r.target ?? fallback).status !== "low") intakes.push(r.calories);
  }
  const pts = Object.entries(weights)
    .filter(([d]) => d >= start && d <= today)
    .map(([d, w]) => ({ x: dayIndex(d), y: w.kg }));
  const span = pts.length ? Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) : 0;

  const days = intakes.length;
  const weighIns = pts.length;
  const needs: string[] = [];
  if (days < MIN_DAYS) needs.push(`${MIN_DAYS - days} more fully logged day${MIN_DAYS - days === 1 ? "" : "s"}`);
  if (weighIns < MIN_WEIGH_INS) needs.push(`${MIN_WEIGH_INS - weighIns} more weigh-in${MIN_WEIGH_INS - weighIns === 1 ? "" : "s"}`);
  else if (span < MIN_SPAN) needs.push(`weigh-ins spread over at least ${MIN_SPAN} days`);
  const s = slope(pts);
  if (needs.length || s === null) return { ok: false, days, weighIns, need: needs.join(" and ") || "a few more weigh-ins" };

  const intake = intakes.reduce((a, b) => a + b, 0) / days;
  const raw = intake - s * KCAL_PER_KG;
  const lo = formulaTdee * 0.75;
  const hi = formulaTdee * 1.25;
  const fromData = Math.min(hi, Math.max(lo, raw));
  const confidence = days >= 21 && weighIns >= 10 ? "high" : days >= 14 && weighIns >= 6 ? "medium" : "low";
  const w = confidence === "high" ? 1 : confidence === "medium" ? 0.75 : 0.5;
  return {
    ok: true,
    tdee: Math.round((w * fromData + (1 - w) * formulaTdee) / 10) * 10,
    fromData: Math.round(fromData / 10) * 10,
    intake: Math.round(intake),
    kgPerWeek: round2(s * 7),
    days,
    weighIns,
    confidence,
    clamped: raw !== fromData,
  };
}
