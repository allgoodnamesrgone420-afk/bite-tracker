/**
 * Coach chat, client side. Keeps AI cost low by never sending raw history:
 *  - a compact digest of your logs (a few hundred tokens), computed here;
 *  - a short memory of facts the coach learned about you (capped);
 *  - only the last few turns of conversation.
 * Simple questions ("what's left today?") are answered on the device.
 */
import { foodKey } from "./calibration";
import type { DaySummary } from "./db";
import type { Insight } from "./insights";
import { MICRO_META, microTargets, sumMicros } from "./micros";
import { classifyDay, rangeStats } from "./progress";
import { CHAT_HISTORY, MEMORY_MAX, MEALS, type ChatMessage, type DayLog, type Profile } from "./schemas";
import type { TargetCalc } from "./targets";
import { addDays, remaining, sumItems } from "./totals";
import type { TdeeEstimate, Weights } from "./weight";
import { currentWeight, weeklyRate } from "./weight";

export type StoredMessage = ChatMessage & { at: number; followUps?: string[]; local?: boolean; safety?: boolean };
export type ChatLog = { messages: StoredMessage[] };
export type MemoryFact = { text: string; at: number };
export type Memory = { facts: MemoryFact[] };

export const CHAT_KEEP = 30;
/** Synced records are capped at 64 KB, so keep the stored chat well under that. */
const CHAT_MAX_JSON = 48_000;

export function trimChat(messages: StoredMessage[]): StoredMessage[] {
  let out = messages.slice(-CHAT_KEEP);
  while (out.length > 2 && JSON.stringify(out).length > CHAT_MAX_JSON) out = out.slice(2);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Apply the coach's memory edits: dedupe, drop removed facts, keep the newest MEMORY_MAX. */
export function applyMemory(mem: Memory, add: string[], remove: string[], now = Date.now()): Memory {
  const gone = new Set(remove.map(norm));
  let facts = mem.facts.filter((f) => !gone.has(norm(f.text)));
  for (const a of add) {
    const t = a.trim().slice(0, 160);
    if (!t || facts.some((f) => norm(f.text) === norm(t))) continue;
    facts.push({ text: t, at: now });
  }
  if (facts.length > MEMORY_MAX) facts = facts.slice(facts.length - MEMORY_MAX);
  return { facts };
}

/** The turns sent with a new message: the last few, text only. */
export function historyFor(messages: StoredMessage[], next: string): ChatMessage[] {
  const recent = messages.filter((m) => !m.local).slice(-CHAT_HISTORY);
  return [...recent.map(({ role, content }) => ({ role, content })), { role: "user", content: next }];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export type DigestInput = {
  profile: Profile;
  calc: TargetCalc;
  today: string;
  /** Recent days incl. today (any order). */
  days: DayLog[];
  summaries: Record<string, DaySummary>;
  weights: Weights;
  tdee: TdeeEstimate | null;
  insights: Insight[];
  now?: Date;
};

/** Everything the coach needs, in ~300-600 tokens. */
export function buildDigest(i: DigestInput): string {
  const { profile: p, calc, today, summaries, weights } = i;
  const t = calc.targets;
  const now = i.now ?? new Date();
  const lines: string[] = [];
  lines.push(`date: ${day(today)}, local time ${now.toTimeString().slice(0, 5)}`);
  lines.push(
    `profile: ${p.age}y ${p.sex}, ${p.heightCm} cm, ${calc.weightKg} kg, activity ${p.activity}, goal ${p.goal}${p.goal !== "maintain" ? ` ${p.rateKgPerWeek} kg/week` : ""}` +
      `${p.diet ? `; diet: ${p.diet}` : ""}${p.healthNotes ? `; health notes: ${p.healthNotes}` : ""}`,
  );
  const mt = microTargets(t.calories, p.sex);
  lines.push(`daily targets: ${fmt(t.calories)} kcal, protein ${t.protein_g} g, carbs ${t.carbs_g} g, fat ${t.fat_g} g, fibre ${t.fibre_g} g; sodium under ${fmt(mt.sodium_mg)} mg; maintenance ${fmt(calc.tdee)} kcal${calc.adaptive ? " (from their own data)" : " (formula)"}`);

  const todayLog = i.days.find((d) => d.date === today);
  const items = todayLog?.items ?? [];
  if (items.length) {
    const tot = sumItems(items);
    const m = sumMicros(items);
    const left = remaining(t, tot);
    lines.push(
      `today so far (${items.length} items): ${fmt(tot.calories)} kcal, P ${Math.round(tot.protein_g)} g, C ${Math.round(tot.carbs_g)} g, F ${Math.round(tot.fat_g)} g, fibre ${Math.round(tot.fibre_g)} g` +
        (m.covered ? `, sodium ${fmt(m.total.sodium_mg)} mg, sugar ${Math.round(m.total.sugar_g)} g` : ""),
    );
    for (const meal of MEALS) {
      const mi = items.filter((x) => x.meal === meal);
      if (mi.length) lines.push(`  ${meal}: ${mi.map((x) => `${x.quantity} ${x.unit} ${x.name} (${Math.round(x.calories)})`).join(", ")}`.slice(0, 400));
    }
    lines.push(`left today: ${fmt(left.calories)} kcal, protein ${Math.round(left.protein_g)} g, fibre ${Math.round(left.fibre_g)} g`);
  } else lines.push("today: nothing logged yet");

  const past = Object.values(summaries)
    .filter((s) => s.date < today && s.date >= addDays(today, -7) && s.count)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (past.length) {
    lines.push("last 7 days:");
    for (const s of past) {
      const c = classifyDay(s, s.target ?? t);
      lines.push(`  ${day(s.date)}: ${fmt(s.calories)} kcal, P ${Math.round(s.protein_g)} g, fibre ${Math.round(s.fibre_g)} g${s.micros ? `, sodium ${fmt(s.micros.sodium_mg)} mg` : ""} (${c.status === "low" ? "looks incomplete" : c.status})`);
    }
  }
  const dates14 = Array.from({ length: 14 }, (_, k) => addDays(today, -1 - k));
  const r14 = rangeStats(summaries, dates14, t);
  if (r14.logged) lines.push(`14-day: ${r14.logged} days logged, avg ${fmt(r14.avgCalories)} kcal, avg protein ${r14.avgProtein} g, on target ${r14.hit}, over ${r14.over}, under ${r14.under}, incomplete ${r14.low}`);

  // Frequent foods (from the loaded days), by total calories.
  const foods = new Map<string, { name: string; n: number; kcal: number }>();
  for (const d of i.days) for (const x of d.items) {
    const k = foodKey(x.name);
    const f = foods.get(k) ?? { name: x.name, n: 0, kcal: 0 };
    f.n++;
    f.kcal += x.calories;
    foods.set(k, f);
  }
  const top = [...foods.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 10);
  if (top.length) lines.push(`frequent foods: ${top.map((f) => `${f.name} x${f.n} (~${Math.round(f.kcal / f.n)} kcal each)`).join("; ")}`);

  const w = currentWeight(weights, today);
  if (w) {
    const rate = weeklyRate(weights, today);
    lines.push(`weight: trend ${w.trend} kg${rate !== null ? `, ${rate > 0 ? "+" : ""}${rate} kg/week over 4 weeks` : ""}`);
  }
  if (i.tdee?.ok) lines.push(`maintenance from their data: ~${fmt(i.tdee.fromData)} kcal (${i.tdee.days} logged days, ${i.tdee.weighIns} weigh-ins, ${i.tdee.confidence} confidence)`);
  const highSodium = past.filter((s) => s.micros && s.micros.sodium_mg > mt.sodium_mg).length;
  if (highSodium) lines.push(`sodium over ${fmt(mt.sodium_mg)} mg on ${highSodium} of the last ${past.length} days (${MICRO_META.sodium_mg.note})`);
  if (i.insights.length) lines.push(`patterns: ${i.insights.slice(0, 6).map((x) => x.title).join("; ")}`);
  return lines.join("\n").slice(0, 6000);
}

/** Answers that need no AI call. Returns null when the question needs the coach. */
export function localAnswer(text: string, input: { calc: TargetCalc; todayItems: DayLog["items"] }): string | null {
  const q = norm(text);
  if (!/^(whats|what is|how much)?\s*(left|remaining)( today| for today)?$/.test(q)) return null;
  const t = input.calc.targets;
  const tot = sumItems(input.todayItems);
  const left = remaining(t, tot);
  if (!input.todayItems.length) return `Nothing logged yet today. Your targets: ${fmt(t.calories)} kcal and ${t.protein_g} g protein.`;
  const parts = [
    left.calories >= 0 ? `${fmt(left.calories)} kcal left` : `${fmt(-left.calories)} kcal over`,
    left.protein_g > 0 ? `${Math.round(left.protein_g)} g protein to go` : "protein done",
    left.fibre_g > 0 ? `${Math.round(left.fibre_g)} g fibre to go` : "fibre done",
  ];
  return `${parts.join(", ")}. (${fmt(tot.calories)} of ${fmt(t.calories)} kcal eaten.)`;
}
