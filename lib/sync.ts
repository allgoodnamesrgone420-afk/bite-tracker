"use client";
/**
 * Two-way sync between this device's IndexedDB and Supabase.
 *   push: upsert everything in the outbox (items, foods, profile)
 *   pull: fetch rows updated since the last cursor and merge them locally
 * Server-assigned updated_at orders changes; unpushed local edits win until
 * they're pushed. Safe to call often; concurrent calls are coalesced.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";
import type { DayLog, Profile, TargetOverrides } from "./schemas";
import { applyRemoteFoods, applyRemoteItems, maxTimestamp, type RemoteFoodRow, type RemoteItemRow } from "./sync-core";

const PAGE = 500;
const OVERLAP_MS = 5_000; // re-read a few seconds back to catch concurrent commits

export type SyncResult = { pushed: number; pulled: number; changedLocal: boolean };

let running: Promise<SyncResult> | null = null;

export function syncNow(sb: SupabaseClient, userId: string): Promise<SyncResult> {
  running ??= run(sb, userId).finally(() => {
    running = null;
  });
  return running;
}

async function run(sb: SupabaseClient, userId: string): Promise<SyncResult> {
  const pushed = await push(sb, userId);
  const pulled = await pull(sb);
  return { pushed, pulled: pulled.count, changedLocal: pulled.changed };
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function push(sb: SupabaseClient, userId: string): Promise<number> {
  const out = await db.getOutbox();
  const items = Object.entries(out.items).map(([id, c]) => ({
    id,
    user_id: userId,
    date: c.date,
    item: c.item ?? {},
    deleted: c.item === null,
  }));
  const foods = Object.entries(out.foods).map(([key, f]) => ({ user_id: userId, key, food: f, deleted: f === null }));

  for (let i = 0; i < items.length; i += PAGE) check(await sb.from("log_items").upsert(items.slice(i, i + PAGE), { onConflict: "id" }));
  for (let i = 0; i < foods.length; i += PAGE) check(await sb.from("my_foods").upsert(foods.slice(i, i + PAGE), { onConflict: "user_id,key" }));
  if (out.profile) {
    const [profile, overrides] = await Promise.all([db.getProfile(), db.getOverrides()]);
    check(await sb.from("profiles").upsert({ user_id: userId, profile: profile ?? null, overrides }, { onConflict: "user_id" }));
  }
  await db.ackOutbox(out);
  return items.length + foods.length + (out.profile ? 1 : 0);
}

async function pullTable<T extends { updated_at: string }>(sb: SupabaseClient, table: string, cols: string, since: string | null): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(cols).order("updated_at", { ascending: true }).range(from, from + PAGE - 1);
    if (since) q = q.gt("updated_at", since);
    const page = check(await q) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function pull(sb: SupabaseClient): Promise<{ count: number; changed: boolean }> {
  const { cursor } = await db.getSyncMeta();
  const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;

  const [itemRows, foodRows, profileRows] = await Promise.all([
    pullTable<RemoteItemRow>(sb, "log_items", "id,date,item,deleted,updated_at", since),
    pullTable<RemoteFoodRow>(sb, "my_foods", "key,food,deleted,updated_at", since),
    pullTable<{ profile: Profile | null; overrides: TargetOverrides; updated_at: string }>(sb, "profiles", "profile,overrides,updated_at", since),
  ]);
  const pending = await db.getOutbox();
  let changed = false;

  if (itemRows.length) {
    const dates = [...new Set(itemRows.map((r) => r.date))];
    const days = Object.fromEntries((await db.getDays(dates)).map((d) => [d.date, d] as [string, DayLog]));
    const updated = applyRemoteItems(days, itemRows, new Set(Object.keys(pending.items)));
    for (const day of Object.values(updated)) await db.saveDay(day, undefined, { fromSync: true });
    changed ||= Object.keys(updated).length > 0;
  }

  if (foodRows.length) {
    const next = applyRemoteFoods(await db.getMyFoods(), foodRows, new Set(Object.keys(pending.foods)));
    if (next) {
      await db.saveMyFoods(next, { fromSync: true });
      changed = true;
    }
  }

  const remoteProfile = profileRows.at(-1);
  if (remoteProfile && !pending.profile) {
    if (remoteProfile.profile) await db.saveProfile(remoteProfile.profile, { fromSync: true });
    await db.saveOverrides(remoteProfile.overrides ?? {}, { fromSync: true });
    changed = true;
  }

  const next = maxTimestamp(cursor, [...itemRows, ...foodRows, ...profileRows]);
  if (next && next !== cursor) await db.setSyncCursor(next);
  return { count: itemRows.length + foodRows.length + profileRows.length, changed };
}

