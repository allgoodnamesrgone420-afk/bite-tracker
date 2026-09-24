"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon, fmtG, fmtInt } from "@/components/ui";
import * as db from "@/lib/db";
import { MEAL_STYLE } from "@/lib/meal-style";
import { STATUS_META, classifyDay, lastNDates, monthGrid, rangeStats, targetStreak, type DayRow, type DayStatus } from "@/lib/progress";
import { MEALS, type DayLog } from "@/lib/schemas";
import type { Targets } from "@/lib/targets";
import { sumItems } from "@/lib/totals";

/** Chart fills: theme tokens validated for CVD separation (see globals.css). */
const BAR: Record<DayStatus, string> = { hit: "var(--ok)", over: "var(--over)", under: "var(--under)", low: "var(--ink-3)" };
/** Calendar faces carry black ink, so they use the vivid (dark-theme) steps in both themes. */
const FACE: Record<DayStatus, string> = { hit: "#00a886", over: "#f2542d", under: "#6c7cff", low: "#8a8a8a" };

/** A partly logged today is "in progress", not "incomplete". */
const statusText = (status: DayStatus, isToday: boolean) => (isToday && status !== "over" ? "In progress" : STATUS_META[status].label);

const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00`).toLocaleDateString("en-IN", opts);

export default function ProgressPage() {
  const { ready, summaries, calc, today } = useApp();
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
  return <Progress rows={summaries} fallback={calc.targets} today={today} selected={selected ?? today} onSelect={setSelected} />;
}

function Title() {
  return (
    <header>
      <p className="label">Progress</p>
      <h1 className="text-2xl font-extrabold tracking-tight">How the days are stacking up</h1>
    </header>
  );
}

function Progress({ rows, fallback, today, selected, onSelect }: { rows: Record<string, DayRow>; fallback: Targets; today: string; selected: string; onSelect: (d: string) => void }) {
  const last14 = useMemo(() => lastNDates(today, 14), [today]);
  const stats14 = rangeStats(rows, last14, fallback);
  const streakDays = targetStreak(rows, today, fallback);
  const logged14 = stats14.logged;

  return (
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <Title />
      </div>

      <section className="grid grid-cols-[1.1fr_1fr] gap-3" style={{ ["--i" as string]: 1 }}>
        <div className="plunk face-lime p-4" style={{ ["--d" as string]: "5px" }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">On-target streak</p>
          <p className="hero-num num mt-2 text-[64px]">{streakDays}</p>
          <p className="mt-1 text-xs font-semibold opacity-80">{streakDays === 1 ? "day" : "days"} in a row</p>
        </div>
        <div className="grid grid-rows-3 gap-2">
          <MiniStat status="hit" n={stats14.hit} of={logged14} />
          <MiniStat status="over" n={stats14.over} of={logged14} />
          <MiniStat status="under" n={stats14.under + stats14.low} of={logged14} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3" style={{ ["--i" as string]: 2 }}>
        <div className="card p-3">
          <p className="label">Avg kcal · 14d</p>
          <p className="num mt-1 text-2xl font-extrabold">{logged14 ? fmtInt(stats14.avgCalories) : "—"}</p>
          <p className="num text-xs text-ink-2">target {fmtInt(fallback.calories)}</p>
        </div>
        <div className="card p-3">
          <p className="label">Protein hit · 14d</p>
          <p className="num mt-1 text-2xl font-extrabold">
            {stats14.proteinHit}
            <span className="text-sm text-ink-3">/{logged14}</span>
          </p>
          <p className="num text-xs text-ink-2">avg {logged14 ? `${stats14.avgProtein} g` : "—"} of {fallback.protein_g} g</p>
        </div>
      </section>

      <BarChart rows={rows} dates={last14} fallback={fallback} selected={selected} onSelect={onSelect} />

      {(stats14.best || stats14.worst) && (
        <section className="grid grid-cols-2 gap-3" style={{ ["--i" as string]: 4 }}>
          {stats14.best && (
            <button className="card p-3 text-left" onClick={() => onSelect(stats14.best!.date)}>
              <p className="label flex items-center gap-1 text-ok">
                <Icon.check size={12} /> Best day
              </p>
              <p className="mt-1 font-bold">{fmtDate(stats14.best.date, { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="num text-xs text-ink-2">{signed(stats14.best.kcalDelta)} kcal vs target</p>
            </button>
          )}
          {stats14.worst && stats14.worst.kcalDelta > 0 && (
            <button className="card p-3 text-left" onClick={() => onSelect(stats14.worst!.date)}>
              <p className="label flex items-center gap-1 text-over">↑ Toughest day</p>
              <p className="mt-1 font-bold">{fmtDate(stats14.worst.date, { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="num text-xs text-ink-2">{signed(stats14.worst.kcalDelta)} kcal vs target</p>
            </button>
          )}
        </section>
      )}

      <Calendar rows={rows} fallback={fallback} today={today} selected={selected} onSelect={onSelect} />

      <DayDetail date={selected} row={rows[selected]} fallback={fallback} today={today} />
    </div>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${fmtInt(n)}`;

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
  const H = 150;
  const max = Math.max(fallback.calories * 1.3, ...dates.map((d) => rows[d]?.calories ?? 0));
  const targetY = (fallback.calories / max) * H;
  const focus = hover ?? selected;
  const fr = rows[focus];
  const fc = fr?.count ? classifyDay(fr, fr.target ?? fallback) : null;

  return (
    <section className="plunk face-card p-4" style={{ ["--i" as string]: 3, ["--d" as string]: "4px" }} aria-label="Calories, last 14 days">
      <div className="flex items-baseline justify-between">
        <p className="label">Last 14 days</p>
        <p className="num text-[11px] text-ink-3">target {fmtInt(fallback.calories)}</p>
      </div>
      {/* Readout (tooltip that works for touch, hover and keyboard) */}
      <p className="num mt-2 min-h-10 text-sm" aria-live="polite">
        <span className="font-bold">{fmtDate(focus, { weekday: "short", day: "numeric", month: "short" })}</span>
        {fc && fr ? (
          <>
            {" · "}
            {fmtInt(fr.calories)} kcal · <span className="font-semibold">{STATUS_META[fc.status].glyph} {statusText(fc.status, focus === dates[dates.length - 1])}</span>
            {fc.status !== "low" && ` (${signed(fc.kcalDelta)})`}
            <span className="block text-xs text-ink-2">
              Protein {Math.round(fr.protein_g)} g · Carbs {Math.round(fr.carbs_g)} g · Fat {Math.round(fr.fat_g)} g
            </span>
          </>
        ) : (
          <span className="text-ink-3"> · nothing logged</span>
        )}
      </p>
      <div className="relative mt-3" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-ink" style={{ bottom: targetY }} aria-hidden="true" />
        <div className="flex h-full items-end gap-[2px]">
          {dates.map((d) => {
            const r = rows[d];
            const c = r?.count ? classifyDay(r, r.target ?? fallback) : null;
            const h = r?.count ? Math.max(3, (r.calories / max) * H) : 2;
            const isSel = d === selected;
            return (
              <button
                key={d}
                className="group flex h-full flex-1 items-end focus-visible:outline-offset-0"
                onMouseEnter={() => setHover(d)}
                onFocus={() => setHover(d)}
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
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
        {dates.map((d, i) => (
          <span key={d} className={`num flex-1 text-center text-[10px] ${d === selected ? "font-bold text-ink" : "text-ink-3"}`}>
            {i % 2 === 1 || d === selected ? Number(d.slice(8)) : ""}
          </span>
        ))}
      </div>
      <div className="mt-4">
        <Legend />
      </div>
      {/* Table view for screen readers */}
      <table className="sr-only">
        <caption>Calories per day, last 14 days</caption>
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

function Calendar({ rows, fallback, today, selected, onSelect }: { rows: Record<string, DayRow>; fallback: Targets; today: string; selected: string; onSelect: (d: string) => void }) {
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
              aria-label={`${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}: ${c ? STATUS_META[c.status].label : future ? "upcoming" : "nothing logged"}`}
              className={`relative flex aspect-square flex-col items-center justify-center text-xs font-bold ${c ? "text-[#0d0d0d]" : future ? "text-ink-3/40" : "border border-line-soft text-ink-3"} ${c?.status === "over" ? "hatch" : ""} ${
                isSel ? "outline-2 outline-offset-1 outline-ink" : ""
              } ${d === today && !isSel ? "ring-1 ring-ink ring-inset" : ""}`}
              style={c ? { backgroundColor: FACE[c.status] } : undefined}
            >
              <span className="num">{Number(d.slice(8))}</span>
              {c && <span className="text-[10px] leading-none" aria-hidden="true">{STATUS_META[c.status].glyph}</span>}
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
