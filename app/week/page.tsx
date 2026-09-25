"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { BarList } from "@/components/charts";
import { Icon, PopButton, fmtInt } from "@/components/ui";
import * as db from "@/lib/db";
import { STATUS_META, type DayStatus } from "@/lib/progress";
import { buildWeekReport, defaultReportWeek, reportText, weekDates, type WeekReport } from "@/lib/report";
import type { DayLog } from "@/lib/schemas";
import { addDays, weekStart } from "@/lib/totals";

/** Status faces carry black ink, so they use the vivid steps in both themes (same as the calendar). */
const FACE: Record<DayStatus, string> = { hit: "#00a886", over: "#f2542d", under: "#6c7cff", low: "#8a8a8a" };
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00`).toLocaleDateString("en-IN", o);
const signed = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmtInt(Math.abs(n))}${unit}`;

export default function WeekPage() {
  const { ready, calc, today, summaries, weights, profile, dataVersion } = useApp();
  const [start, setStart] = useState<string | null>(null);
  const week = start ?? defaultReportWeek(today);
  const [logs, setLogs] = useState<DayLog[] | null>(null);
  const count = weekDates(week).reduce((s, d) => s + (summaries[d]?.count ?? 0), 0);

  useEffect(() => {
    let live = true;
    db.getDays(weekDates(week)).then((d) => live && setLogs(d));
    return () => {
      live = false;
    };
  }, [week, count, dataVersion]);

  const report = useMemo(
    () => (calc && logs ? buildWeekReport({ start: week, today, rows: summaries, logs, weights, fallback: calc.targets, profile }) : null),
    [calc, logs, week, today, summaries, weights, profile],
  );

  if (!ready || !logs) return <p className="label pulse pt-10">Loading…</p>;
  if (!calc || !report) {
    return (
      <Link href="/settings" className="plunk face-card block p-4">
        <p className="label">Set up</p>
        <p className="mt-1 font-bold">Add your profile first. The report card compares your week with your targets →</p>
      </Link>
    );
  }
  const latest = weekStart(today);
  return <Report r={report} onPrev={() => setStart(addDays(week, -7))} onNext={week < latest ? () => setStart(addDays(week, 7)) : undefined} />;
}

function Report({ r, onPrev, onNext }: { r: WeekReport; onPrev: () => void; onNext?: () => void }) {
  const { showToast } = useApp();
  const s = r.stats;
  const title = `${fmt(r.start, { day: "numeric", month: "short" })} – ${fmt(r.end, { day: "numeric", month: "short" })}`;

  const share = async () => {
    const text = reportText(r);
    try {
      if (navigator.share) await navigator.share({ title: "My week on Bite", text });
      else {
        await navigator.clipboard.writeText(text);
        showToast("Copied your week to the clipboard");
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="stagger space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3" style={{ ["--i" as string]: 0 }}>
        <div>
          <p className="label">Weekly report card</p>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{title}</h1>
          {r.partial && <p className="text-xs text-ink-2">This week isn&apos;t over yet. Numbers so far.</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} className="flex h-10 w-10 items-center justify-center border border-line" aria-label="Previous week">
            <Icon.left size={16} />
          </button>
          <button onClick={onNext} disabled={!onNext} className="flex h-10 w-10 items-center justify-center border border-line disabled:opacity-30" aria-label="Next week">
            <Icon.right size={16} />
          </button>
        </div>
      </header>

      {s.logged === 0 ? (
        <section className="card p-5 text-center">
          <p className="font-semibold">Nothing logged this week.</p>
          <p className="mt-1 text-sm text-ink-2">Try an earlier week, or start logging and check back on Sunday.</p>
        </section>
      ) : (
        <>
          <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
            <div className="space-y-4">
              <section className="plunk face-lime p-5" style={{ ["--d" as string]: "6px", ["--i" as string]: 1 }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">Days on target</p>
                <p className="hero-num num mt-2 text-[80px]">
                  {s.hit}
                  <span className="text-3xl opacity-60">/{s.logged}</span>
                </p>
                <p className="mt-1 text-sm font-semibold opacity-80">
                  {s.logged} of 7 days logged · {s.over} over · {s.under + s.low} under
                </p>
              </section>

              <section className="grid grid-cols-7 gap-1.5" aria-label="Each day this week" style={{ ["--i" as string]: 2 }}>
                {r.days.map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-1">
                    <span className="label !text-[10px]">{fmt(d.date, { weekday: "narrow" })}</span>
                    <span
                      className={`flex aspect-square w-full items-center justify-center text-sm font-extrabold ${d.status ? "text-[#0d0d0d]" : "border border-line-soft text-ink-3"} ${d.status === "over" ? "hatch" : ""}`}
                      style={d.status ? { backgroundColor: FACE[d.status] } : undefined}
                      title={`${fmt(d.date, { weekday: "long", day: "numeric", month: "short" })}: ${d.status ? `${fmtInt(d.calories)} kcal, ${STATUS_META[d.status].label}` : "not logged"}`}
                    >
                      {d.status ? STATUS_META[d.status].glyph : "·"}
                    </span>
                    <span className="num text-[10px] text-ink-2">{d.count ? fmtInt(d.calories) : "—"}</span>
                  </div>
                ))}
              </section>

              <section className="grid grid-cols-2 gap-3" style={{ ["--i" as string]: 3 }}>
                <Stat label="Avg calories" value={fmtInt(s.avgCalories)} sub={`target ${fmtInt(r.targetCalories)}${r.vsPrev ? ` · ${signed(r.vsPrev.avgCalories)} vs last wk` : ""}`} />
                <Stat label="Protein" value={`${s.avgProtein} g`} sub={`hit on ${s.proteinHit} day${s.proteinHit === 1 ? "" : "s"}${r.vsPrev ? ` · ${signed(r.vsPrev.avgProtein, " g")}` : ""}`} />
                <Stat
                  label="Weight trend"
                  value={r.weight ? `${r.weight.change >= 0.05 ? "+" : ""}${(Math.abs(r.weight.change) < 0.05 ? 0 : r.weight.change).toFixed(1)} kg` : "—"}
                  sub={r.weight ? `now ${r.weight.end.toFixed(1)} kg` : "weigh in to see this"}
                />
                <Stat
                  label="Sodium"
                  value={r.sodium.tracked ? `${r.sodium.over}/${r.sodium.tracked}` : "—"}
                  sub={r.sodium.tracked ? `days over ${fmtInt(r.sodium.limit)} mg` : "no fully tracked days"}
                />
              </section>
            </div>

            <div className="space-y-4">
              {r.focus && (
                <section className="plunk face-violet p-5" style={{ ["--d" as string]: "5px", ["--i" as string]: 4 }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">One focus for next week</p>
                  <p className="mt-2 text-xl font-extrabold leading-tight">{r.focus.title}</p>
                  <p className="mt-2 text-sm font-medium opacity-90">{r.focus.detail}</p>
                </section>
              )}

              {(s.best || s.worst || r.wins.length > 0) && (
                <section className="card space-y-3 p-4">
                  {s.best && (
                    <p className="text-sm">
                      <span className="label mr-2 text-ok">Best day</span>
                      <strong>{fmt(s.best.date, { weekday: "long" })}</strong> <span className="num text-ink-2">({signed(s.best.kcalDelta)} kcal vs target)</span>
                    </p>
                  )}
                  {s.worst && s.worst.kcalDelta > 0 && (
                    <p className="text-sm">
                      <span className="label mr-2 text-over">Toughest</span>
                      <strong>{fmt(s.worst.date, { weekday: "long" })}</strong> <span className="num text-ink-2">({signed(s.worst.kcalDelta)} kcal)</span>
                    </p>
                  )}
                  {r.wins.map((w) => (
                    <p key={w.id} className="flex items-start gap-2 text-sm">
                      <span className="text-ok">
                        <Icon.check size={16} />
                      </span>
                      {w.title}
                    </p>
                  ))}
                </section>
              )}

              {r.topFoods.length > 0 && (
                <section className="card p-4">
                  <p className="label">Biggest calorie sources</p>
                  <div className="mt-3">
                    <BarList
                      rows={r.topFoods.map((f) => ({ key: f.name, label: f.name, value: f.kcal, display: `${fmtInt(f.kcal)} kcal · ×${f.n}`, color: "var(--violet)" }))}
                    />
                  </div>
                </section>
              )}

              <div className="flex flex-wrap gap-3">
                <PopButton variant="lime" onClick={() => void share()}>
                  Share my week
                </PopButton>
                <Link href="/coach" className="pop-btn ghost">
                  <Icon.coach size={16} /> Ask the coach
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3">
      <p className="label">{label}</p>
      <p className="num mt-1 text-2xl font-extrabold">{value}</p>
      <p className="num text-xs text-ink-2">{sub}</p>
    </div>
  );
}
