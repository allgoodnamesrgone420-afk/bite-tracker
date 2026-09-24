"use client";
import { MICRO_KEYS, MICRO_META, microStatus, microTargets, sumMicros } from "@/lib/micros";
import type { LogItem, Profile } from "@/lib/schemas";
import { fmtG, fmtInt } from "./ui";

/** Sodium, sugar and sat fat vs daily limits; calcium and iron vs daily needs. */
export function MicrosCard({ items, calories, sex, title = "Micronutrients today" }: { items: LogItem[]; calories: number; sex?: Profile["sex"]; title?: string }) {
  const m = sumMicros(items);
  const t = microTargets(calories, sex);
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">{title}</p>
        {m.count > 0 && m.covered < m.count && <p className="text-[10px] text-ink-3">{m.covered} of {m.count} items have micro data</p>}
      </div>
      {m.covered === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{items.length ? "These items were logged before micronutrients were tracked." : "Sodium, sugar, sat. fat, calcium and iron show up here as you log."}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {MICRO_KEYS.map((k) => {
            const meta = MICRO_META[k];
            const v = m.total[k];
            const st = microStatus(k, v, t[k]);
            const flag = st === "high" ? { text: "over", cls: "text-over" } : st === "low" && meta.kind === "min" ? { text: "low", cls: "text-ink-3" } : null;
            return (
              <li key={k} className="grid grid-cols-[64px_1fr_auto] items-center gap-2" title={meta.note}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{meta.label}</span>
                <div className="h-1.5 bg-elevated">
                  <div className={`h-full ${st === "high" ? "hatch" : ""}`} style={{ width: `${Math.min(100, (v / t[k]) * 100)}%`, backgroundColor: st === "high" ? "var(--over)" : "var(--ink-3)" }} />
                </div>
                <span className="num text-right text-xs">
                  {fmtG(v)}
                  <span className="text-ink-3">
                    {" "}
                    / {meta.kind === "limit" ? "<" : ""}
                    {fmtInt(t[k])} {meta.unit}
                  </span>
                  {flag && <span className={`ml-1 font-bold ${flag.cls}`}>{flag.text}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
