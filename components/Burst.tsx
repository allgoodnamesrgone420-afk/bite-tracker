"use client";

/** A one-shot ring of particles for small wins (water goal, logging). Remount with a new key to replay. */
export function Burst({ color = "var(--lime)", className = "", count = 12, radius = 56 }: { color?: string; className?: string; count?: number; radius?: number }) {
  return (
    <span className={`pointer-events-none absolute h-0 w-0 ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="burst-bit absolute left-0 top-0 block"
          style={{
            ["--a" as string]: `${(360 / count) * i}deg`,
            ["--r" as string]: `-${radius * (i % 2 ? 0.75 : 1)}px`,
            width: i % 3 ? 6 : 8,
            height: i % 3 ? 6 : 8,
            background: i % 4 === 1 ? "var(--lime)" : color,
            animationDelay: `${(i % 3) * 25}ms`,
          }}
        />
      ))}
    </span>
  );
}
