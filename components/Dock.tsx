"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { topFoods } from "@/lib/calibration";
import { PARSE_MAX_CHARS } from "@/lib/schemas";
import { useApp } from "./AppProvider";
import { Icon } from "./ui";

const TABS = [
  { href: "/", label: "Today", icon: Icon.today },
  { href: "/progress", label: "Progress", icon: Icon.progress },
  { href: "/coach", label: "Coach", icon: Icon.coach },
  { href: "/settings", label: "Settings", icon: Icon.settings },
] as const;

/** Sticky bottom: food input (one thumb-tap away on every screen) + tab bar. */
export function Dock() {
  const { submitText, submitPhoto, openManual, quickAdd, myFoods, pending, online } = useApp();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const chips = topFoods(myFoods, 8);

  // Publish the dock's real height so pages and toasts can clear it.
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--dock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pathname = usePathname();
  const busy = !!pending;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      <div ref={dockRef} className="mx-auto max-w-[430px] border-t border-line bg-bg/95 backdrop-blur-sm">
        {chips.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 pt-2.5" role="group" aria-label="Quick add your usual foods">
            {chips.map((f) => (
              <button key={f.key} type="button" className="chip shrink-0 !min-h-8 !text-xs" onClick={() => quickAdd(f.key)} aria-label={`Quick add ${f.name}, ${f.lastQty ?? 1} ${f.unit}`}>
                <Icon.plus size={12} />
                {f.name.replace(/\s*\(.*?\)/, "")}
                <span className="font-normal text-ink-3">
                  {f.lastQty ?? 1} {f.unit}
                </span>
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-stretch gap-2 px-5 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!online) return openManual(text.trim());
            if (busy || !text.trim()) return;
            submitText(text);
            setText("");
          }}
        >
          <button
            type="button"
            onClick={() => openManual(text.trim())}
            className="mb-1 flex w-12 shrink-0 items-center justify-center border border-line bg-surface text-ink-2 hover:text-ink"
            aria-label="Add food manually"
          >
            <Icon.plus />
          </button>
          <label className="relative flex-1">
            <span className="sr-only">What did you eat?</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={PARSE_MAX_CHARS}
              placeholder={online ? "What did you eat?" : "Offline: tap + to add manually"}
              enterKeyHint="send"
              autoComplete="off"
              className="mb-1 h-12 w-full border border-line bg-surface pl-3 pr-12 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:shadow-[3px_3px_0_var(--lime)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !online}
              className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-40"
              aria-label="Log food from a photo"
              title="Snap your plate"
            >
              <Icon.camera size={20} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                // Anything typed in the box goes along as a caption ("this was 2 plates").
                submitPhoto(file, text.trim() || undefined);
                setText("");
              }}
            />
            {text.length > PARSE_MAX_CHARS - 100 && (
              <span className="num absolute right-12 top-1 text-[10px] text-ink-3" aria-live="polite">
                {text.length}/{PARSE_MAX_CHARS}
              </span>
            )}
          </label>
          <button
            type="submit"
            className="pop-btn lime w-12 !px-0"
            disabled={busy || (online && !text.trim())}
            aria-label={online ? "Log food" : "Add manually (offline)"}
            onClick={() => navigator.vibrate?.(10)}
          >
            <Icon.send />
          </button>
        </form>
        <div className="h-5 px-5 pt-1" aria-live="polite">
          {busy && <p className="pulse text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{pending?.photo ? "Reading your plate…" : "Crunching the numbers…"}</p>}
          {!online && !busy && (
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-warn">
              <Icon.wifiOff size={12} /> Offline · AI features paused
            </p>
          )}
        </div>
        <nav aria-label="Main" className="flex gap-1 border-t border-line px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5">
          {TABS.map((t) => {
            const active = pathname === t.href;
            const I = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  active ? "bg-lime text-on-accent" : "text-ink-3 hover:text-ink"
                }`}
              >
                <I size={18} />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function Toast() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  return <ToastInner key={toast.id} message={toast.message} undo={toast.undo} onDone={dismissToast} />;
}

function ToastInner({ message, undo, onDone }: { message: string; undo?: () => void; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+12px)] z-40 flex justify-center px-5">
      <div role="status" className="backdrop pointer-events-auto flex w-full max-w-[390px] items-center justify-between gap-3 border border-line bg-elevated px-4 py-3 shadow-[4px_4px_0_#000]">
        <span className="text-sm font-semibold">{message}</span>
        {undo && (
          <button
            className="text-xs font-bold uppercase tracking-[0.1em] text-protein"
            onClick={() => {
              undo();
              onDone();
            }}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
