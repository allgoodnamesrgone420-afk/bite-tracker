"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { topFoods } from "@/lib/calibration";
import { PARSE_MAX_CHARS } from "@/lib/schemas";
import { useApp } from "./AppProvider";
import { Icon } from "./ui";

export const TABS = [
  { href: "/", label: "Today", icon: Icon.today },
  { href: "/progress", label: "Progress", icon: Icon.progress },
  { href: "/coach", label: "Coach", icon: Icon.coach },
  { href: "/foods", label: "Foods", icon: Icon.book },
  { href: "/settings", label: "Settings", icon: Icon.settings },
] as const;

/* ------------------------------- voice input ------------------------------- */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noop = () => () => {};

/** Browser speech-to-text (Chrome sends audio to Google; Safari uses Apple's). Fills the box; you still press send. */
function useVoice(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noop, () => !!recognitionCtor(), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = "en-IN"; // copes with Indian English and a fair bit of Hinglish
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text.slice(0, PARSE_MAX_CHARS));
    };
    r.onerror = (e) =>
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone blocked. Allow it in your browser settings." : e.error === "no-speech" ? "Didn't catch that. Try again." : null);
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [onText]);

  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, error, start, stop };
}

/* --------------------------------- food bar --------------------------------- */

/** Chips + "what did you eat" box. Bottom dock on phones, top bar on desktop. */
export function FoodBar({ variant }: { variant: "dock" | "top" }) {
  const { submitText, submitPhoto, setSheet, quickAdd, myFoods, pending, online } = useApp();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chips = topFoods(myFoods, variant === "top" ? 10 : 8);
  const busy = !!pending;
  const voice = useVoice(setText);
  // Mic and camera step aside once you're typing, so the text has room.
  const tools = !text.trim() || voice.listening;

  // Desktop: "/" jumps to the food box from anywhere.
  useEffect(() => {
    if (variant !== "top") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant]);

  const chipRow = chips.length > 0 && (
    <div className={`no-scrollbar flex gap-1.5 overflow-x-auto ${variant === "dock" ? "px-4 pt-2" : "pt-2"}`} role="group" aria-label="Quick add your usual foods">
      {chips.map((f) => (
        <button
          key={f.key}
          type="button"
          className="chip shrink-0 !min-h-7 !gap-1 !px-2 !text-[11px] !shadow-[1px_1px_0_var(--shadow)]"
          onClick={() => quickAdd(f.key)}
          aria-label={`Quick add ${f.name}, ${f.lastQty ?? 1} ${f.unit}`}
        >
          <Icon.plus size={10} />
          {f.name.replace(/\s*\(.*?\)/, "")}
          <span className="font-normal text-ink-3">
            {f.lastQty ?? 1} {f.unit}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {variant === "dock" && chipRow}
      <form
        className={`flex items-stretch gap-1.5 ${variant === "dock" ? "px-4 pt-2" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          voice.stop();
          if (!online) return setSheet({ kind: "add", text: text.trim() });
          if (busy || !text.trim()) return;
          submitText(text);
          setText("");
        }}
      >
        <button
          type="button"
          onClick={() => setSheet({ kind: "add", text: text.trim() })}
          className="mb-1 flex w-11 shrink-0 items-center justify-center border border-line bg-surface text-ink-2 hover:text-ink"
          aria-label="More ways to add: manual, barcode, saved meals"
          title="Manual entry, barcode, saved meals"
        >
          <Icon.plus />
        </button>
        <label className="relative flex-1">
          <span className="sr-only">What did you eat?</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={PARSE_MAX_CHARS}
            placeholder={voice.listening ? "Listening…" : online ? (variant === "top" ? "What did you eat?  (press / to jump here)" : "What did you eat?") : "Offline: tap +"}
            enterKeyHint="send"
            autoComplete="off"
            className={`mb-1 h-12 w-full border border-line bg-surface pl-3 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:shadow-[3px_3px_0_var(--lime)] focus:outline-none ${!tools ? "pr-3" : voice.supported ? "pr-[76px]" : "pr-10"}`}
          />
          <span className={`absolute right-1 top-1 ${tools ? "flex" : "hidden"}`}>
            {voice.supported && (
              <button
                type="button"
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                disabled={busy}
                className={`flex h-10 w-9 items-center justify-center disabled:opacity-40 ${voice.listening ? "pulse bg-lime text-on-accent" : "text-ink-2 hover:text-ink"}`}
                aria-label={voice.listening ? "Stop listening" : "Say what you ate"}
                aria-pressed={voice.listening}
                title="Speak instead of typing"
              >
                {voice.listening ? <Icon.stop size={16} /> : <Icon.mic size={19} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !online}
              className="flex h-10 w-9 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-40"
              aria-label="Log food from a photo"
              title="Snap your plate"
            >
              <Icon.camera size={19} />
            </button>
          </span>
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
            <span className="num absolute right-24 top-1 text-[10px] text-ink-3" aria-live="polite">
              {text.length}/{PARSE_MAX_CHARS}
            </span>
          )}
        </label>
        <button
          type="submit"
          className="pop-btn lime w-11 !px-0"
          disabled={busy || (online && !text.trim())}
          aria-label={online ? "Log food" : "Add manually (offline)"}
          onClick={() => navigator.vibrate?.(10)}
        >
          <Icon.send />
        </button>
      </form>
      {/* Status line only takes space when there's something to say. */}
      <div className={`min-h-1.5 [&>p]:pb-1 [&>p]:pt-0.5 ${variant === "dock" ? "px-4" : ""}`} aria-live="polite">
        {busy ? (
          <p className="pulse text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{pending?.photo ? "Reading your plate…" : "Crunching the numbers…"}</p>
        ) : voice.error ? (
          <p className="text-[11px] font-semibold text-warn">{voice.error}</p>
        ) : !online ? (
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-warn">
            <Icon.wifiOff size={12} /> Offline · AI features paused
          </p>
        ) : null}
      </div>
      {variant === "top" && chipRow}
    </>
  );
}

/* ------------------------------ mobile dock ------------------------------ */

/** Sticky bottom on phones and tablets: food input (one thumb-tap away) + tab bar. */
export function Dock() {
  const dockRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Publish the dock's real height so pages and toasts can clear it (0 when hidden on desktop).
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--dock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
      <div ref={dockRef} className="mx-auto max-w-[430px] border-t border-line bg-bg/95 backdrop-blur-sm">
        <FoodBar variant="dock" />
        <nav aria-label="Main" className="flex gap-1 border-t border-line px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5">
          {TABS.map((t) => {
            const active = pathname === t.href;
            const I = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+12px)] z-40 flex justify-center px-5 lg:bottom-6 lg:left-60">
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
