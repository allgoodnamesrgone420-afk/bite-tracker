"use client";
import { clear, createStore, del, entries, get, getMany, set, setMany, update } from "idb-keyval";
import { z } from "zod";
import {
  DayLogSchema,
  ProfileSchema,
  TargetOverridesSchema,
  type DayLog,
  type ParseResult,
  type Profile,
  type TargetOverrides,
} from "./schemas";
import type { PersonalFood } from "./calibration";
import { diffDay, diffFoods, type FoodChange, type ItemChange } from "./sync-core";
import type { CoachResult } from "./schemas";
import type { Targets } from "./targets";
import { sumItems, type Nutrients } from "./totals";

/**
 * All user data lives in IndexedDB on this device. Keys:
 *   profile, overrides, passcode, summaries, parseCache, myFoods,
 *   day:YYYY-MM-DD, coach:YYYY-MM-DD:mode,
 *   outbox:items, outbox:foods, outbox:profile, sync:cursor, sync:owner
 */
const store = createStore("bite-db", "kv");

/** One compact row per logged day. `target` is a snapshot so old days are judged by the targets you had then. */
export type DaySummary = Nutrients & { date: string; count: number; target?: Targets };

/* ------------------------------ sync outbox ------------------------------ */
// Every local write records what changed; the sync engine pushes it. Writes
// that come *from* sync pass { fromSync: true } so they aren't queued again.

type WriteOpts = { fromSync?: boolean };
const listeners = new Set<() => void>();
/** Subscribe to local (user-made) changes, e.g. to schedule a sync. */
export function onLocalChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const changed = () => listeners.forEach((cb) => cb());

async function queueItems(changes: Record<string, ItemChange>) {
  if (!Object.keys(changes).length) return;
  await update<Record<string, ItemChange>>("outbox:items", (o) => ({ ...(o ?? {}), ...changes }), store);
  changed();
}
async function queueFoods(changes: Record<string, FoodChange>) {
  if (!Object.keys(changes).length) return;
  await update<Record<string, FoodChange>>("outbox:foods", (o) => ({ ...(o ?? {}), ...changes }), store);
  changed();
}
async function queueProfile() {
  await update<number>("outbox:profile", (n) => (n ?? 0) + 1, store);
  changed();
}

export const getOutbox = async () => ({
  items: (await get<Record<string, ItemChange>>("outbox:items", store)) ?? {},
  foods: (await get<Record<string, FoodChange>>("outbox:foods", store)) ?? {},
  profile: (await get<number>("outbox:profile", store)) ?? 0,
});

/** Drop pushed entries, but only if they weren't changed again meanwhile. */
export async function ackOutbox(pushed: Awaited<ReturnType<typeof getOutbox>>) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  await update<Record<string, ItemChange>>(
    "outbox:items",
    (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([id, c]) => !same(pushed.items[id], c))),
    store,
  );
  await update<Record<string, FoodChange>>(
    "outbox:foods",
    (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, c]) => !(k in pushed.foods && same(pushed.foods[k], c)))),
    store,
  );
  await update<number>("outbox:profile", (n) => ((n ?? 0) === pushed.profile ? 0 : (n ?? 0)), store);
}

/** Queue everything on this device (first sign-in: upload data made before the account). */
export async function queueAllLocal() {
  const all = await entries(store);
  const items: Record<string, ItemChange> = {};
  for (const [k, v] of all) {
    if (!String(k).startsWith("day:")) continue;
    const d = v as DayLog;
    for (const i of d.items) items[i.id] = { date: d.date, item: i };
  }
  await queueItems(items);
  await queueFoods(await getMyFoods());
  if (await getProfile()) await queueProfile();
}

export const getSyncMeta = async () => ({
  cursor: (await get<string>("sync:cursor", store)) ?? null,
  owner: (await get<string>("sync:owner", store)) ?? null,
});
export const setSyncCursor = (c: string) => set("sync:cursor", c, store);
export const setSyncOwner = (id: string) => set("sync:owner", id, store);

/** Wipe everything on this device (sign-out, or a different account signing in). */
export const clearLocal = () => clear(store);

/* ------------------------------ records ------------------------------ */

export const getProfile = () => get<Profile>("profile", store);
export async function saveProfile(p: Profile, opts: WriteOpts = {}) {
  await set("profile", p, store);
  if (!opts.fromSync) await queueProfile();
}
export const getOverrides = async () => (await get<TargetOverrides>("overrides", store)) ?? {};
export async function saveOverrides(o: TargetOverrides, opts: WriteOpts = {}) {
  await set("overrides", o, store);
  if (!opts.fromSync) await queueProfile();
}
export const getPasscode = () => get<string>("passcode", store);
export const savePasscode = (p: string) => (p ? set("passcode", p, store) : del("passcode", store));

export async function getDay(date: string): Promise<DayLog> {
  return (await get<DayLog>(`day:${date}`, store)) ?? { date, items: [] };
}

export const getSummaries = async () => (await get<Record<string, DaySummary>>("summaries", store)) ?? {};

export async function getDays(dates: string[]): Promise<DayLog[]> {
  const days = await getMany<DayLog | undefined>(dates.map((d) => `day:${d}`), store);
  return days.map((d, i) => d ?? { date: dates[i], items: [] });
}

/** Saves a day and keeps the compact per-day summary index in sync. */
export async function saveDay(day: DayLog, target?: Targets, opts: WriteOpts = {}): Promise<Record<string, DaySummary>> {
  if (!opts.fromSync) await queueItems(diffDay(await get<DayLog>(`day:${day.date}`, store), day));
  const summaries = await getSummaries();
  if (day.items.length) {
    summaries[day.date] = { date: day.date, count: day.items.length, ...sumItems(day.items), target: target ?? summaries[day.date]?.target };
  }
  else delete summaries[day.date];
  await setMany(
    [
      [`day:${day.date}`, day],
      ["summaries", summaries],
    ],
    store,
  );
  return summaries;
}

/* --------------------------- personal foods --------------------------- */

export const getMyFoods = async () => (await get<Record<string, PersonalFood>>("myFoods", store)) ?? {};
export async function saveMyFoods(f: Record<string, PersonalFood>, opts: WriteOpts = {}) {
  if (!opts.fromSync) await queueFoods(diffFoods(await getMyFoods(), f));
  await set("myFoods", f, store);
}

/* --------------------------- coach cache ----------------------------- */

export const getCoach = (date: string, mode: string) => get<CoachResult & { hash: string }>(`coach:${date}:${mode}`, store);
export const saveCoach = (date: string, mode: string, r: CoachResult & { hash: string }) => set(`coach:${date}:${mode}`, r, store);

/* --------------------------- parse cache ----------------------------- */
// Repeated inputs cost nothing: keyed by normalised text + meal slot.

const CACHE_LIMIT = 200;
type CacheEntry = { result: ParseResult; at: number };

export function normaliseText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
}

export async function getCachedParse(key: string): Promise<ParseResult | undefined> {
  const cache = (await get<Record<string, CacheEntry>>("parseCache", store)) ?? {};
  return cache[key]?.result;
}

export async function setCachedParse(key: string, result: ParseResult) {
  const cache = (await get<Record<string, CacheEntry>>("parseCache", store)) ?? {};
  cache[key] = { result, at: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > CACHE_LIMIT) {
    keys
      .sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, keys.length - CACHE_LIMIT)
      .forEach((k) => delete cache[k]);
  }
  await set("parseCache", cache, store);
}

/* --------------------------- backup ---------------------------------- */

const BackupSchema = z.object({
  app: z.literal("bite"),
  version: z.literal(1),
  exportedAt: z.string(),
  profile: ProfileSchema.nullable(),
  overrides: TargetOverridesSchema,
  days: z.array(DayLogSchema),
  myFoods: z.record(z.string(), z.any()).optional(),
});
export type Backup = z.infer<typeof BackupSchema>;

export async function exportAll(): Promise<Backup> {
  const all = await entries(store);
  const days = all
    .filter(([k]) => String(k).startsWith("day:"))
    .map(([, v]) => v as DayLog)
    .filter((d) => d.items.length)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    app: "bite",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: (await getProfile()) ?? null,
    overrides: await getOverrides(),
    days,
    myFoods: await getMyFoods(),
  };
}

/** Replaces all local data with the backup. Passcode is kept; parse cache is dropped. */
export async function importAll(raw: unknown): Promise<{ days: number }> {
  const backup = BackupSchema.parse(raw);
  const passcode = await getPasscode();
  await clear(store);
  const summaries: Record<string, DaySummary> = {};
  for (const d of backup.days) {
    if (d.items.length) summaries[d.date] = { date: d.date, count: d.items.length, ...sumItems(d.items) };
  }
  const writes: [IDBValidKey, unknown][] = [
    ["overrides", backup.overrides],
    ["summaries", summaries],
    ...backup.days.map((d) => [`day:${d.date}`, d] as [IDBValidKey, unknown]),
  ];
  if (backup.profile) writes.push(["profile", backup.profile]);
  if (backup.myFoods) writes.push(["myFoods", backup.myFoods]);
  if (passcode) writes.push(["passcode", passcode]);
  const meta = await getSyncMeta();
  if (meta.owner) writes.push(["sync:owner", meta.owner]);
  await setMany(writes, store);
  await queueAllLocal(); // imported data goes up to the account on the next sync
  return { days: backup.days.length };
}
