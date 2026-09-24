"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "lime" | "accent" | "yellow" | "ghost" | "danger";

export function PopButton({
  variant = "primary",
  size,
  block,
  className = "",
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm"; block?: boolean }) {
  const cls = ["pop-btn", variant !== "primary" && variant, size, block && "wide", className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      {...rest}
      className={cls}
      onClick={(e) => {
        navigator.vibrate?.(10);
        onClick?.(e);
      }}
    />
  );
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animates from the previous value to the new one (ease-out, ~400ms). */
export function useCountUp(target: number, duration = 400): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || reducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);
  return value;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-IN");
export const fmtG = (n: number) => (Math.abs(n) >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

/* Minimal inline icons (stroke = currentColor), aria-hidden by default. */
const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="square" aria-hidden="true">
    {children}
  </svg>
);
export const Icon = {
  send: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  plus: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  close: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  chevron: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  flame: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M12 3c1 4 5 6 5 11a5 5 0 01-10 0c0-3 2-4 2-7 2 1 3 3 3 3" />
    </Svg>
  ),
  check: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M5 12l5 5 9-10" />
    </Svg>
  ),
  alert: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M12 4l9 16H3zM12 10v4M12 17v.5" />
    </Svg>
  ),
  trash: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </Svg>
  ),
  today: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />
    </Svg>
  ),
  progress: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  ),
  coach: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
    </Svg>
  ),
  settings: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <path d="M14 4v6h4V4zM6 14v6h4v-6z" />
    </Svg>
  ),
  camera: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
      <circle cx="12" cy="13" r="4" />
    </Svg>
  ),
  bolt: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </Svg>
  ),
  left: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  ),
  right: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  ),
  wifiOff: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 015-2.6M14 10a10 10 0 015 2.5M12 20h.01" />
    </Svg>
  ),
};

export function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const color = level === "high" ? "var(--ok)" : level === "medium" ? "var(--warn)" : "var(--over)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">
      <span aria-hidden="true" className="inline-block h-2 w-2" style={{ background: color }} />
      {level}
      <span className="sr-only"> confidence</span>
    </span>
  );
}
