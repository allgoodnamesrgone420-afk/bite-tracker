"use client";
import { useState } from "react";
import { SERVINGS, fmtLitres, servingOf, waterGoal, waterTarget } from "@/lib/water";
import { useApp } from "./AppProvider";
import { Burst } from "./Burst";
import { Icon, useCountUp } from "./ui";

/** Today's water: a glass that fills as you log, against your goal. Edit sets the tap size, the goal and today's total. */
export function WaterCard({ date, weightKg, index }: { date: string; weightKg?: number; index?: number }) {
  const { water, logWater, profile } = useApp();
  const ml = water[date]?.ml ?? 0;
  const target = waterGoal(profile, weightKg);
  const serving = servingOf(profile);
  // "Bottle 500 ml" for a quick pick, just "330 ml" for your own size.
  const named = SERVINGS.find((x) => x.ml === serving)?.label;
  const taps = Math.round(ml / serving);
  const goalTaps = Math.ceil(target / serving);
  const pct = Math.min(1, ml / target);
  const done = ml >= target;
  const shown = useCountUp(ml);
  const [editing, setEditing] = useState(false);
  // Bumped on every add so the drop (and, at the goal, the burst) replays.
  const [splash, setSplash] = useState<{ n: number; hitGoal: boolean }>({ n: 0, hitGoal: false });

  const add = (delta: number) => {
    if (delta > 0) {
      navigator.vibrate?.(8);
      setSplash((s) => ({ n: s.n + 1, hitGoal: ml < target && ml + delta >= target }));
    }
    void logWater(date, delta);
  };

  return (
    <section className={`card relative overflow-hidden p-4 ${done ? "border-water" : ""}`} style={{ ["--i" as string]: index }} aria-label="Water">
      <div className="flex items-center gap-4">
        <Glass pct={pct} splash={splash.n} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="label flex items-center gap-1.5">
              Water
              {done && (
                <span key={`ok-${splash.n}`} className="pop-in flex items-center gap-0.5 text-water">
                  <Icon.check size={12} /> Goal
                </span>
              )}
            </p>
            <button
              type="button"
              className={`press -my-1 -mr-1 flex h-8 items-center gap-1 px-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${editing ? "text-ink" : "text-ink-3 hover:text-ink"}`}
              onClick={() => setEditing((e) => !e)}
              aria-expanded={editing}
              aria-controls="water-edit"
            >
              <Icon.edit size={13} /> {editing ? "Done" : "Edit"}
            </button>
          </div>
          <p className="num mt-0.5 text-2xl font-extrabold tracking-tight" aria-live="polite">
            {fmtLitres(shown)}
            <span className="text-sm font-semibold text-ink-3"> of {fmtLitres(target)}</span>
          </p>
          {/* One pip per tap up to the goal; a plain bar when that would be too many to read. */}
          {goalTaps <= 16 ? (
            <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
              {Array.from({ length: Math.max(goalTaps, taps) }, (_, i) => (
                <span
                  key={i}
                  className={`h-3 w-2.5 border transition-colors duration-300 ${i < taps ? "border-water bg-water" : "border-line bg-transparent"}`}
                  style={{ transitionDelay: `${Math.max(0, i - taps + 1) * 30}ms` }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-2 h-2 bg-elevated" aria-hidden="true">
              <div className="bar-anim h-full bg-water" style={{ width: `${pct * 100}%` }} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="press flex h-11 w-11 shrink-0 items-center justify-center border border-line text-lg font-bold text-ink-2 hover:text-ink disabled:opacity-30"
              onClick={() => add(-Math.min(serving, ml))}
              disabled={ml === 0}
              aria-label={`Remove ${serving} ml of water`}
            >
              −
            </button>
            <button
              type="button"
              className="pop-btn water sm min-w-0 flex-1"
              onClick={() => add(serving)}
              aria-label={`Add ${named ? `a ${named.toLowerCase()} of water, ` : ""}${serving} ml. ${fmtLitres(ml)} of ${fmtLitres(target)} so far`}
            >
              <Icon.plus size={16} /> {named && <span className="truncate">{named}</span>} <span className={`shrink-0 font-semibold ${named ? "opacity-70" : ""}`}>{serving} ml</span>
            </button>
          </div>
        </div>
      </div>
      {editing && <WaterEditor date={date} ml={ml} weightKg={weightKg} />}
      {splash.hitGoal && <Burst key={splash.n} color="var(--water)" className="left-12 top-1/2" />}
    </section>
  );
}

const STEP = 250;
const parseLitres = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 1000) : NaN;
};

/** Tap size, daily goal, and today's exact total. The first two live on your profile, so they sync. */
function WaterEditor({ date, ml, weightKg }: { date: string; ml: number; weightKg?: number }) {
  const { profile, saveWaterPrefs, setWater, showToast } = useApp();
  const serving = servingOf(profile);
  const goal = waterGoal(profile, weightKg);
  const fromWeight = waterTarget(weightKg);
  const custom = profile?.waterGoalMl !== undefined;
  const isPick = SERVINGS.some((s) => s.ml === serving);
  const [other, setOther] = useState(isPick ? "" : String(serving));
  const [total, setTotal] = useState("");

  const setServing = (v: number) => void saveWaterPrefs({ waterServingMl: v === 250 ? undefined : v });
  const setGoal = (v: number | undefined) => void saveWaterPrefs({ waterGoalMl: v });

  return (
    <div id="water-edit" className="rise-in mt-4 space-y-4 border-t border-line pt-4">
      {!profile && <p className="text-xs text-warn">Add your profile in Settings to change the tap size and goal. You can still fix today&apos;s total.</p>}

      <fieldset disabled={!profile}>
        <legend className="label">Each tap adds</legend>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {SERVINGS.map((s) => (
            <button
              key={s.ml}
              type="button"
              aria-pressed={serving === s.ml}
              onClick={() => {
                setOther("");
                setServing(s.ml);
              }}
              className={`press flex flex-col items-center border py-1.5 disabled:opacity-40 ${serving === s.ml ? "border-water bg-water text-on-accent" : "border-line text-ink-2 hover:text-ink"}`}
            >
              <span className="text-xs font-bold">{s.label}</span>
              <span className="num text-[10px] opacity-80">{s.ml} ml</span>
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Math.round(Number(other));
            if (v >= 50 && v <= 2000) setServing(v);
            else showToast("Pick an amount between 50 and 2,000 ml.");
          }}
        >
          <label className="field compact flex-1">
            <span>Other amount (ml)</span>
            <input inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="e.g. 330" />
          </label>
          <button type="submit" className="pop-btn sm ghost mb-1 shrink-0" disabled={!other || Number(other) === serving}>
            Use
          </button>
        </form>
      </fieldset>

      <fieldset disabled={!profile}>
        <legend className="label">Daily goal</legend>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="press flex h-11 w-11 items-center justify-center border border-line text-lg font-bold disabled:opacity-30"
            onClick={() => setGoal(Math.max(500, goal - STEP))}
            disabled={goal <= 500}
            aria-label="Lower the goal by 250 ml"
          >
            −
          </button>
          <p className="num flex-1 text-center text-xl font-extrabold">{fmtLitres(goal)}</p>
          <button
            type="button"
            className="press flex h-11 w-11 items-center justify-center border border-line text-lg font-bold disabled:opacity-30"
            onClick={() => setGoal(Math.min(8000, goal + STEP))}
            disabled={goal >= 8000}
            aria-label="Raise the goal by 250 ml"
          >
            +
          </button>
        </div>
        <p className="mt-1.5 text-xs text-ink-3">
          {custom ? (
            <>
              Your own goal.{" "}
              <button type="button" className="font-semibold text-ink-2 underline decoration-water decoration-2 underline-offset-4 hover:text-ink" onClick={() => setGoal(undefined)}>
                Use {fmtLitres(fromWeight)} from my weight
              </button>
            </>
          ) : (
            "From your weight (about 35 ml per kg). Change it if your doctor or routine says otherwise."
          )}
        </p>
      </fieldset>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseLitres(total);
          if (!(v >= 0 && v <= 10_000)) return showToast("Enter litres between 0 and 10, e.g. 1.5");
          void setWater(date, v);
          setTotal("");
          showToast(`Today's water set to ${fmtLitres(v)}`);
        }}
      >
        <p className="label">Fix today&apos;s total</p>
        <div className="mt-2 flex items-end gap-2">
          <label className="field compact flex-1">
            <span>Litres (now {fmtLitres(ml)})</span>
            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} placeholder={String(ml / 1000)} />
          </label>
          <button type="submit" className="pop-btn sm water mb-1 shrink-0" disabled={!total}>
            Set
          </button>
        </div>
      </form>
    </div>
  );
}

/** A tumbler that fills to `pct`, with a rolling surface and a drop that falls in on each add. */
function Glass({ pct, splash }: { pct: number; splash: number }) {
  return (
    <div className="relative h-24 w-16 shrink-0" aria-hidden="true">
      <div className="absolute inset-0 bg-elevated" style={{ clipPath: "polygon(0 0, 100% 0, 86% 100%, 14% 100%)" }}>
        <div className="water-level absolute inset-x-0 bottom-0 bg-water/80" style={{ height: `${Math.max(pct * 100, pct > 0 ? 6 : 0)}%` }}>
          {pct > 0 && pct < 1 && (
            <svg className="water-wave absolute -top-2 left-0 h-3 w-[200%]" viewBox="0 0 120 10" preserveAspectRatio="none">
              <path d="M0 5 Q 7.5 0 15 5 T 30 5 T 45 5 T 60 5 T 75 5 T 90 5 T 105 5 T 120 5 V10 H0 Z" fill="var(--water)" fillOpacity="0.8" />
            </svg>
          )}
        </div>
      </div>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 64 96" preserveAspectRatio="none">
        <path d="M1 1 H63 L55 95 H9 Z" fill="none" stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {splash > 0 && <span key={splash} className="water-drop absolute left-1/2 top-0 h-3 w-2 rounded-b-full bg-water" />}
    </div>
  );
}
