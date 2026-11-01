"use client";
import { useState } from "react";
import { MICRO_KEYS, MICRO_META, microSources, microStatus, microTargets, sumMicros, type MicroKey } from "@/lib/micros";
import type { LogItem, Profile } from "@/lib/schemas";
import { Icon, fmtG, fmtInt } from "./ui";

/**
 * Sodium, sugar and sat fat vs daily limits; calcium and iron vs daily needs. Tap a row to see which foods it came from.
 * `compact`: no card of its own and the bar on its own line, for narrow panels.
 */
export function MicrosCard({ items, calories, sex, title = "Micronutrients today", compact = false }: { items: LogItem[]; calories: number; sex?: Profile["sex"]; title?: string; compact?: boolean }) {
  const [open, setOpen] = useState<MicroKey | null>(null);
  const m = sumMicros(items);
  const t = microTargets(calories, sex);
  return (
    <section className={compact ? "border-t border-line pt-3" : "card p-4"}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">{title}</p>
        {m.count > 0 && m.covered < m.count && <p className="text-[10px] text-ink-3">{m.covered} of {m.count} items have micro data</p>}
      </div>
      {m.covered === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{items.length ? "These items were logged before micronutrients were tracked." : "Sodium, sugar, sat. fat, calcium and iron show up here as you log."}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1">
            {MICRO_KEYS.map((k) => {
              const meta = MICRO_META[k];
              const v = m.total[k];
              const st = microStatus(k, v, t[k]);
              const flag = st === "high" ? { text: "over", cls: "text-over" } : st === "low" && meta.kind === "min" ? { text: "low", cls: "text-ink-3" } : null;
              const isOpen = open === k;
              const sources = isOpen ? microSources(items, k) : [];
              return (
                <li key={k}>
                  <button
                    type="button"
                    className={`-mx-1.5 grid w-[calc(100%+12px)] items-center gap-x-2 px-1.5 py-1 text-left hover:bg-elevated ${compact ? "grid-cols-[1fr_auto_14px] gap-y-1" : "grid-cols-[64px_1fr_auto_14px]"}`}
                    title={meta.note}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : k)}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{meta.label}</span>
                    <div className={`h-1.5 bg-elevated ${compact ? "order-last col-span-3" : ""}`}>
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
                    <span className={`text-ink-3 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
                      <Icon.chevron size={14} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className={`mb-1 mt-0.5 border-l-2 border-line pl-2 ${compact ? "" : "ml-[72px]"}`}>
                      {sources.length ? (
                        <ul className="space-y-0.5">
                          {sources.map((s) => (
                            <li key={s.name} className="num flex justify-between gap-2 text-xs">
                              <span className="truncate text-ink-2">{s.name}</span>
                              <span className="shrink-0">
                                {fmtG(s.value)} {meta.unit} <span className="text-ink-3">· {Math.round(s.share * 100)}%</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-ink-3">None of the logged foods have any.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] text-ink-3">Tap a nutrient to see which foods it came from.</p>
        </>
      )}
    </section>
  );
}
