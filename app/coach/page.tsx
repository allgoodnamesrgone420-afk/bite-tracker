"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon, PopButton, fmtInt, useDesktop } from "@/components/ui";
import { apiChat, apiCoach } from "@/lib/api-client";
import { applyMemory, buildDigest, historyFor, localAnswer, trimChat, type ChatLog, type Memory, type StoredMessage } from "@/lib/chat";
import * as db from "@/lib/db";
import { computeInsights, localCoach, type Insight } from "@/lib/insights";
import { lastNDates } from "@/lib/progress";
import { CHAT_MAX_CHARS, type CoachRequest, type CoachResult, type DayLog, type Profile } from "@/lib/schemas";
import type { TargetCalc, Targets } from "@/lib/targets";
import { sumItems } from "@/lib/totals";
import { fmtLitres, waterGoal } from "@/lib/water";

type Mode = "daily" | "weekly";
type Tab = "chat" | Mode;

export default function CoachPage() {
  const { ready, profile, calc, today, summaries } = useApp();
  const [days, setDays] = useState<DayLog[] | null>(null);
  const todayCount = summaries[today]?.count ?? 0;

  useEffect(() => {
    let live = true;
    db.getDays(lastNDates(today, 14)).then((d) => live && setDays(d));
    return () => {
      live = false;
    };
  }, [today, todayCount]);

  if (!ready || !days) return <p className="label pulse pt-10">Loading…</p>;
  if (!profile || !calc) {
    return (
      <div className="space-y-4">
        <Title />
        <Link href="/settings" className="plunk face-card block p-4">
          <p className="label">Set up</p>
          <p className="mt-1 font-bold">Add your profile so the coach knows your goal →</p>
        </Link>
      </div>
    );
  }
  return <Coach profile={profile} calc={calc} today={today} days={days} />;
}

/** Compact on phones, so the conversation gets the screen. */
function Title({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3">
      <span className="plunk face-violet flex h-11 w-11 shrink-0 items-center justify-center" style={{ ["--d" as string]: "3px" }} aria-hidden="true">
        <Icon.coach size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-extrabold leading-tight tracking-tight lg:text-3xl">Coach</h1>
        <p className="truncate text-xs text-ink-2 lg:text-sm">What to change, from what you actually eat</p>
      </div>
      {children}
    </header>
  );
}

/** The coach's memory lives in your synced records, so it follows you across devices. */
function useMemory() {
  const { dataVersion } = useApp();
  const [memory, setMemory] = useState<Memory>({ facts: [] });
  useEffect(() => {
    let live = true;
    db.getRecords<Memory>("memory").then((r) => live && setMemory(r.coach ?? { facts: [] }));
    return () => {
      live = false;
    };
  }, [dataVersion]);
  const save = useCallback(async (m: Memory) => {
    setMemory(m);
    await db.saveRecords("memory", { coach: m });
  }, []);
  return [memory, save] as const;
}

function Coach({ profile, calc, today, days }: { profile: Profile; calc: TargetCalc; today: string; days: DayLog[] }) {
  const targets = calc.targets;
  const desktop = useDesktop();
  const [tab, setTab] = useState<Tab>("chat");
  const [memory, saveMemory] = useMemory();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const insights = useMemo(() => computeInsights({ today, days, targets, profile }), [today, days, targets, profile]);
  const memoryTexts = memory.facts.map((f) => f.text);
  const mode: Mode = tab === "weekly" ? "weekly" : "daily";

  const review = (m: Mode) => <Review key={m} mode={m} profile={profile} targets={targets} today={today} days={days} insights={insights} memory={memoryTexts} />;
  const patterns = insights.length > 0 && (
    <section className="space-y-2.5" style={{ ["--i" as string]: 3 }}>
      <div>
        <p className="label">Patterns from your logs</p>
        <p className="mt-0.5 text-[11px] text-ink-3">Last 14 days, worked out on your device. Free and instant.</p>
      </div>
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </section>
  );
  const memoryButton = (
    <button
      type="button"
      className={`press flex h-10 shrink-0 items-center gap-1.5 border px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] ${memoryOpen ? "border-ink bg-elevated text-ink" : "border-line text-ink-2 hover:text-ink"}`}
      onClick={() => setMemoryOpen((o) => !o)}
      aria-expanded={memoryOpen}
      aria-controls="coach-memory"
    >
      <Icon.bookmark size={14} /> Memory <span className="num text-ink-3">{memory.facts.length}</span>
    </button>
  );
  const memoryPanel = memoryOpen && <MemoryPanel memory={memory} onChange={saveMemory} onClose={() => setMemoryOpen(false)} />;
  const chat = <Chat profile={profile} calc={calc} today={today} days={days} insights={insights} memory={memory} saveMemory={saveMemory} desktop={desktop} />;

  if (desktop) {
    return (
      <div className="stagger space-y-6">
        <div style={{ ["--i" as string]: 0 }}>
          <Title>{memoryButton}</Title>
        </div>
        {memoryPanel}
        <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-6">
          {chat}
          <div className="space-y-6">
            <div className="segmented" role="tablist" aria-label="Review type">
              {(["daily", "weekly"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setTab(m)}>
                  {m === "daily" ? "Today's review" : "This week"}
                </button>
              ))}
            </div>
            {review(mode)}
            {patterns}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Title>{memoryButton}</Title>
      {memoryPanel}
      {/* Sticks under the top bar so you can switch while scrolled down a long chat. */}
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-10 -mx-5 bg-bg/95 px-5 py-2 backdrop-blur-sm">
        <div className="segmented" role="tablist" aria-label="Coach">
          {(["chat", "daily", "weekly"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={tab === m} onClick={() => setTab(m)}>
              {m === "chat" ? "Chat" : m === "daily" ? "Today" : "Week"}
            </button>
          ))}
        </div>
      </div>
      {tab === "chat" ? (
        chat
      ) : (
        <div className="stagger space-y-6">
          {review(mode)}
          {patterns}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- chat ---------------------------------- */

const stamp = () => Date.now();

const STARTERS: { text: string; hint: string }[] = [
  { text: "What's left today?", hint: "Instant, no AI" },
  { text: "Plan my dinner", hint: "Fits what's left" },
  { text: "High-protein snack ideas", hint: "Close the gap" },
  { text: "Why am I not losing weight?", hint: "From your trend" },
];

/** What the coach is working from right now, so its answers feel grounded. */
function ContextStrip({ calc, today, days }: { calc: TargetCalc; today: string; days: DayLog[] }) {
  const { water, profile } = useApp();
  const t = calc.targets;
  const tot = sumItems(days.find((d) => d.date === today)?.items ?? []);
  const kcalLeft = Math.round(t.calories - tot.calories);
  const proteinLeft = Math.max(0, Math.round(t.protein_g - tot.protein_g));
  const waterLeft = Math.max(0, waterGoal(profile, calc.weightKg) - (water[today]?.ml ?? 0));
  const chips = [
    { label: kcalLeft >= 0 ? "kcal left" : "kcal over", value: fmtInt(Math.abs(kcalLeft)), color: kcalLeft >= 0 ? "var(--lime)" : "var(--over)" },
    { label: "protein left", value: proteinLeft ? `${proteinLeft} g` : "done", color: "var(--protein)" },
    { label: "water left", value: waterLeft ? fmtLitres(waterLeft) : "done", color: "var(--water)" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" aria-label="What the coach can see today">
      {chips.map((c) => (
        <div key={c.label} className="border border-line bg-surface px-2.5 py-2">
          <p className="num truncate text-base font-extrabold leading-tight">{c.value}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            <span className="h-1.5 w-1.5 shrink-0" style={{ background: c.color }} aria-hidden="true" />
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const dayOf = (at: number) => new Date(at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

function Chat({
  profile,
  calc,
  today,
  days,
  insights,
  memory,
  saveMemory,
  desktop,
}: {
  profile: Profile;
  calc: TargetCalc;
  today: string;
  days: DayLog[];
  insights: Insight[];
  memory: Memory;
  saveMemory: (m: Memory) => Promise<void>;
  desktop: boolean;
}) {
  const { online, summaries, weights, tdee, dataVersion, name, water } = useApp();
  const [log, setLog] = useState<ChatLog>({ messages: [] });
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    db.getRecords<ChatLog>("chat").then((r) => {
      if (!live) return;
      setLog(r.main ?? { messages: [] });
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [dataVersion]);

  // Keep the newest message in view: inside the card on desktop, the page itself on phones.
  const first = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    const behavior: ScrollBehavior = first.current ? "auto" : "smooth";
    first.current = false;
    if (desktop) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior });
    // The page's bottom padding and the spacer leave room for the pinned composer, so the very bottom is right.
    else if (log.messages.length || busy) window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }, [loaded, log.messages.length, busy, desktop]);

  // Phones: the composer is pinned above the tab bar; publish its height so the page leaves room for it.
  useEffect(() => {
    const el = composerRef.current;
    if (!el || desktop) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--composer-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [desktop]);

  // The box grows with what you type, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  const persist = async (messages: StoredMessage[]) => {
    const next = { messages: trimChat(messages) };
    setLog(next);
    await db.saveRecords("chat", { main: next });
  };

  const send = async (raw: string) => {
    const t = raw.trim().slice(0, CHAT_MAX_CHARS);
    if (!t || busy) return;
    setError(null);
    const now = stamp();
    const userMsg: StoredMessage = { role: "user", content: t, at: now };
    const todayItems = days.find((d) => d.date === today)?.items ?? [];

    // Simple number questions are answered on the device: free and instant.
    const local = localAnswer(t, { calc, todayItems, waterMl: water[today]?.ml, waterGoalMl: waterGoal(profile, calc.weightKg) });
    if (local) {
      setText("");
      await persist([...log.messages, { ...userMsg, local: true }, { role: "assistant", content: local, at: now, local: true, followUps: ["Plan my next meal", "High-protein snack ideas"] }]);
      return;
    }
    if (!online) return setError("You're offline. The coach needs a connection.");

    const before = log.messages;
    setText("");
    setLog({ messages: [...before, userMsg] });
    setBusy(true);
    const res = await apiChat({
      messages: historyFor(before, t),
      context: buildDigest({ profile, calc, today, days, summaries, weights, tdee, insights }),
      memory: memory.facts.map((f) => f.text),
    });
    setBusy(false);
    if (!res.ok) {
      setLog({ messages: before });
      setText(t);
      setError(res.error.code === "config" ? "The AI coach needs an API key (see Settings → AI). The reviews and patterns still work without it." : res.error.message);
      return;
    }
    const r = res.data;
    await persist([...before, userMsg, { role: "assistant", content: r.reply, at: stamp(), followUps: r.follow_ups, safety: r.safety_flag || undefined }]);
    if (r.memory_add.length || r.memory_remove.length) await saveMemory(applyMemory(memory, r.memory_add, r.memory_remove));
  };

  const messages = log.messages;
  const last = messages.at(-1);
  const suggestions = messages.length && last?.role === "assistant" ? (last.followUps ?? []) : [];

  const thread = (
    <div className="space-y-3" aria-live="polite">
      {messages.length === 0 ? (
        <div className="space-y-4 py-1">
          <div>
            <p className="text-lg font-extrabold leading-snug">Hi{name ? ` ${name}` : ""}. What do you want to figure out?</p>
            <p className="mt-1 text-sm text-ink-2">
              I can see your targets, today&apos;s log, recent days and weight trend
              {memory.facts.length ? `, and I remember ${memory.facts.length} thing${memory.facts.length === 1 ? "" : "s"} about you` : ""}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STARTERS.map((s, i) => (
              <button
                key={s.text}
                type="button"
                className="press rise-in flex min-h-[76px] flex-col justify-between border border-line bg-surface p-3 text-left hover:border-ink"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => void send(s.text)}
              >
                <span className="text-sm font-bold leading-snug">{s.text}</span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayOf(prev.at) !== dayOf(m.at);
          return (
            <div key={`${m.at}-${i}`}>
              {newDay && <p className="my-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{dayOf(m.at)}</p>}
              <Bubble message={m} />
            </div>
          );
        })
      )}
      {busy && <Typing />}
    </div>
  );

  const composer = (
    <div className="space-y-2">
      {suggestions.length > 0 && !busy && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="group" aria-label="Suggestions">
          {suggestions.map((sug) => (
            <button key={sug} className="chip press shrink-0 !min-h-8 !text-xs" onClick={() => void send(sug)}>
              {sug}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-warn" role="alert">
          <Icon.alert size={13} /> {error}
        </p>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Message your coach</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={CHAT_MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder={online ? "Ask your coach…" : "Offline"}
            className="block min-h-12 w-full resize-none border border-line bg-surface px-3 py-3 text-base leading-snug text-ink placeholder:text-ink-3 focus:border-ink focus:shadow-[3px_3px_0_var(--lime)] focus:outline-none"
          />
        </label>
        <button type="submit" className="pop-btn lime mb-1 w-12 !px-0" disabled={busy || !text.trim()} aria-label="Send">
          <Icon.send />
        </button>
      </form>
    </div>
  );

  const clear = messages.length > 0 && (
    <button className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3 hover:text-ink" onClick={() => confirm("Clear this conversation? What the coach remembers about you stays.") && void persist([])}>
      Clear chat
    </button>
  );

  if (desktop) {
    return (
      <section className="plunk face-card flex flex-col" style={{ ["--d" as string]: "5px" }} aria-label="Chat with your coach">
        <div className="space-y-3 border-b border-line-soft p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="label">Today, as the coach sees it</p>
            {clear}
          </div>
          <ContextStrip calc={calc} today={today} days={days} />
        </div>
        <div ref={scroller} className="h-[calc(100dvh-500px)] min-h-[280px] overflow-y-auto px-4 py-4">
          {thread}
        </div>
        <div className="border-t border-line-soft p-3">{composer}</div>
      </section>
    );
  }

  // Phones: the page is the conversation; the composer sits just above the tab bar.
  return (
    <section className="space-y-4" aria-label="Chat with your coach">
      <ContextStrip calc={calc} today={today} days={days} />
      {clear && <div className="-mb-2 flex justify-end">{clear}</div>}
      {thread}
      <div style={{ height: "var(--composer-h, 76px)" }} aria-hidden="true" />
      <div ref={composerRef} className="fixed inset-x-0 bottom-[var(--dock-h)] z-20 mx-auto max-w-[430px] border-t border-line bg-bg/95 px-4 pb-2 pt-2.5 backdrop-blur-sm">
        {composer}
      </div>
    </section>
  );
}

/** One message. The coach's replies get light formatting: paragraphs, bullet and numbered lists, **bold**. */
function Bubble({ message: m }: { message: StoredMessage }) {
  if (m.role === "user") {
    return (
      <div className="rise-in flex flex-col items-end">
        <p className="max-w-[85%] whitespace-pre-wrap bg-lime px-3.5 py-2.5 text-[15px] font-medium leading-snug text-on-accent shadow-[3px_3px_0_var(--shadow)]">{m.content}</p>
        <p className="num mt-1 text-[10px] text-ink-3">{timeOf(m.at)}</p>
      </div>
    );
  }
  return (
    <div className="rise-in flex gap-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-on-accent ${m.safety ? "bg-warn" : "bg-violet"}`} aria-hidden="true">
        {m.safety ? <Icon.alert size={14} /> : <Icon.coach size={14} />}
      </span>
      <div className="min-w-0 max-w-[88%]">
        <div className={`border border-line bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed ${m.safety ? "border-l-4 border-l-warn" : ""}`}>
          <RichText text={m.content} />
        </div>
        <p className="mt-1 text-[10px] text-ink-3">
          <span className="num">{timeOf(m.at)}</span>
          {m.local && <span className="font-semibold uppercase tracking-[0.08em]"> · on your device, no AI call</span>}
        </p>
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="rise-in flex gap-2.5" role="status" aria-label="Coach is typing">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-violet text-on-accent" aria-hidden="true">
        <Icon.coach size={14} />
      </span>
      <div className="flex items-center gap-1.5 border border-line bg-surface px-3.5 py-3.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot h-2 w-2 bg-ink-2" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

/** **bold** inside a line, as React nodes (never HTML). */
function inline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-[square]"} marker:text-violet`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={blocks.length} className="[&:not(:first-child)]:mt-2">{inline(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

function MemoryPanel({ memory, onChange, onClose }: { memory: Memory; onChange: (m: Memory) => Promise<void>; onClose: () => void }) {
  const [adding, setAdding] = useState("");
  return (
    <section id="coach-memory" className="card rise-in space-y-3 p-4" aria-label="What the coach remembers">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">What the coach remembers</p>
          <p className="mt-1 text-xs text-ink-2">Short notes it saves from your chats (preferences, dislikes, routine), sent with each question. Remove anything that&apos;s wrong.</p>
        </div>
        <button className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center text-ink-3 hover:text-ink" onClick={onClose} aria-label="Close memory">
          <Icon.close size={16} />
        </button>
      </div>
      {memory.facts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {memory.facts.map((f) => (
            <li key={f.text} className="flex items-center gap-1 border border-line bg-elevated py-1 pl-2.5 pr-1 text-sm">
              {f.text}
              <button
                className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-3 hover:text-over"
                aria-label={`Forget: ${f.text}`}
                onClick={() => void onChange(applyMemory(memory, [], [f.text]))}
              >
                <Icon.close size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">Nothing yet. Tell it things like &quot;I&apos;m vegetarian&quot; or &quot;I train at 7 am&quot;.</p>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding.trim()) return;
          void onChange(applyMemory(memory, [adding], []));
          setAdding("");
        }}
      >
        <label className="field compact flex-1">
          <span>Add a note</span>
          <input value={adding} maxLength={140} onChange={(e) => setAdding(e.target.value)} placeholder="e.g. No onion or garlic on Tuesdays" />
        </label>
        <button type="submit" className="pop-btn sm ghost mb-1 shrink-0" disabled={!adding.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

const TONE = {
  warn: { color: "#f2542d", label: "Fix", glyph: "!" },
  tip: { color: "#6c8cff", label: "Tip", glyph: "→" },
  good: { color: "#00a886", label: "Win", glyph: "✓" },
} as const;

function InsightCard({ insight }: { insight: Insight }) {
  const t = TONE[insight.tone];
  return (
    <article className="card border-l-[6px] p-4" style={{ borderLeftColor: t.color }}>
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em]">
        <span className="flex h-5 w-5 items-center justify-center text-[11px] text-[#0d0d0d]" style={{ background: t.color }} aria-hidden="true">
          {t.glyph}
        </span>
        {t.label}
      </p>
      <h3 className="mt-2 font-bold">{insight.title}</h3>
      <p className="mt-1 text-sm text-ink-2">{insight.detail}</p>
      <ImpactTags kcal={insight.kcal} protein={insight.protein} />
    </article>
  );
}

function ImpactTags({ kcal, protein }: { kcal?: number; protein?: number }) {
  if (!kcal && !protein) return null;
  return (
    <div className="mt-2 flex gap-2">
      {!!kcal && <span className="tag num text-ink-2">{kcal > 0 ? "+" : ""}{fmtInt(kcal)} kcal</span>}
      {!!protein && <span className="tag num text-protein">+{Math.round(protein)} g protein</span>}
    </div>
  );
}

/* --------------------------------- review --------------------------------- */

function buildRequest(mode: Mode, profile: Profile, targets: Targets, today: string, days: DayLog[], insights: Insight[], memory: string[]): CoachRequest {
  const now = new Date();
  const todayLog = days.find((d) => d.date === today);
  const items = (todayLog?.items ?? []).slice(0, 60).map(({ name, quantity, unit, meal, calories, protein_g, carbs_g, fat_g, fibre_g }) => ({
    name, quantity, unit, meal, calories, protein_g, carbs_g, fat_g, fibre_g,
  }));
  return {
    mode,
    localTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    profile: {
      age: profile.age,
      sex: profile.sex,
      weightKg: profile.weightKg,
      goal: profile.goal,
      rateKgPerWeek: profile.rateKgPerWeek,
      activity: profile.activity,
      diet: profile.diet,
      healthNotes: profile.healthNotes,
    },
    targets,
    today: { items, totals: sumItems(todayLog?.items ?? []) },
    // Compact summary rows only (never raw history).
    days: days
      .filter((d) => d.items.length && d.date <= today)
      .slice(-(mode === "daily" ? 7 : 14))
      .map((d) => ({ date: d.date, items: d.items.length, ...sumItems(d.items) })),
    insights: insights.map((i) => `${i.title}. ${i.detail}`.slice(0, 300)).slice(0, 12),
    ...(memory.length ? { memory } : {}),
  };
}

/** Cheap stable hash so an unchanged day doesn't trigger another AI call. */
function hashOf(req: CoachRequest): string {
  const s = JSON.stringify({ ...req, localTime: "" });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: CoachResult; notice?: string; fresh: boolean; stale: boolean };

function Review({ mode, profile, targets, today, days, insights, memory }: { mode: Mode; profile: Profile; targets: Targets; today: string; days: DayLog[]; insights: Insight[]; memory: string[] }) {
  const { online, showToast } = useApp();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [revealed, setRevealed] = useState(false);
  const memoryKey = memory.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memoryKey stands in for memory
  const req = useMemo(() => buildRequest(mode, profile, targets, today, days, insights, memory), [mode, profile, targets, today, days, insights, memoryKey]);
  const hash = hashOf(req);

  // Show the cached review for today (marked stale if the log changed since).
  useEffect(() => {
    let live = true;
    db.getCoach(today, mode).then((c) => {
      if (live && c) {
        setState({ kind: "done", result: c, fresh: false, stale: c.hash !== hash });
        setRevealed(true);
      }
    });
    return () => {
      live = false;
    };
  }, [today, mode, hash]);

  // Never leave the card stuck on "Crunching…": anything unexpected puts it back with a message.
  const run = () =>
    build().catch(() => {
      setState({ kind: "idle" });
      showToast("Couldn't put the review together. Try again.");
    });

  const build = async () => {
    setState({ kind: "loading" });
    setRevealed(false);
    const local = (): CoachResult => ({ ...localCoach(mode, { today, days, targets, profile }), engine: "local", generatedAt: Date.now() });
    let result: CoachResult;
    let notice: string | undefined;
    if (!online) {
      notice = "Offline, so this is your built-in coach.";
      result = local();
    } else {
      const res = await apiCoach(req);
      if (res.ok) result = res.data;
      else {
        notice = res.error.code === "config" ? "No AI key set, so this is the built-in coach (rules computed from your logs)." : `${res.error.message} Showing the built-in coach instead.`;
        result = local();
      }
    }
    await db.saveCoach(today, mode, { ...result, hash });
    setState({ kind: "done", result, notice, fresh: true, stale: false });
  };

  if (state.kind === "idle") {
    return (
      <section className="plunk face-violet p-5" style={{ ["--i" as string]: 2, ["--d" as string]: "5px" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">{mode === "daily" ? "Daily review" : "Weekly review"}</p>
        <p className="mt-2 text-xl font-extrabold leading-tight">
          {mode === "daily" ? "How did today go, and what's the one thing to change?" : "Your week in five lines, plus two changes for next week."}
        </p>
        <PopButton variant="primary" className="mt-4" onClick={run}>
          <Icon.coach size={16} /> {mode === "daily" ? "Review my day" : "Review my week"}
        </PopButton>
      </section>
    );
  }

  if (state.kind === "loading") {
    return (
      <section className="plunk face-violet p-5" style={{ ["--d" as string]: "5px" }} aria-live="polite">
        <p className="pulse text-sm font-bold uppercase tracking-[0.1em]">Crunching the numbers…</p>
        <div className="pulse mt-4 h-3 w-3/4 bg-black/20" />
        <div className="pulse mt-2 h-3 w-1/2 bg-black/20" />
      </section>
    );
  }

  const { result, notice, stale } = state;

  // First reveal of a fresh review: tap-to-reveal plate.
  if (!revealed) {
    return (
      <button className="plunk face-lime block w-full p-6 text-left" style={{ ["--d" as string]: "6px" }} onClick={() => setRevealed(true)}>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">Your {mode === "daily" ? "daily" : "weekly"} review is ready</p>
        <p className="mt-2 text-3xl font-extrabold">Tap to reveal</p>
        <p className="mt-1 text-sm font-semibold opacity-80">{result.changes.length} change{result.changes.length === 1 ? "" : "s"} inside</p>
      </button>
    );
  }

  if (result.safety_flag) {
    return (
      <section className="card revealing p-5" aria-live="polite">
        <p className="label">A note from your coach</p>
        <p className="mt-2 leading-relaxed">{result.snapshot}</p>
        <p className="mt-3 text-sm text-ink-2">{result.went_well}</p>
        <p className="mt-4 text-sm text-ink-2">A doctor or registered dietitian can set targets that fit your situation. Calorie-deficit suggestions are paused.</p>
      </section>
    );
  }

  return (
    <section className="card revealing border-l-[6px] border-l-violet" aria-live="polite">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <span className={`plunk ${result.engine === "llm" ? "face-violet" : "face-lime"} inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em]`} style={{ ["--d" as string]: "2px" }}>
          {result.engine === "llm" ? <Icon.coach size={11} /> : <Icon.bolt size={11} />} {result.engine === "llm" ? "AI coach" : "Built-in coach"}
        </span>
        <button className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2 hover:text-ink" onClick={run}>
          {stale ? "Log changed · refresh" : "Refresh"}
        </button>
      </div>
      <div className="space-y-5 p-4">
        {notice && <p className="border border-warn/60 bg-warn/10 p-2.5 text-xs">{notice}</p>}
        <Block label="Snapshot">{result.snapshot}</Block>
        <Block label="What went well">{result.went_well}</Block>
        {result.changes.length > 0 && (
          <div>
            <p className="label">What to change</p>
            <ol className="mt-2 space-y-3">
              {result.changes.map((c, i) => (
                <li key={i} className="flex gap-3">
                  <span className="hero-num num w-9 shrink-0 text-[40px] text-violet">{i + 1}</span>
                  <div>
                    <p className="font-bold">{c.title}</p>
                    <p className="text-sm text-ink-2">{c.detail}</p>
                    <ImpactTags kcal={c.est_kcal_impact} protein={c.est_protein_impact_g} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {result.remaining_today && <Block label="Rest of today">{result.remaining_today}</Block>}
        {result.pattern_note && <Block label="Pattern">{result.pattern_note}</Block>}
        <p className="text-[11px] text-ink-3">General guidance, not medical advice.</p>
      </div>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1 text-[15px] leading-relaxed">{children}</p>
    </div>
  );
}
