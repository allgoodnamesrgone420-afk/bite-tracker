"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/AppProvider";
import { BarList, Donut } from "@/components/charts";
import { MicrosCard } from "@/components/MicrosCard";
import { ConfidenceDot, Icon, fmtG, fmtInt, useCountUp } from "@/components/ui";
import { MEAL_STYLE } from "@/lib/meal-style";
import * as db from "@/lib/db";
import { STATUS_META, classifyDay, lastNDates } from "@/lib/progress";
import { MEALS, ParsedItemSchema, type DayLog, type LogItem, type Meal } from "@/lib/schemas";
import type { Targets } from "@/lib/targets";
import { addDays, byMeal, macroSplit, mealForTime, remaining, streak, sumItems } from "@/lib/totals";

export default function TodayPage() {
  const { ready, day, today, summaries, calc, pending, profile } = useApp();
  const [yesterday, setYesterday] = useState<DayLog | null>(null);
  useEffect(() => {
    let live = true;
    db.getDay(addDays(today, -1)).then((d) => live && setYesterday(d));
    return () => {
      live = false;
    };
  }, [today]);
  if (!ready) return <p className="label pulse pt-10">Loading…</p>;

  const consumed = sumItems(day.items);
  const targets = calc?.targets ?? null;
  const days = streak(Object.keys(summaries), today);
  const groups = byMeal(day.items);
  const dateObj = new Date(`${today}T00:00`);
  const dateShort = dateObj.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const dateLong = dateObj.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const meals = (
    <section aria-label="Meals" className="space-y-3">
      {day.items.length === 0 && !pending && (
        <div className="card p-5 text-center" style={{ ["--i" as string]: 4 }}>
          <p className="font-semibold">Nothing logged yet.</p>
          <p className="mt-1 text-sm text-ink-2">Your stomach knows something you don&apos;t.</p>
          <p className="mt-3 text-xs text-ink-3">Try “2 scoop whey”, “aaj lunch mein 3 roti aur dal”, the mic, or scan a barcode with +.</p>
        </div>
      )}
      {MEALS.map((m, idx) =>
        groups[m].items.length || pending?.meal === m ? (
          <MealCard key={m} meal={m} items={groups[m].items} kcal={groups[m].totals.calories} pendingText={pending?.meal === m ? pending.text : null} pendingPhoto={pending?.meal === m ? pending.photo : undefined} index={idx + 4} />
        ) : null,
      )}
    </section>
  );

  return (
    <div className="stagger space-y-5 lg:space-y-6">
      <header className="flex items-center justify-between gap-3" style={{ ["--i" as string]: 0 }}>
        <div>
          <p className="label">Today</p>
          <h1 className="text-lg font-bold leading-tight lg:text-3xl lg:font-extrabold lg:tracking-tight">
            <span className="lg:hidden">{dateShort}</span>
            <span className="hidden lg:inline">{dateLong}</span>
          </h1>
        </div>
        {days > 0 && (
          <span className="plunk face-yellow flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ ["--d" as string]: "3px" }}>
            <Icon.flame size={14} /> {days} day streak
          </span>
        )}
      </header>

      <NamePrompt />

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <Hero consumed={consumed.calories} target={targets?.calories ?? null} />
          {targets ? (
            <>
              <MacroBar consumed={consumed} target={targets} />
              <StatTiles consumed={consumed} target={targets} />
              <div className="hidden lg:block">
                <MicrosCard items={day.items} calories={targets.calories} sex={profile?.sex} />
              </div>
            </>
          ) : (
            <Link href="/settings" className="plunk face-card block p-4" style={{ ["--i" as string]: 2 }}>
              <p className="label">Set up</p>
              <p className="mt-1 font-bold">Add your profile to get calorie and macro targets →</p>
            </Link>
          )}
        </div>
        <div className="space-y-5">
          {targets && (
            <div className="hidden gap-5 lg:grid lg:grid-cols-2">
              <EnergySplit consumed={consumed} target={targets} />
              <MealSplit groups={groups} total={consumed.calories} />
            </div>
          )}
          <RepeatCard yesterday={yesterday} todayMeals={groups} />
          {meals}
          {targets && (
            <>
              <div className="lg:hidden">
                <MicrosCard items={day.items} calories={targets.calories} sex={profile?.sex} />
              </div>
              <div className="hidden lg:block">
                <WeekStrip today={today} fallback={targets} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ name prompt ------------------------------ */

const PROMPT_KEY = "bite-name-prompt";
const readDismissed = () => {
  try {
    return localStorage.getItem(PROMPT_KEY) === "1";
  } catch {
    return false;
  }
};
const noopSub = () => () => {};

/** Once, on Today: ask what to call you. */
function NamePrompt() {
  const { name, setName } = useApp();
  const stored = useSyncExternalStore(noopSub, readDismissed, () => true);
  const [hidden, setHidden] = useState(false);
  const [value, setValue] = useState("");
  if (name || stored || hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(PROMPT_KEY, "1");
    } catch {
      /* private mode: just hide for now */
    }
    setHidden(true);
  };
  return (
    <form
      className="card flex items-end gap-2 border-l-[6px] border-l-violet p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const r = await setName(value);
        if (r.ok) dismiss();
      }}
    >
      <label className="field compact flex-1">
        <span>What should we call you?</span>
        <input value={value} maxLength={40} autoComplete="given-name" onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="submit" className="pop-btn sm lime shrink-0" disabled={!value.trim()}>
        Save
      </button>
      <button type="button" onClick={dismiss} className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center text-ink-3 hover:text-ink" aria-label="Not now">
        <Icon.close size={16} />
      </button>
    </form>
  );
}

/* ------------------------------ desktop charts ------------------------------ */

function EnergySplit({ consumed, target }: { consumed: Targets; target: Targets }) {
  const segs = [
    { key: "protein", label: "Protein", value: consumed.protein_g * 4, color: "var(--protein)", detail: `${fmtG(consumed.protein_g)} of ${target.protein_g} g` },
    { key: "carbs", label: "Carbs", value: consumed.carbs_g * 4, color: "var(--carbs)", detail: `${fmtG(consumed.carbs_g)} of ${target.carbs_g} g` },
    { key: "fat", label: "Fat", value: consumed.fat_g * 9, color: "var(--fat)", detail: `${fmtG(consumed.fat_g)} of ${target.fat_g} g` },
  ];
  const empty = segs.every((x) => x.value === 0);
  return (
    <section className="plunk face-card p-4" style={{ ["--d" as string]: "4px" }}>
      <p className="label">Where today&apos;s calories came from</p>
      <div className="mt-3">
        {empty ? (
          <p className="py-10 text-center text-sm text-ink-3">Log something to see the split.</p>
        ) : (
          <Donut
            segments={segs}
            size={132}
            thickness={20}
            caption="Share of today's calories by macro"
            center={
              <>
                <span className="num text-xl font-extrabold">{fmtInt(consumed.calories)}</span>
                <span className="label !text-[10px]">kcal</span>
              </>
            }
          />
        )}
      </div>
    </section>
  );
}

function MealSplit({ groups, total }: { groups: ReturnType<typeof byMeal>; total: number }) {
  return (
    <section className="plunk face-card p-4" style={{ ["--d" as string]: "4px" }}>
      <p className="label">Calories by meal · kcal</p>
      <div className="mt-3">
        {total === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">No meals yet.</p>
        ) : (
          <BarList
            max={total}
            rows={MEALS.map((m) => ({
              key: m,
              label: (
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">{MEAL_STYLE[m].glyph}</span>
                  {MEAL_STYLE[m].label}
                </span>
              ),
              value: groups[m].totals.calories,
              display: `${fmtInt(groups[m].totals.calories)} · ${Math.round((groups[m].totals.calories / total) * 100)}%`,
              color: MEAL_STYLE[m].color,
            }))}
          />
        )}
      </div>
    </section>
  );
}

/** Last 7 days at a glance (desktop). */
function WeekStrip({ today, fallback }: { today: string; fallback: Targets }) {
  const { summaries } = useApp();
  const dates = lastNDates(today, 7);
  const max = Math.max(fallback.calories * 1.3, ...dates.map((d) => summaries[d]?.calories ?? 0));
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <p className="label">Last 7 days</p>
        <Link href="/progress" className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 hover:text-ink">
          Progress →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-2">
        {dates.map((d) => {
          const r = summaries[d];
          const c = r?.count ? classifyDay(r, r.target ?? fallback) : null;
          const color = c ? { hit: "var(--ok)", over: "var(--over)", under: "var(--under)", low: "var(--ink-3)" }[c.status] : "var(--line-soft)";
          return (
            <div key={d} className="flex flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end bg-elevated/50">
                <div className={`w-full ${c?.status === "over" ? "hatch" : ""}`} style={{ height: `${r?.count ? Math.max(4, (r.calories / max) * 100) : 2}%`, backgroundColor: color }} />
              </div>
              <span className="num text-[11px] font-bold">{r?.count ? fmtInt(r.calories) : "—"}</span>
              <span className="text-[10px] uppercase text-ink-3">
                {new Date(`${d}T00:00`).toLocaleDateString("en-IN", { weekday: "short" })} {c ? STATUS_META[c.status].glyph : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** "Same breakfast as yesterday?" for the current meal slot, if you haven't logged it yet. */
function RepeatCard({ yesterday, todayMeals }: { yesterday: DayLog | null; todayMeals: ReturnType<typeof byMeal> }) {
  const { repeatItems } = useApp();
  const meal = mealForTime();
  const items = yesterday?.items.filter((i) => i.meal === meal) ?? [];
  if (!items.length || todayMeals[meal].items.length) return null;
  const style = MEAL_STYLE[meal];
  const label = style.label.toLowerCase();
  return (
    <button
      className="card flex w-full items-center gap-3 border-l-[6px] p-3 text-left hover:bg-elevated"
      style={{ borderLeftColor: style.color, ["--i" as string]: 4 }}
      onClick={() => repeatItems(items, `Same ${label} as yesterday`, meal)}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Same {label} as yesterday?</span>
        <span className="block truncate text-xs text-ink-2">
          {fmtInt(sumItems(items).calories)} kcal · {items.map((i) => i.name).join(", ")}
        </span>
      </span>
      <span className="pop-btn sm lime shrink-0" aria-hidden="true">
        Repeat
      </span>
    </button>
  );
}

function Hero({ consumed, target }: { consumed: number; target: number | null }) {
  const left = target === null ? consumed : target - consumed;
  const over = target !== null && left < 0;
  const shown = useCountUp(Math.abs(left));
  const pct = target ? Math.min(1, consumed / target) : 0;
  const face = target === null ? "face-violet" : over ? "face-over" : "face-lime";
  return (
    <section className={`plunk ${face} p-5`} style={{ ["--i" as string]: 1, ["--d" as string]: "6px" }} aria-live="polite">
      <div className="flex items-start justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">
          {over && <Icon.alert size={12} />}
          {target === null ? "Kcal eaten" : over ? "Kcal over" : "Kcal left"}
        </p>
        {target !== null && (
          <p className="num text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">{Math.round((consumed / target) * 100)}% eaten</p>
        )}
      </div>
      <p className="hero-num num mt-3 text-[88px]">{fmtInt(shown)}</p>
      {target !== null && (
        <>
          <p className="num mt-2 text-sm font-semibold opacity-80">
            {fmtInt(consumed)} eaten of {fmtInt(target)}
          </p>
          <div className="mt-4 h-2 w-full bg-black/15" role="progressbar" aria-label="Calories eaten" aria-valuenow={consumed} aria-valuemin={0} aria-valuemax={target}>
            <div className={`bar-anim h-full bg-[#0d0d0d] ${over ? "hatch" : ""}`} style={{ width: `${pct * 100}%` }} />
          </div>
        </>
      )}
      {over && <p className="mt-3 text-sm font-bold">Over by {fmtInt(-left)} kcal. Not a crime. Tomorrow&apos;s a new page.</p>}
    </section>
  );
}

function MacroBar({ consumed, target }: { consumed: Targets; target: Targets }) {
  // Segments are each macro's calories as a share of the calorie target.
  const kcal = { protein: consumed.protein_g * 4, carbs: consumed.carbs_g * 4, fat: consumed.fat_g * 9 };
  const total = Math.max(target.calories, kcal.protein + kcal.carbs + kcal.fat);
  const split = macroSplit(consumed);
  const segs = [
    { key: "protein", label: "Protein", color: "var(--protein)", w: kcal.protein / total, pct: split.protein },
    { key: "carbs", label: "Carbs", color: "var(--carbs)", w: kcal.carbs / total, pct: split.carbs },
    { key: "fat", label: "Fat", color: "var(--fat)", w: kcal.fat / total, pct: split.fat },
  ];
  return (
    <section style={{ ["--i" as string]: 2 }}>
      <div className="flex h-4 w-full gap-[2px] border border-line bg-elevated p-[2px]" role="img" aria-label={segs.map((s) => `${s.label} ${Math.round(s.pct * 100)}%`).join(", ")}>
        {segs.map((s) => (
          <div key={s.key} className="bar-anim h-full" style={{ width: `${s.w * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {segs.map((s) => (
          <span key={s.key} className="num flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
            <span className="h-2.5 w-2.5" style={{ background: s.color }} aria-hidden="true" />
            {s.label} {Math.round(s.pct * 100)}%
          </span>
        ))}
      </div>
    </section>
  );
}

function StatTiles({ consumed, target }: { consumed: Targets; target: Targets }) {
  const tiles = [
    { label: "Protein", v: consumed.protein_g, t: target.protein_g, color: "var(--protein)", min: true },
    { label: "Carbs", v: consumed.carbs_g, t: target.carbs_g, color: "var(--carbs)", min: false },
    { label: "Fat", v: consumed.fat_g, t: target.fat_g, color: "var(--fat)", min: false },
  ];
  const rem = remaining(target, consumed);
  const proteinHit = consumed.protein_g >= target.protein_g;
  return (
    <section className="space-y-3" style={{ ["--i" as string]: 3 }}>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((s) => {
          const over = !s.min && s.v > s.t * 1.1;
          return (
            <div key={s.label} className="card border-t-4 p-3" style={{ borderTopColor: s.color }}>
              <p className="label flex items-center justify-between">
                {s.label}
                {over && <span className="text-over" aria-label="over target">↑</span>}
              </p>
              <p className="num mt-1 text-2xl font-extrabold tracking-tight">
                {fmtG(s.v)}
                <span className="text-sm font-semibold text-ink-3"> / {s.t}g</span>
              </p>
              <Progress value={s.v} max={s.t} color={s.color} label={`${s.label} progress`} />
            </div>
          );
        })}
      </div>
      <div className="card flex items-center gap-3 p-3">
        <p className="label w-14">Fibre</p>
        <div className="flex-1">
          <Progress value={consumed.fibre_g} max={target.fibre_g} color="var(--fibre)" label="Fibre progress" />
        </div>
        <p className="num text-sm font-bold">
          {fmtG(consumed.fibre_g)}
          <span className="text-ink-3"> / {target.fibre_g}g</span>
        </p>
      </div>
      <p className="num text-sm text-ink-2" aria-live="polite">
        {proteinHit ? (
          <span className="inline-flex items-center gap-1 font-semibold text-ok">
            <Icon.check size={14} /> Protein: sorted.
          </span>
        ) : (
          <>
            <strong className="text-ink">{fmtG(rem.protein_g)}g</strong> protein to go
          </>
        )}
      </p>
    </section>
  );
}

function Progress({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max * 1.1;
  return (
    <div className="mt-2 h-1.5 w-full bg-elevated" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <div className={`bar-anim h-full ${over ? "hatch" : ""}`} style={{ width: `${pct * 100}%`, backgroundColor: over ? "var(--over)" : color }} />
    </div>
  );
}

function MealCard({ meal, items, kcal, pendingText, pendingPhoto, index }: { meal: Meal; items: LogItem[]; kcal: number; pendingText: string | null; pendingPhoto?: string; index: number }) {
  const [open, setOpen] = useState(true);
  const { deleteItem, setSheet } = useApp();
  const id = `meal-${meal}`;
  const style = MEAL_STYLE[meal];
  return (
    <div className="plunk face-card" style={{ ["--i" as string]: index, ["--d" as string]: "4px" }}>
      <div className="flex items-center">
      <button className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 pr-2 text-left" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center text-lg font-bold text-[#0d0d0d]" style={{ background: style.color }} aria-hidden="true">
            {style.glyph}
          </span>
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.1em]">{style.label}</span>
            <span className="text-xs text-ink-2">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="num text-3xl font-extrabold tracking-tight">
            {fmtInt(kcal)}
            <span className="ml-1 text-xs font-semibold text-ink-3">kcal</span>
          </span>
          <span className={`text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}>
            <Icon.chevron size={18} />
          </span>
        </span>
      </button>
      {items.length > 0 && (
        <button
          className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-ink-3 hover:text-ink"
          onClick={() => setSheet({ kind: "saveMeal", items: items.map((i) => ParsedItemSchema.parse(i)), name: `My ${style.label.toLowerCase()}` })}
          aria-label={`Save this ${style.label.toLowerCase()} as a meal`}
          title="Save as meal"
        >
          <Icon.bookmark size={16} />
        </button>
      )}
      </div>
      {open && (
        <ul id={id} className="border-t border-line-soft">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-1 border-b border-line-soft py-1 pl-1 pr-4 last:border-b-0">
              <button className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2 text-left hover:bg-elevated" onClick={() => setSheet({ kind: "edit", item: i })} aria-label={`Edit ${i.name}, ${Math.round(i.calories)} kcal`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.name}</p>
                <p className="num mt-0.5 text-xs text-ink-2">
                  {fmtG(i.quantity)} {i.unit} · <span className="text-protein">P</span> {fmtG(i.protein_g)} · <span className="text-carbs">C</span> {fmtG(i.carbs_g)} ·{" "}
                  <span className="text-fat">F</span> {fmtG(i.fat_g)}
                </p>
                {(i.assumed || i.source === "llm") && (
                  <div className="mt-1.5 flex items-center gap-2">
                    {i.source === "llm" && <ConfidenceDot level={i.confidence} />}
                    {i.assumed && <span className="tag text-warn">Assumed</span>}
                  </div>
                )}
              </div>
              <span className="num pt-0.5 font-bold">{fmtInt(i.calories)}</span>
              </button>
              <button onClick={() => deleteItem(i.id)} className="-mr-2 mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center text-ink-3 hover:text-over" aria-label={`Delete ${i.name}`}>
                <Icon.trash size={16} />
              </button>
            </li>
          ))}
          {pendingText && (
            <li className="flex items-center gap-3 px-4 py-3" aria-live="polite">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              {pendingPhoto && <img src={pendingPhoto} alt="" className="pulse h-10 w-10 object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-2">“{pendingText}”</p>
                <div className="pulse mt-2 h-1.5 w-2/3 bg-elevated" />
              </div>
              <span className="label">Estimating…</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
