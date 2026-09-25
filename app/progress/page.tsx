"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { BarList, Donut, WeightChart } from "@/components/charts";
import { Icon, PopButton, fmtG, fmtInt, useDesktop } from "@/components/ui";
import { foodKey } from "@/lib/calibration";
import * as db from "@/lib/db";
import { MEAL_STYLE } from "@/lib/meal-style";
import { MICRO_KEYS, MICRO_META, microStatus, microTargets } from "@/lib/micros";
import { STATUS_META, classifyDay, lastNDates, monthGrid, rangeStats, targetStreakInfo, type DayRow, type DayStatus } from "@/lib/progress";
import { MEALS, type DayLog, type Profile } from "@/lib/schemas";
import type { Targets } from "@/lib/targets";
import { addDays, sumItems } from "@/lib/totals";
import { currentWeight, trendSeries, weeklyRate } from "@/lib/weight";

/** Chart fills: theme tokens validated for CVD separation (see globals.css). */
const BAR: Record<DayStatus, string> = { hit: "var(--ok)", over: "var(--over)", under: "var(--under)", low: "var(--ink-3)" };
/** Calendar faces carry black ink, so they use the vivid (dark-theme) steps in both themes. */
const FACE: Record<DayStatus, string> = { hit: "#00a886", over: "#f2542d", under: "#6c7cff", low: "#8a8a8a" };

/** A partly logged today is "in progress", not "incomplete". */
const statusText = (status: DayStatus, isToday: boolean) => (isToday && status !== "over" ? "In progress" : STATUS_META[status].label);

const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00`).toLocaleDateString("en-IN", opts);

export default function ProgressPage() {
  const { ready, summaries, calc, today, profile } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  if (!ready) return <p className="label pulse pt-10">Loading…</p>;
  if (!calc) {
    return (
      <div className="space-y-4">
        <Title />
        <Link href="/settings" className="plunk face-card block p-4">
          <p className="label">Set up</p>
          <p className="mt-1 font-bold">Add your profile first. Progress is measured against your targets →</p>
        </Link>
      </div>
    );
  }
  return <Progress rows={summaries} fallback={calc.targets} today={today} selected={selected ?? today} onSelect={setSelected} sex={profile?.sex} />;
}

function Title() {
  return (
    <header>
      <p className="label">Progress</p>
      <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">How the days are stacking up</h1>
    </header>
  );
}

const RANGES = [14, 30, 90] as const;
type Range = (typeof RANGES)[number];

function Progress({ rows, fallback, today, selected, onSelect, sex }: { rows: Record<string, DayRow>; fallback: Targets; today: string; selected: string; onSelect: (d: string) => void; sex?: Profile["sex"] }) {
  const desktop = useDesktop();
  const [picked, setPicked] = useState<Range | null>(null);
  const range: Range = picked ?? (desktop ? 30 : 14);
  const dates = useMemo(() => lastNDates(today, range), [today, range]);
  const stats = rangeStats(rows, dates, fallback);
  const streak = targetStreakInfo(rows, today, fallback);
  const streakDays = streak.days;
  const frozen = useMemo(() => new Set(streak.frozen), [streak.frozen]);
  const logged = stats.logged;
  const days = useRangeDays(dates, rows);

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3" style={{ ["--i" as string]: 0 }}>
        <Title />
        <Link href="/week" className="pop-btn sm ghost order-last sm:order-none">
          Weekly report card →
        </Link>
        <div className="segmented w-full sm:w-auto" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setPicked(r)} className="px-4">
              {r} days
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-[1.1fr_1fr] gap-3 lg:grid-cols-4 lg:gap-4" style={{ ["--i" as string]: 1 }}>
        <div className="plunk face-lime p-4" style={{ ["--d" as string]: "5px" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">On-target streak</p>
          <p className="hero-num num mt-2 text-[64px]">{streakDays}</p>
          <p className="mt-1 text-xs font-semibold opacity-80">{streakDays === 1 ? "day" : "days"} in a row</p>
          <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold opacity-70">
            <Icon.snow size={12} /> {streak.frozen.length ? `${streak.frozen.length} missed day${streak.frozen.length === 1 ? "" : "s"} forgiven` : "1 miss a week is forgiven"}
          </p>
        </div>
        <div className="grid grid-rows-3 gap-2">
          <MiniStat status="hit" n={stats.hit} of={logged} />
          <MiniStat status="over" n={stats.over} of={logged} />
          <MiniStat status="under" n={stats.under + stats.low} of={logged} />
        </div>
        <div className="card p-3 lg:p-4">
          <p className="label">Avg kcal · {range}d</p>
          <p className="num mt-1 text-2xl font-extrabold lg:text-4xl">{logged ? fmtInt(stats.avgCalories) : "—"}</p>
          <p className="num text-xs text-ink-2">target {fmtInt(fallback.calories)}</p>
        </div>
        <div className="card p-3 lg:p-4">
          <p className="label">Protein hit · {range}d</p>
          <p className="num mt-1 text-2xl font-extrabold lg:text-4xl">
            {stats.proteinHit}
            <span className="text-sm text-ink-3">/{logged}</span>
          </p>
          <p className="num text-xs text-ink-2">avg {logged ? `${stats.avgProtein} g` : "—"} of {fallback.protein_g} g</p>
        </div>
      </section>

      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-6">
          <BarChart rows={rows} dates={dates} fallback={fallback} selected={selected} onSelect={onSelect} />
          {(stats.best || stats.worst) && (
            <section className="grid grid-cols-2 gap-3" style={{ ["--i" as string]: 4 }}>
              {stats.best && (
                <button className="card p-3 text-left" onClick={() => onSelect(stats.best!.date)}>
                  <p className="label flex items-center gap-1 text-ok">
                    <Icon.check size={12} /> Best day
                  </p>
                  <p className="mt-1 font-bold">{fmtDate(stats.best.date, { weekday: "short", day: "numeric", month: "short" })}</p>
                  <p className="num text-xs text-ink-2">{signed(stats.best.kcalDelta)} kcal vs target</p>
                </button>
              )}
              {stats.worst && stats.worst.kcalDelta > 0 && (
                <button className="card p-3 text-left" onClick={() => onSelect(stats.worst!.date)}>
                  <p className="label flex items-center gap-1 text-over">↑ Toughest day</p>
                  <p className="mt-1 font-bold">{fmtDate(stats.worst.date, { weekday: "short", day: "numeric", month: "short" })}</p>
                  <p className="num text-xs text-ink-2">{signed(stats.worst.kcalDelta)} kcal vs target</p>
                </button>
              )}
            </section>
          )}
        </div>
        <WeightCard today={today} />
      </div>

      <div className="space-y-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        <Calendar rows={rows} fallback={fallback} today={today} selected={selected} onSelect={onSelect} frozen={frozen} />
        <DayDetail date={selected} row={rows[selected]} fallback={fallback} today={today} />
        <div className="space-y-6">
          <AvgSplit rows={rows} dates={dates} range={range} />
          <MicrosAvg rows={rows} dates={dates} calories={fallback.calories} sex={sex} range={range} />
        </div>
      </div>

      <TopFoods days={days} range={range} />
    </div>
  );
}

/** Full logs for the range (for top foods), refreshed when any day in it changes. */
function useRangeDays(dates: string[], rows: Record<string, DayRow>): DayLog[] | null {
  const [days, setDays] = useState<DayLog[] | null>(null);
  const sig = dates.map((d) => `${d}:${rows[d]?.count ?? 0}:${Math.round(rows[d]?.calories ?? 0)}`).join("|");
  useEffect(() => {
    let live = true;
    db.getDays(dates).then((d) => live && setDays(d));
    return () => {
      live = false;
    };
    // sig captures every change that matters in `dates` and `rows`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return days;
}

/* ------------------------------ weight ------------------------------ */

function WeightCard({ today }: { today: string }) {
  const { weights, logWeight, deleteWeight, tdee, calc, profile } = useApp();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(today);
  const [msg, setMsg] = useState<string | null>(null);
  const series = useMemo(() => trendSeries(weights, today).slice(-90), [weights, today]);
  const cur = currentWeight(weights, today);
  const rate = weeklyRate(weights, today);
  const recent = Object.entries(weights)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 5);

  return (
    <section className="plunk face-card space-y-4 p-4" style={{ ["--d" as string]: "4px" }} aria-label="Weight">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label flex items-center gap-1.5">
            <Icon.scale size={13} /> Weight
          </p>
          <p className="num mt-1 text-3xl font-extrabold">
            {cur ? cur.trend.toFixed(1) : "—"}
            <span className="ml-1 text-sm font-semibold text-ink-3">kg trend</span>
          </p>
          {rate !== null && (
            <p className={`num text-xs font-semibold ${Math.abs(rate) < 0.05 ? "text-ink-2" : (rate < 0) === (profile?.goal === "lose") ? "text-ok" : "text-ink-2"}`}>
              {rate > 0 ? "+" : ""}
              {rate.toFixed(2)} kg/week over 4 weeks
            </p>
          )}
        </div>
      </div>
      <form
        className="grid grid-cols-[88px_minmax(0,1fr)] items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = Number(kg.replace(",", "."));
          if (!(v >= 30 && v <= 300)) return setMsg("Enter your weight in kg (30-300).");
          if (date > today) return setMsg("That date is in the future.");
          await logWeight(date, v);
          setKg("");
          setMsg(null);
        }}
      >
        <label className="field compact">
          <span>kg</span>
          <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={cur ? cur.lastKg.toFixed(1) : "70.0"} />
        </label>
        <label className="field compact min-w-0">
          <span>Date</span>
          <input type="date" value={date} max={today} min={addDays(today, -365)} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <PopButton type="submit" variant="lime" size="sm" disabled={!kg} className="col-span-2">
          Log weight
        </PopButton>
      </form>
      {msg && <p className="text-xs text-over" role="alert">{msg}</p>}
      {series.length > 1 ? (
        <WeightChart series={series} />
      ) : (
        <p className="text-sm text-ink-3">Weigh in a few times a week, same time, same scale. Bite smooths out the daily water swings into a trend.</p>
      )}
      {calc && (
        <div className="border-t border-line pt-3">
          <p className="label">Your maintenance</p>
          {tdee?.ok ? (
            <>
              <p className="num mt-1 text-sm">
                <strong className="text-lg">{fmtInt(tdee.fromData)}</strong> kcal/day from your data{" "}
                <span className="text-ink-3">· formula says {fmtInt(calc.formulaTdee)}</span>
              </p>
              <p className="mt-1 text-xs text-ink-2">
                From {tdee.days} fully logged days (avg {fmtInt(tdee.intake)} kcal) and {tdee.weighIns} weigh-ins ({tdee.kgPerWeek > 0 ? "+" : ""}
                {tdee.kgPerWeek} kg/week). {tdee.confidence === "high" ? "High" : tdee.confidence === "medium" ? "Medium" : "Low"} confidence
                {tdee.clamped ? ", capped at ±25% of the formula" : ""}.{" "}
                {calc.adaptive ? "Your targets use it." : profile?.adaptive === false ? "Adaptive targets are off in Settings." : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-ink-2">Using the formula ({fmtInt(calc.formulaTdee)} kcal). To estimate it from your own data, Bite needs {tdee && !tdee.ok ? tdee.need : "a couple of weeks of logs and weigh-ins"}.</p>
          )}
        </div>
      )}
      {recent.length > 0 && (
        <details className="group border-t border-line pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">
            Recent weigh-ins
            <span className="transition-transform group-open:rotate-180">
              <Icon.chevron size={14} />
            </span>
          </summary>
          <ul className="mt-2 divide-y divide-line-soft">
            {recent.map(([d, w]) => (
              <li key={d} className="num flex items-center justify-between py-1.5 text-sm">
                <span className="text-ink-2">{fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="flex items-center gap-2">
                  <strong>{w.kg.toFixed(1)} kg</strong>
                  <button className="flex h-8 w-8 items-center justify-center text-ink-3 hover:text-over" onClick={() => void deleteWeight(d)} aria-label={`Delete weigh-in on ${d}`}>
                    <Icon.trash size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/* ------------------------------ averages ------------------------------ */

function AvgSplit({ rows, dates, range }: { rows: Record<string, DayRow>; dates: string[]; range: number }) {
  const logged = dates.map((d) => rows[d]).filter((r): r is DayRow => !!r?.count);
  if (!logged.length) return null;
  const avg = (k: "protein_g" | "carbs_g" | "fat_g") => logged.reduce((s, r) => s + r[k], 0) / logged.length;
  const p = avg("protein_g");
  const c = avg("carbs_g");
  const f = avg("fat_g");
  return (
    <section className="card p-4">
      <p className="label">Average calorie split · {range}d</p>
      <div className="mt-3">
        <Donut
          size={112}
          thickness={18}
          caption={`Average share of calories by macro over ${range} days`}
          segments={[
            { key: "protein", label: "Protein", value: p * 4, color: "var(--protein)", detail: `${Math.round(p)} g/day` },
            { key: "carbs", label: "Carbs", value: c * 4, color: "var(--carbs)", detail: `${Math.round(c)} g/day` },
            { key: "fat", label: "Fat", value: f * 9, color: "var(--fat)", detail: `${Math.round(f)} g/day` },
          ]}
          center={<span className="label !text-[10px]">{logged.length} days</span>}
        />
      </div>
    </section>
  );
}

function MicrosAvg({ rows, dates, calories, sex, range }: { rows: Record<string, DayRow>; dates: string[]; calories: number; sex?: Profile["sex"]; range: number }) {
  // Only days where every item has micro data, so averages aren't dragged down by old entries.
  const full = dates.map((d) => rows[d]).filter((r): r is DayRow & { micros: NonNullable<DayRow["micros"]> } => !!r?.count && !!r.micros && r.microCovered === r.count);
  const t = microTargets(calories, sex);
  return (
    <section className="card p-4">
      <p className="label">Micronutrients · daily average</p>
      {!full.length ? (
        <p className="mt-2 text-sm text-ink-3">Shows up once you&apos;ve logged a full day with the new micronutrient tracking.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {MICRO_KEYS.map((k) => {
              const v = full.reduce((s, r) => s + r.micros[k], 0) / full.length;
              const over = full.filter((r) => MICRO_META[k].kind === "limit" && r.micros[k] > t[k]).length;
              const st = microStatus(k, v, t[k]);
              return (
                <li key={k} className="grid grid-cols-[64px_1fr_auto] items-center gap-2" title={MICRO_META[k].note}>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{MICRO_META[k].label}</span>
                  <div className="h-1.5 bg-elevated">
                    <div className={`h-full ${st === "high" ? "hatch" : ""}`} style={{ width: `${Math.min(100, (v / t[k]) * 100)}%`, backgroundColor: st === "high" ? "var(--over)" : "var(--ink-3)" }} />
                  </div>
                  <span className="num text-right text-xs">
                    {fmtG(v)} {MICRO_META[k].unit}
                    {over > 0 && <span className="ml-1 font-bold text-over">{over}d over</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">
            From {full.length} fully tracked day{full.length === 1 ? "" : "s"} in the last {range}. Sodium limit {fmtInt(t.sodium_mg)} mg.
          </p>
        </>
      )}
    </section>
  );
}

function TopFoods({ days, range }: { days: DayLog[] | null; range: number }) {
  if (!days) return null;
  const map = new Map<string, { name: string; kcal: number; n: number; protein: number }>();
  for (const d of days) for (const i of d.items) {
    const k = foodKey(i.name);
    const f = map.get(k) ?? { name: i.name, kcal: 0, n: 0, protein: 0 };
    f.kcal += i.calories;
    f.protein += i.protein_g;
    f.n++;
    map.set(k, f);
  }
  const top = [...map.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 8);
  if (!top.length) return null;
  const total = days.reduce((s, d) => s + sumItems(d.items).calories, 0);
  return (
    <section className="card p-4 lg:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">Where your calories come from · {range}d</p>
        <p className="num text-[11px] text-ink-3">{fmtInt(total)} kcal total</p>
      </div>
      <div className="mt-3 lg:columns-2 lg:gap-8">
        <BarList
          rows={top.map((f) => ({
            key: f.name,
            label: f.name,
            value: f.kcal,
            display: `${fmtInt(f.kcal)} kcal · ${Math.round((f.kcal / Math.max(total, 1)) * 100)}% · ×${f.n}`,
            color: "var(--violet)",
            sub: `~${fmtInt(f.kcal / f.n)} kcal and ${Math.round(f.protein / f.n)} g protein each time`,
          }))}
        />
      </div>
    </section>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${fmtInt(n)}`;

/** Average of the last 7 days that look fully logged, for each date (null until there's one). */
function rollingAvg(rows: Record<string, DayRow>, dates: string[], fallback: Targets): (number | null)[] {
  return dates.map((d) => {
    const vals: number[] = [];
    for (let k = 0; k < 7; k++) {
      const r = rows[addDays(d, -k)];
      if (r?.count && classifyDay(r, r.target ?? fallback).status !== "low") vals.push(r.calories);
    }
    return vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
}

function MiniStat({ status, n, of }: { status: DayStatus; n: number; of: number }) {
  const m = STATUS_META[status];
  return (
    <div className="card flex items-center gap-2 px-3" aria-label={`${status === "under" ? "Under or partial" : m.label}: ${n} of ${of} days`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center text-xs font-extrabold text-[#0d0d0d] ${status === "over" ? "hatch" : ""}`} style={{ backgroundColor: FACE[status] }} aria-hidden="true">
        {m.glyph}
      </span>
      <span className="flex-1 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{status === "hit" ? "On target" : m.short}</span>
      <span className="num text-lg font-extrabold">
        {n}
        <span className="text-xs text-ink-3">/{of}</span>
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {(Object.keys(STATUS_META) as DayStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
          <span className={`flex h-3.5 w-3.5 items-center justify-center text-[9px] font-black text-[#0d0d0d] ${s === "over" ? "hatch" : ""}`} style={{ backgroundColor: FACE[s] }} aria-hidden="true">
            {STATUS_META[s].glyph}
          </span>
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ 14-day chart ------------------------------ */

function BarChart({ rows, dates, fallback, selected, onSelect }: { rows: Record<string, DayRow>; dates: string[]; fallback: Targets; selected: string; onSelect: (d: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const H = 170;
  const max = Math.max(fallback.calories * 1.3, ...dates.map((d) => rows[d]?.calories ?? 0));
  const targetY = (fallback.calories / max) * H;
  const focus = hover ?? selected;
  const fr = rows[focus];
  const fc = fr?.count ? classifyDay(fr, fr.target ?? fallback) : null;
  const gap = dates.length > 45 ? 1 : 2;
  const avg = rollingAvg(rows, dates, fallback);
  const avgPts = avg.map((v, i) => (v === null ? null : `${i + 0.5},${H - (v / max) * H}`));
  const avgPath = avgPts.reduce((acc, p, i) => (p === null ? acc : `${acc}${i === 0 || avgPts[i - 1] === null ? "M" : "L"}${p}`), "");

  return (
    <section className="plunk face-card p-4" style={{ ["--i" as string]: 3, ["--d" as string]: "4px" }} aria-label={`Calories, last ${dates.length} days`}>
      <div className="flex items-baseline justify-between">
        <p className="label">Last {dates.length} days</p>
        <p className="num text-[11px] text-ink-3">target {fmtInt(fallback.calories)}</p>
      </div>
      {/* Readout (works for hover, tap and keyboard). Fixed height so the chart never shifts under the pointer. */}
      <div className="num mt-2 h-11 overflow-hidden text-sm">
        <p className="truncate">
          <span className="font-bold">{fmtDate(focus, { weekday: "short", day: "numeric", month: "short" })}</span>
          {fc && fr ? (
            <>
              {" · "}
              {fmtInt(fr.calories)} kcal · <span className="font-semibold">{STATUS_META[fc.status].glyph} {statusText(fc.status, focus === dates[dates.length - 1])}</span>
              {fc.status !== "low" && ` (${signed(fc.kcalDelta)})`}
            </>
          ) : (
            <span className="text-ink-3"> · nothing logged</span>
          )}
        </p>
        <p className="truncate text-xs text-ink-2">
          {fc && fr ? `Protein ${Math.round(fr.protein_g)} g · Carbs ${Math.round(fr.carbs_g)} g · Fat ${Math.round(fr.fat_g)} g` : "\u00a0"}
        </p>
      </div>
      <div className="relative mt-2" style={{ height: H }} onPointerLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-ink" style={{ bottom: targetY }} aria-hidden="true" />
        <div className="flex h-full items-end" style={{ gap }}>
          {dates.map((d) => {
            const r = rows[d];
            const c = r?.count ? classifyDay(r, r.target ?? fallback) : null;
            const h = r?.count ? Math.max(3, (r.calories / max) * H) : 2;
            const isSel = d === selected;
            return (
              <button
                key={d}
                className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-offset-0"
                // Hover preview for mice only; taps select (touch "hover" would stick).
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(d)}
                onFocus={(e) => e.currentTarget.matches(":focus-visible") && setHover(d)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect(d)}
                aria-label={`${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}: ${c && r ? `${fmtInt(r.calories)} kcal, ${STATUS_META[c.status].label}` : "nothing logged"}`}
                aria-pressed={isSel}
              >
                <span
                  className={`block w-full transition-[height] duration-300 ${c?.status === "over" ? "hatch" : ""} ${isSel ? "outline-2 outline-offset-1 outline-ink" : ""}`}
                  style={{ height: h, backgroundColor: c ? BAR[c.status] : "var(--line-soft)", opacity: c?.status === "low" ? 0.6 : 1 }}
                />
              </button>
            );
          })}
        </div>
        {avgPath && (
          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox={`0 0 ${dates.length} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={avgPath} fill="none" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="mt-1.5 flex" style={{ gap }} aria-hidden="true">
        {dates.map((d, i) => {
          const every = dates.length > 45 ? 10 : dates.length > 20 ? 4 : 2;
          return (
            <span key={d} className={`num min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] ${d === selected ? "font-bold text-ink" : "text-ink-3"}`}>
              {(dates.length - 1 - i) % every === 0 || d === selected ? Number(d.slice(8)) : ""}
            </span>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend />
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
          <span className="h-0.5 w-4 bg-ink" aria-hidden="true" /> 7-day average
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
          <span className="w-4 border-t-2 border-dashed border-ink" aria-hidden="true" /> Target
        </span>
      </div>
      {/* Table view for screen readers */}
      <table className="sr-only">
        <caption>Calories per day, last {dates.length} days</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Calories</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((d) => {
            const r = rows[d];
            const c = r?.count ? classifyDay(r, r.target ?? fallback) : null;
            return (
              <tr key={d}>
                <td>{d}</td>
                <td>{r?.count ? Math.round(r.calories) : "—"}</td>
                <td>{c ? STATUS_META[c.status].label : "Not logged"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* -------------------------------- calendar -------------------------------- */

function Calendar({ rows, fallback, today, selected, onSelect, frozen }: { rows: Record<string, DayRow>; fallback: Targets; today: string; selected: string; onSelect: (d: string) => void; frozen: Set<string> }) {
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const weeks = monthGrid(ym.y, ym.m);
  const monthDates = weeks.flat().filter((d): d is string => !!d && d <= today);
  const s = rangeStats(rows, monthDates, fallback);
  const isCurrent = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}` === today.slice(0, 7);
  const shift = (delta: number) => setYm(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }));
  const label = new Date(ym.y, ym.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <section className="plunk face-card p-4" style={{ ["--i" as string]: 5, ["--d" as string]: "4px" }} aria-label={`Calendar, ${label}`}>
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center border border-line" aria-label="Previous month">
          <Icon.left size={16} />
        </button>
        <div className="text-center">
          <p className="font-bold">{label}</p>
          <p className="num text-[11px] text-ink-2">
            {s.logged ? `${s.hit} on target · ${s.over} over · ${s.under + s.low} under` : "No days logged"}
          </p>
        </div>
        <button onClick={() => shift(1)} disabled={isCurrent} className="flex h-9 w-9 items-center justify-center border border-line disabled:opacity-30" aria-label="Next month">
          <Icon.right size={16} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="label">
            {d}
          </span>
        ))}
        {weeks.flat().map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />;
          const r = rows[d];
          const c = r?.count ? classifyDay(r, r.target ?? fallback) : null;
          const future = d > today;
          const isSel = d === selected;
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => onSelect(d)}
              aria-pressed={isSel}
              aria-label={`${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}: ${c ? STATUS_META[c.status].label : future ? "upcoming" : "nothing logged"}${frozen.has(d) ? ", streak freeze" : ""}`}
              className={`relative flex aspect-square flex-col items-center justify-center text-xs font-bold ${c ? "text-[#0d0d0d]" : future ? "text-ink-3/40" : "border border-line-soft text-ink-3"} ${c?.status === "over" ? "hatch" : ""} ${
                isSel ? "outline-2 outline-offset-1 outline-ink" : ""
              } ${d === today && !isSel ? "ring-1 ring-ink ring-inset" : ""}`}
              style={c ? { backgroundColor: FACE[c.status] } : undefined}
            >
              <span className="num">{Number(d.slice(8))}</span>
              {c && <span className="text-[10px] leading-none" aria-hidden="true">{STATUS_META[c.status].glyph}</span>}
              {frozen.has(d) && (
                <span className="text-under" aria-hidden="true" title="Streak freeze">
                  <Icon.snow size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------- day detail ------------------------------- */

function DayDetail({ date, row, fallback, today }: { date: string; row?: DayRow; fallback: Targets; today: string }) {
  const { repeatItems } = useApp();
  const [log, setLog] = useState<DayLog | null>(null);
  const count = row?.count ?? 0;
  useEffect(() => {
    let live = true;
    db.getDay(date).then((d) => live && setLog(d));
    return () => {
      live = false;
    };
  }, [date, count]);

  const target = row?.target ?? fallback;
  const items = log?.date === date ? log.items : [];
  const tot = sumItems(items);
  const c = items.length ? classifyDay(tot, target) : null;
  const title = date === today ? "Today" : fmtDate(date, { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="card p-4" style={{ ["--i" as string]: 6 }} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">Day detail</p>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        {c && (
          <span className={`flex items-center gap-1 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#0d0d0d] ${c.status === "over" ? "hatch" : ""}`} style={{ backgroundColor: FACE[c.status] }}>
            {STATUS_META[c.status].glyph} {statusText(c.status, date === today)}
          </span>
        )}
      </div>
      {!items.length ? (
        <p className="mt-3 text-sm text-ink-3">Nothing logged this day.</p>
      ) : (
        <>
          <p className="num mt-2 text-sm">
            <strong className="text-xl">{fmtInt(tot.calories)}</strong> <span className="text-ink-2">of {fmtInt(target.calories)} kcal</span>
          </p>
          <MacroRows tot={tot} target={target} />
          {c && c.flags.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {c.flags.map((f) => (
                <li key={f.key} className={`tag solid ${f.kind === "over" ? "hatch" : ""} text-[#0d0d0d]`} style={{ backgroundColor: f.kind === "over" ? FACE.over : FACE.under }}>
                  {f.kind === "over" ? "↑" : "↓"} {f.label} {f.kind === "over" ? "over" : "short"} {f.delta > 0 ? "+" : ""}
                  {f.delta} {f.unit}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-ok">
              <Icon.check size={14} /> Every macro landed in range.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {MEALS.map((m) => {
              const mi = items.filter((i) => i.meal === m);
              if (!mi.length) return null;
              return (
                <div key={m}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em]">
                      <span className="h-2.5 w-2.5" style={{ background: MEAL_STYLE[m].color }} aria-hidden="true" />
                      {MEAL_STYLE[m].label} · <span className="num">{fmtInt(sumItems(mi).calories)} kcal</span>
                    </p>
                    {date !== today && (
                      <button
                        className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2 underline decoration-lime decoration-2 underline-offset-4 hover:text-ink"
                        onClick={() => repeatItems(mi, `${MEAL_STYLE[m].label} from ${fmtDate(date, { weekday: "short", day: "numeric", month: "short" })}`)}
                        aria-label={`Log this ${MEAL_STYLE[m].label.toLowerCase()} again today`}
                      >
                        Log again
                      </button>
                    )}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {mi.map((i) => (
                      <li key={i.id} className="num flex justify-between gap-2 text-sm">
                        <span className="truncate text-ink-2">
                          {fmtG(i.quantity)} {i.unit} {i.name}
                        </span>
                        <span className="shrink-0">{fmtInt(i.calories)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function MacroRows({ tot, target }: { tot: Targets; target: Targets }) {
  const rows = [
    { k: "Protein", v: tot.protein_g, t: target.protein_g, c: "var(--protein)" },
    { k: "Carbs", v: tot.carbs_g, t: target.carbs_g, c: "var(--carbs)" },
    { k: "Fat", v: tot.fat_g, t: target.fat_g, c: "var(--fat)" },
    { k: "Fibre", v: tot.fibre_g, t: target.fibre_g, c: "var(--fibre)" },
  ];
  return (
    <div className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[52px_1fr_78px] items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.k}</span>
          <div className="h-2 bg-elevated">
            <div className="h-full" style={{ width: `${Math.min(100, (r.v / Math.max(r.t, 1)) * 100)}%`, background: r.c }} />
          </div>
          <span className="num text-right text-xs">
            {Math.round(r.v)}/{r.t} g
          </span>
        </div>
      ))}
    </div>
  );
}
