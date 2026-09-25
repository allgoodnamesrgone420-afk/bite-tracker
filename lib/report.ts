/**
 * Weekly report card (Monday to Sunday), computed on the device from your
 * logs and weigh-ins. Pure and unit-tested.
 */
import { foodKey } from "./calibration";
import { computeInsights, type Insight } from "./insights";
import { microTargets } from "./micros";
import { classifyDay, rangeStats, type DayRow, type DayStatus, type RangeStats } from "./progress";
import type { DayLog, Profile } from "./schemas";
import type { Targets } from "./targets";
import { addDays, weekStart } from "./totals";
import { trendSeries, type Weights } from "./weight";

export type WeekDay = { date: string; status: DayStatus | null; calories: number; count: number };

export type WeekReport = {
  start: string;
  end: string;
  /** The week isn't over yet (it's the current week). */
  partial: boolean;
  stats: RangeStats;
  targetCalories: number;
  days: WeekDay[];
  weight: { start: number; end: number; change: number } | null;
  sodium: { over: number; tracked: number; limit: number };
  topFoods: { name: string; kcal: number; n: number }[];
  focus: Insight | null;
  wins: Insight[];
  vsPrev: { avgCalories: number; avgProtein: number; hit: number } | null;
};

/** Which week to show by default: this week on Sunday, otherwise last week. */
export function defaultReportWeek(today: string): string {
  const monday = weekStart(today);
  return today === addDays(monday, 6) ? monday : addDays(monday, -7);
}

export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export function buildWeekReport(input: {
  start: string;
  today: string;
  rows: Record<string, DayRow>;
  /** Full logs for the week (for foods and patterns). */
  logs: DayLog[];
  weights: Weights;
  fallback: Targets;
  profile: Profile | null;
}): WeekReport {
  const { start, today, rows, logs, weights, fallback, profile } = input;
  const dates = weekDates(start);
  const end = dates[6];
  const stats = rangeStats(rows, dates, fallback);
  const logged = dates.map((d) => rows[d]).filter((r): r is DayRow => !!r?.count);
  const targetCalories = logged.length ? Math.round(logged.reduce((s, r) => s + (r.target ?? fallback).calories, 0) / logged.length) : fallback.calories;

  const days: WeekDay[] = dates.map((d) => {
    const r = rows[d];
    return { date: d, status: r?.count ? classifyDay(r, r.target ?? fallback).status : null, calories: r?.calories ?? 0, count: r?.count ?? 0 };
  });

  // Weight: trend the day before the week vs the last day of it.
  let weight: WeekReport["weight"] = null;
  const series = trendSeries(weights, end < today ? end : today);
  const at = (d: string) => series.find((p) => p.date === d)?.trend;
  const inWeek = dates.filter((d) => d <= today && weights[d]).length;
  const w0 = at(addDays(start, -1)) ?? series.find((p) => p.date >= start)?.trend;
  const w1 = at(end < today ? end : today);
  if (inWeek > 0 && w0 !== undefined && w1 !== undefined) weight = { start: w0, end: w1, change: Math.round((w1 - w0) * 100) / 100 };

  const limit = microTargets(fallback.calories, profile?.sex).sodium_mg;
  const tracked = logged.filter((r) => r.micros && r.microCovered === r.count);
  const sodium = { over: tracked.filter((r) => r.micros!.sodium_mg > limit).length, tracked: tracked.length, limit };

  const foods = new Map<string, { name: string; kcal: number; n: number }>();
  for (const d of logs) {
    if (d.date < start || d.date > end) continue;
    for (const i of d.items) {
      const k = foodKey(i.name);
      const f = foods.get(k) ?? { name: i.name, kcal: 0, n: 0 };
      f.kcal += i.calories;
      f.n++;
      foods.set(k, f);
    }
  }
  const topFoods = [...foods.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 3).map((f) => ({ ...f, kcal: Math.round(f.kcal) }));

  // Patterns over this week only, treating every day in it as finished.
  const weekLogs = logs.filter((d) => d.date >= start && d.date <= end && d.date < today);
  const insights = computeInsights({ today: addDays(end, 1), days: weekLogs, targets: fallback, profile, now: new Date(`${end}T22:00`) }).filter((i) => i.id !== "warmup");
  const focus = insights.find((i) => i.tone === "warn") ?? insights.find((i) => i.tone === "tip") ?? null;
  const wins = insights.filter((i) => i.tone === "good").slice(0, 2);

  const prev = rangeStats(rows, weekDates(addDays(start, -7)), fallback);
  const vsPrev = prev.logged && stats.logged ? { avgCalories: stats.avgCalories - prev.avgCalories, avgProtein: stats.avgProtein - prev.avgProtein, hit: stats.hit - prev.hit } : null;

  return { start, end, partial: end >= today, stats, targetCalories, days, weight, sodium, topFoods, focus, wins, vsPrev };
}

/** Plain-text version for sharing. */
export function reportText(r: WeekReport): string {
  const range = `${fmtDay(r.start)} to ${fmtDay(r.end)}`;
  const lines = [
    `Bite · week of ${range}`,
    `On target ${r.stats.hit}/${r.stats.logged} logged days (over ${r.stats.over}, under ${r.stats.under + r.stats.low})`,
    `Avg ${r.stats.avgCalories.toLocaleString("en-IN")} kcal vs ${r.targetCalories.toLocaleString("en-IN")} target · protein ${r.stats.avgProtein} g/day, hit on ${r.stats.proteinHit} days`,
  ];
  if (r.weight) lines.push(`Weight trend ${r.weight.change >= 0.05 ? "+" : ""}${(Math.abs(r.weight.change) < 0.05 ? 0 : r.weight.change).toFixed(1)} kg (${r.weight.end.toFixed(1)} kg)`);
  if (r.focus) lines.push(`Next week: ${r.focus.title}`);
  return lines.join("\n");
}

const fmtDay = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
