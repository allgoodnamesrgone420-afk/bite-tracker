/**
 * Pure sync logic (no I/O), unit-tested. Local IndexedDB stays the source the
 * UI reads; changes are queued in an outbox, pushed to Supabase, and remote
 * changes are pulled and merged by record id. Server timestamps decide order,
 * so the last write to reach the server wins per record.
 */
import type { PersonalFood } from "./calibration";
import type { DayLog, LogItem } from "./schemas";

/** Queued change for one log item; `item: null` means deleted. */
export type ItemChange = { date: string; item: LogItem | null };
export type FoodChange = PersonalFood | null;

export type RemoteItemRow = { id: string; date: string; item: LogItem; deleted: boolean; updated_at: string };
export type RemoteFoodRow = { key: string; food: PersonalFood | null; deleted: boolean; updated_at: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Items added, changed or removed between two versions of a day. */
export function diffDay(prev: DayLog | undefined, next: DayLog): Record<string, ItemChange> {
  const out: Record<string, ItemChange> = {};
  const before = new Map((prev?.items ?? []).map((i) => [i.id, i]));
  for (const i of next.items) {
    if (!same(before.get(i.id), i)) out[i.id] = { date: next.date, item: i };
    before.delete(i.id);
  }
  for (const id of before.keys()) out[id] = { date: next.date, item: null };
  return out;
}

export function diffFoods(prev: Record<string, PersonalFood>, next: Record<string, PersonalFood>): Record<string, FoodChange> {
  const out: Record<string, FoodChange> = {};
  for (const [k, f] of Object.entries(next)) if (!same(prev[k], f)) out[k] = f;
  for (const k of Object.keys(prev)) if (!(k in next)) out[k] = null;
  return out;
}

/**
 * Merge remote item rows into local days. Items with unpushed local changes
 * are skipped (the local edit is newer and will be pushed). Returns only the
 * days that changed.
 */
export function applyRemoteItems(days: Record<string, DayLog>, rows: RemoteItemRow[], pending: Set<string>): Record<string, DayLog> {
  const changed: Record<string, DayLog> = {};
  const get = (date: string) => changed[date] ?? days[date] ?? { date, items: [] };
  for (const r of rows) {
    if (pending.has(r.id)) continue;
    const day = get(r.date);
    const idx = day.items.findIndex((i) => i.id === r.id);
    if (r.deleted) {
      if (idx === -1) continue;
      changed[r.date] = { ...day, items: day.items.filter((i) => i.id !== r.id) };
    } else {
      const item = { ...r.item, id: r.id };
      if (idx !== -1 && same(day.items[idx], item)) continue;
      const items = idx === -1 ? [...day.items, item] : day.items.map((i, k) => (k === idx ? item : i));
      changed[r.date] = { ...day, items: items.sort((a, b) => a.createdAt - b.createdAt) };
    }
  }
  return changed;
}

export function applyRemoteFoods(foods: Record<string, PersonalFood>, rows: RemoteFoodRow[], pending: Set<string>): Record<string, PersonalFood> | null {
  let next: Record<string, PersonalFood> | null = null;
  for (const r of rows) {
    if (pending.has(r.key)) continue;
    const cur = (next ?? foods)[r.key];
    if (r.deleted || !r.food) {
      if (!cur) continue;
      next ??= { ...foods };
      delete next[r.key];
    } else if (!same(cur, r.food)) {
      next ??= { ...foods };
      next[r.key] = r.food;
    }
  }
  return next;
}

/** Latest server timestamp seen, used as the next pull cursor. */
export function maxTimestamp(current: string | null, rows: { updated_at: string }[]): string | null {
  let best = current;
  for (const r of rows) if (!best || Date.parse(r.updated_at) > Date.parse(best)) best = r.updated_at;
  return best;
}
