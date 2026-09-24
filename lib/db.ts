"use client";
import { clear, createStore, del, entries, get, getMany, set, setMany } from "idb-keyval";
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
import type { CoachResult } from "./schemas";
import type { Targets } from "./targets";
import { sumItems, type Nutrients } from "./totals";

/**
 * All user data lives in IndexedDB on this device. Keys:
 *   profile, overrides, passcode, summaries, parseCache, myFoods,
 *   day:YYYY-MM-DD, coach:YYYY-MM-DD:mode
 */
const store = createStore("bite-db", "kv");

/** One compact row per logged day. `target` is a snapshot so old days are judged by the targets you had then. */
export type DaySummary = Nutrients & { date: string; count: number; target?: Targets };

export const getProfile = () => get<Profile>("profile", store);
export const saveProfile = (p: Profile) => set("profile", p, store);
export const getOverrides = async () => (await get<TargetOverrides>("overrides", store)) ?? {};
export const saveOverrides = (o: TargetOverrides) => set("overrides", o, store);
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
export async function saveDay(day: DayLog, target?: Targets): Promise<Record<string, DaySummary>> {
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
export const saveMyFoods = (f: Record<string, PersonalFood>) => set("myFoods", f, store);

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
  await setMany(writes, store);
  return { days: backup.days.length };
}
