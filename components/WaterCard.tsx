"use client";
import { useState } from "react";
import { GLASS_ML, fmtLitres, waterTarget } from "@/lib/water";
import { useApp } from "./AppProvider";
import { Burst } from "./Burst";
import { Icon, useCountUp } from "./ui";

/** Today's water: a glass that fills as you log, against a target from your weight. */
export function WaterCard({ date, weightKg, index }: { date: string; weightKg?: number; index?: number }) {
  const { water, logWater } = useApp();
  const ml = water[date]?.ml ?? 0;
  const target = waterTarget(weightKg);
  const glasses = Math.round(ml / GLASS_ML);
  const goal = Math.round(target / GLASS_ML);
  const pct = Math.min(1, ml / target);
  const done = ml >= target;
  const shown = useCountUp(ml);
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
          <p className="label flex items-center gap-1.5">
            Water
            {done && (
              <span key={`ok-${splash.n}`} className="pop-in flex items-center gap-0.5 text-water">
                <Icon.check size={12} /> Goal
              </span>
            )}
          </p>
          <p className="num mt-0.5 text-2xl font-extrabold tracking-tight" aria-live="polite">
            {fmtLitres(shown)}
            <span className="text-sm font-semibold text-ink-3"> of {fmtLitres(target)}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
            {Array.from({ length: Math.max(goal, glasses) }, (_, i) => (
              <span
                key={i}
                className={`h-3 w-2.5 border transition-colors duration-300 ${i < glasses ? "border-water bg-water" : "border-line bg-transparent"}`}
                style={{ transitionDelay: `${Math.max(0, i - glasses + 1) * 30}ms` }}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="press flex h-11 w-11 shrink-0 items-center justify-center border border-line text-lg font-bold text-ink-2 hover:text-ink disabled:opacity-30"
              onClick={() => add(-GLASS_ML)}
              disabled={ml === 0}
              aria-label="Remove a glass of water"
            >
              −
            </button>
            <button
              type="button"
              className="pop-btn water sm flex-1"
              onClick={() => add(GLASS_ML)}
              aria-label={`Add a glass of water, ${GLASS_ML} ml. ${glasses} of ${goal} glasses so far`}
            >
              <Icon.plus size={16} /> Glass <span className="font-semibold opacity-70">{GLASS_ML} ml</span>
            </button>
          </div>
        </div>
      </div>
      {splash.hitGoal && <Burst key={splash.n} color="var(--water)" className="left-12 top-1/2" />}
    </section>
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
