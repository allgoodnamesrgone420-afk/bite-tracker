"use client";
/**
 * Small SVG charts in the app's NeoPop style: flat fills, square ends, 2px
 * surface gaps between segments, hover/tap readouts, and a table for screen
 * readers. Colors carry identity only; values and labels stay in ink.
 */
import { useRef, useState } from "react";
import type { TrendPoint } from "@/lib/weight";
import { fmtInt, useElementWidth } from "./ui";

/* ---------------------------------- donut ---------------------------------- */

export type Segment = { key: string; label: string; value: number; color: string; detail?: string };

const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;

function arcPath(cx: number, cy: number, r: number, t: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r - t, a1);
  const [x3, y3] = polar(cx, cy, r - t, a0);
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r - t} ${r - t} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** Part-to-whole for a few parts (macro energy split). Legend doubles as the direct labels. */
export function Donut({ segments, size = 148, thickness = 22, center, caption }: { segments: Segment[]; size?: number; thickness?: number; center?: React.ReactNode; caption: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = size / 2;
  const gap = total > 0 && segments.filter((x) => x.value > 0).length > 1 ? 0.035 : 0; // ~2px surface gap
  const sweeps = segments.map((s) => (total > 0 ? (Math.max(0, s.value) / total) * Math.PI * 2 : 0));
  const arcs = segments.map((s, i) => {
    const start = -Math.PI / 2 + sweeps.slice(0, i).reduce((x, y) => x + y, 0);
    return { ...s, a0: start + gap / 2, a1: start + sweeps[i] - gap / 2, pct: total ? s.value / total : 0 };
  });
  const focus = arcs.find((x) => x.key === hover);

  return (
    <figure className="flex flex-wrap items-center justify-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${caption}: ${arcs.map((x) => `${x.label} ${Math.round(x.pct * 100)}%`).join(", ")}`}>
          <circle cx={r} cy={r} r={r - thickness / 2} fill="none" stroke="var(--line-soft)" strokeWidth={thickness} />
          {arcs.map((x) =>
            x.a1 > x.a0 ? (
              <path
                key={x.key}
                d={arcPath(r, r, r, thickness, x.a0, x.a1)}
                fill={x.color}
                opacity={hover && hover !== x.key ? 0.35 : 1}
                onMouseEnter={() => setHover(x.key)}
                onMouseLeave={() => setHover(null)}
                className="transition-opacity"
              />
            ) : null,
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {focus ? (
            <>
              <span className="num text-xl font-extrabold">{Math.round(focus.pct * 100)}%</span>
              <span className="label !text-[10px]">{focus.label}</span>
            </>
          ) : (
            center
          )}
        </div>
      </div>
      <ul className="min-w-[150px] flex-1 space-y-1.5">
        {arcs.map((x) => (
          <li key={x.key}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 text-left text-sm ${hover && hover !== x.key ? "opacity-50" : ""}`}
              onMouseEnter={() => setHover(x.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(x.key)}
              onBlur={() => setHover(null)}
            >
              <span className="h-3 w-3 shrink-0" style={{ background: x.color }} aria-hidden="true" />
              <span className="flex-1 truncate font-semibold">{x.label}</span>
              <span className="num font-bold">{Math.round(x.pct * 100)}%</span>
            </button>
            {x.detail && <p className="num pl-5 text-[11px] text-ink-3">{x.detail}</p>}
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/* --------------------------------- bar list --------------------------------- */

export type BarRow = { key: string; label: React.ReactNode; value: number; display: string; color?: string; sub?: string };

/** Labeled horizontal bars (meal split, top foods). Identity is in the label, never color alone. */
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-semibold">{r.label}</span>
            <span className="num shrink-0 text-xs text-ink-2">{r.display}</span>
          </div>
          <div className="mt-1 h-2 bg-elevated">
            <div className="bar-anim h-full" style={{ width: `${Math.min(100, (r.value / m) * 100)}%`, background: r.color ?? "var(--ink-3)" }} />
          </div>
          {r.sub && <p className="mt-0.5 text-[11px] text-ink-3">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- weight chart ------------------------------- */

/** Weigh-ins as dots, the smoothed trend as a line; crosshair readout on hover/tap. */
export function WeightChart({ series, height = 170 }: { series: TrendPoint[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const [idx, setIdx] = useState<number | null>(null);
  if (series.length === 0) return null;

  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const vals = series.flatMap((p) => (p.kg !== null ? [p.kg, p.trend] : [p.trend]));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const padY = (hi - lo) * 0.12;
  lo -= padY;
  hi += padY;
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * h;
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.trend).toFixed(1)}`).join("");
  const ticks = [lo + padY, (lo + hi) / 2, hi - padY];
  const focus = idx !== null ? series[idx] : series[series.length - 1];
  const lastWeighIn = [...series].reverse().find((p) => p.kg !== null);

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.round(((clientX - rect.left - pad.l) / w) * (series.length - 1));
    setIdx(Math.max(0, Math.min(series.length - 1, i)));
  };

  return (
    <figure>
      <p className="num h-5 truncate text-sm">
        <span className="font-bold">{new Date(`${focus.date}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        {" · "}trend {focus.trend.toFixed(1)} kg
        {focus.kg !== null && <span className="text-ink-2"> · weighed {focus.kg.toFixed(1)} kg</span>}
      </p>
      <div
        ref={box}
        className="relative mt-2 touch-pan-y"
        style={{ height }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setIdx(null)}
      >
        <svg width={width} height={height} role="img" aria-label={`Weight trend: ${series[0].trend.toFixed(1)} to ${series[series.length - 1].trend.toFixed(1)} kg`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="num fill-[var(--ink-3)] text-[10px]">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
          {series.map((p, i) =>
            p.kg !== null ? <circle key={p.date} cx={x(i)} cy={y(p.kg)} r={4} fill="var(--violet)" stroke="var(--surface)" strokeWidth={2} /> : null,
          )}
          {idx !== null && <line x1={x(idx)} x2={x(idx)} y1={pad.t} y2={height - pad.b} stroke="var(--ink-3)" strokeDasharray="3 3" />}
          <text x={pad.l} y={height - 4} className="num fill-[var(--ink-3)] text-[10px]">
            {new Date(`${series[0].date}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </text>
          <text x={width - pad.r} y={height - 4} textAnchor="end" className="num fill-[var(--ink-3)] text-[10px]">
            {new Date(`${series[series.length - 1].date}T00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </text>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-ink" aria-hidden="true" /> Trend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet" aria-hidden="true" /> Weigh-in
        </span>
      </div>
      <table className="sr-only">
        <caption>Weigh-ins and trend</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Weighed</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {series
            .filter((p) => p.kg !== null)
            .map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{p.kg}</td>
                <td>{p.trend}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {lastWeighIn && <figcaption className="sr-only">Last weigh-in {lastWeighIn.kg} kg on {lastWeighIn.date}</figcaption>}
    </figure>
  );
}

export const kcal = (n: number) => `${fmtInt(n)} kcal`;
