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

function Title() {
  return (
    <header>
      <p className="label">Coach</p>
      <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">What to change, from what you actually eat</h1>
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
  const insights = useMemo(() => computeInsights({ today, days, targets, profile }), [today, days, targets, profile]);
  const memoryTexts = memory.facts.map((f) => f.text);
  const mode: Mode = tab === "weekly" ? "weekly" : "daily";

  const review = (m: Mode) => <Review key={m} mode={m} profile={profile} targets={targets} today={today} days={days} insights={insights} memory={memoryTexts} />;
  const patterns = (
    <section className="space-y-3" style={{ ["--i" as string]: 3 }}>
      <div>
        <p className="label">Patterns from your logs</p>
        <p className="text-xs text-ink-2">Computed on your device from the last 14 days. Free, instant, always on.</p>
      </div>
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} />
      ))}
    </section>
  );

  if (desktop) {
    return (
      <div className="stagger space-y-6">
        <div style={{ ["--i" as string]: 0 }}>
          <Title />
        </div>
        <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-6">
          <Chat profile={profile} calc={calc} today={today} days={days} insights={insights} memory={memory} saveMemory={saveMemory} />
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
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <Title />
      </div>

      <div className="segmented" role="tablist" aria-label="Coach" style={{ ["--i" as string]: 1 }}>
        {(["chat", "daily", "weekly"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={tab === m} onClick={() => setTab(m)}>
            {m === "chat" ? "Ask" : m === "daily" ? "Today" : "Week"}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <Chat profile={profile} calc={calc} today={today} days={days} insights={insights} memory={memory} saveMemory={saveMemory} />
      ) : (
        <>
          {review(mode)}
          {patterns}
        </>
      )}
    </div>
  );
}

/* ---------------------------------- chat ---------------------------------- */

const stamp = () => Date.now();

const STARTERS = ["What's left today?", "Plan my dinner", "High-protein snack ideas", "Why am I not losing weight?", "Ask me about how I eat"];

function Chat({
  profile,
  calc,
  today,
  days,
  insights,
  memory,
  saveMemory,
}: {
  profile: Profile;
  calc: TargetCalc;
  today: string;
  days: DayLog[];
  insights: Insight[];
  memory: Memory;
  saveMemory: (m: Memory) => Promise<void>;
}) {
  const { online, summaries, weights, tdee, dataVersion, name } = useApp();
  const [log, setLog] = useState<ChatLog>({ messages: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    db.getRecords<ChatLog>("chat").then((r) => live && setLog(r.main ?? { messages: [] }));
    return () => {
      live = false;
    };
  }, [dataVersion]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [log.messages.length, busy]);

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
    const local = localAnswer(t, { calc, todayItems });
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

  const last = log.messages.at(-1);
  const suggestions = !log.messages.length ? STARTERS : last?.role === "assistant" ? (last.followUps ?? []) : [];

  return (
    <section className="plunk face-card flex flex-col" style={{ ["--d" as string]: "5px" }} aria-label="Chat with your coach">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <span className="plunk face-violet inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em]" style={{ ["--d" as string]: "2px" }}>
          <Icon.coach size={11} /> Ask your coach
        </span>
        {log.messages.length > 0 && (
          <button className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3 hover:text-ink" onClick={() => confirm("Clear this conversation? What the coach remembers about you stays.") && void persist([])}>
            Clear chat
          </button>
        )}
      </div>

      <div ref={scroller} className="max-h-[58dvh] min-h-[260px] space-y-3 overflow-y-auto px-4 py-4 lg:h-[calc(100dvh-440px)] lg:max-h-none" aria-live="polite">
        {log.messages.length === 0 && (
          <div className="space-y-2">
            <p className="font-bold">Hi{name ? ` ${name}` : ""}. Ask me anything about your eating.</p>
            <p className="text-sm text-ink-2">
              I can see your targets, today&apos;s log, recent days and weight trend. I remember your preferences as we talk
              {memory.facts.length ? `: ${memory.facts.length} note${memory.facts.length === 1 ? "" : "s"} so far` : ""}, so answers get more personal over time.
            </p>
          </div>
        )}
        {log.messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap bg-lime px-3 py-2 text-sm font-medium text-on-accent">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[92%]">
              <p className={`whitespace-pre-wrap border-l-4 bg-elevated px-3 py-2 text-[15px] leading-relaxed ${m.safety ? "border-l-warn" : "border-l-violet"}`}>{m.content}</p>
              {m.local && <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">Answered on your device · no AI call</p>}
            </div>
          ),
        )}
        {busy && (
          <div className="max-w-[60%] border-l-4 border-l-violet bg-elevated px-3 py-3">
            <div className="pulse h-2 w-24 bg-ink-3/40" />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line-soft p-3">
        {suggestions.length > 0 && !busy && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Suggestions">
            {suggestions.map((sug) => (
              <button key={sug} className="chip shrink-0 !min-h-8 !text-xs" onClick={() => void send(sug)}>
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
              placeholder={online ? "Ask about meals, swaps, cravings…" : "Offline"}
              className="block max-h-32 min-h-12 w-full resize-none border border-line bg-bg px-3 py-3 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:shadow-[3px_3px_0_var(--lime)] focus:outline-none"
            />
          </label>
          <button type="submit" className="pop-btn lime mb-1 w-12 !px-0" disabled={busy || !text.trim()} aria-label="Send">
            <Icon.send />
          </button>
        </form>
        <MemoryPanel memory={memory} onChange={saveMemory} />
      </div>
    </section>
  );
}

function MemoryPanel({ memory, onChange }: { memory: Memory; onChange: (m: Memory) => Promise<void> }) {
  const [adding, setAdding] = useState("");
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">
        What the coach remembers ({memory.facts.length})
        <span className="transition-transform group-open:rotate-180">
          <Icon.chevron size={14} />
        </span>
      </summary>
      <div className="space-y-2 pt-2">
        <p className="text-xs text-ink-3">
          Short notes the coach saves from your chats (preferences, dislikes, routine). They&apos;re sent with each question so answers fit you. Remove anything
          that&apos;s wrong.
        </p>
        {memory.facts.length > 0 && (
          <ul className="divide-y divide-line-soft border-y border-line-soft">
            {memory.facts.map((f) => (
              <li key={f.text} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="flex-1">{f.text}</span>
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-3 hover:text-over"
                  aria-label={`Forget: ${f.text}`}
                  onClick={() => void onChange(applyMemory(memory, [], [f.text]))}
                >
                  <Icon.trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding.trim()) return;
            void onChange(applyMemory(memory, [adding], []));
            setAdding("");
          }}
        >
          <label className="field compact flex-1">
            <span>Tell it something to remember</span>
            <input value={adding} maxLength={140} onChange={(e) => setAdding(e.target.value)} placeholder="e.g. No onion or garlic on Tuesdays" />
          </label>
          <button type="submit" className="pop-btn sm ghost shrink-0 self-center" disabled={!adding.trim()}>
            Add
          </button>
        </form>
      </div>
    </details>
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
  const { online } = useApp();
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

  const run = async () => {
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
