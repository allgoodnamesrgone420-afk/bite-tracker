/**
 * Where the MCP tools read and write. The app keeps its working copy on each
 * device and syncs through Supabase; the server uses that synced copy, so
 * what it writes shows up in the app on its next sync (and vice versa).
 * Tools only see this interface, which keeps them testable without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalFood } from "../lib/calibration";
import { LogItemSchema, ProfileSchema, TargetOverridesSchema, type DayLog, type LogItem, type Profile, type TargetOverrides } from "../lib/schemas";
import type { WaterDay } from "../lib/water";
import type { WeighIn } from "../lib/weight";

/** The keyed records the tools use (weigh-ins and water, both keyed by date). */
export type RecordData = { weight: WeighIn; water: WaterDay };

export interface BiteStore {
  getProfile(): Promise<{ profile: Profile | null; overrides: TargetOverrides }>;
  /** Days with food between two dates (inclusive), items in the order they were logged. */
  getDays(from: string, to: string): Promise<DayLog[]>;
  addItems(date: string, items: LogItem[]): Promise<void>;
  /** Removes one item; returns it (with its date), or null if it isn't yours or doesn't exist. */
  deleteItem(id: string): Promise<{ date: string; item: LogItem } | null>;
  getRecords<K extends keyof RecordData>(kind: K): Promise<Record<string, RecordData[K]>>;
  putRecord<K extends keyof RecordData>(kind: K, key: string, data: RecordData[K]): Promise<void>;
  getMyFoods(): Promise<Record<string, PersonalFood>>;
}

const PAGE = 1000; // Supabase's default row cap per request

/** Database errors in words an assistant can pass on. */
function problem(message: string): Error {
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(message)) return new Error("Couldn't reach Bite's database. Check the internet connection and try again.");
  if (/jwt|token/i.test(message)) return new Error("The saved Bite sign-in has expired. In the app folder, run: npm run mcp:login");
  return new Error(`Bite's database refused that: ${message}`);
}

export class SupabaseStore implements BiteStore {
  constructor(
    private sb: SupabaseClient,
    private userId: string,
  ) {}

  /** Every page of a query; `page` gets the row range to fetch. */
  private async all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from, from + PAGE - 1);
      if (error) throw problem(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE) return rows;
    }
  }

  async getProfile() {
    const { data, error } = await this.sb.from("profiles").select("profile,overrides").maybeSingle();
    if (error) throw problem(error.message);
    const profile = ProfileSchema.safeParse(data?.profile);
    const overrides = TargetOverridesSchema.safeParse(data?.overrides ?? {});
    return { profile: profile.success ? profile.data : null, overrides: overrides.success ? overrides.data : {} };
  }

  async getDays(from: string, to: string) {
    const rows = await this.all<{ date: string; item: unknown }>((a, b) =>
      this.sb.from("log_items").select("date,item").eq("deleted", false).gte("date", from).lte("date", to).order("date").order("id").range(a, b),
    );
    const days = new Map<string, LogItem[]>();
    for (const r of rows) {
      const item = LogItemSchema.safeParse(r.item);
      if (!item.success) continue; // a row this version doesn't understand: leave it alone
      days.set(r.date, [...(days.get(r.date) ?? []), item.data]);
    }
    return [...days.entries()].map(([date, items]) => ({ date, items: items.sort((x, y) => x.createdAt - y.createdAt) }));
  }

  async addItems(date: string, items: LogItem[]) {
    const { error } = await this.sb.from("log_items").insert(items.map((item) => ({ id: item.id, user_id: this.userId, date, item, deleted: false })));
    if (error) throw problem(error.message);
  }

  async deleteItem(id: string) {
    // Same shape the app writes for a delete; devices drop the item on their next sync.
    const { data, error } = await this.sb.from("log_items").update({ deleted: true }).eq("id", id).eq("deleted", false).select("date,item");
    if (error) throw problem(error.message);
    const item = LogItemSchema.safeParse(data?.[0]?.item);
    return data?.[0] && item.success ? { date: data[0].date as string, item: item.data } : null;
  }

  async getRecords<K extends keyof RecordData>(kind: K) {
    const rows = await this.all<{ key: string; data: unknown }>((a, b) => this.sb.from("records").select("key,data").eq("kind", kind).eq("deleted", false).order("key").range(a, b));
    return Object.fromEntries(rows.filter((r) => r.data && typeof r.data === "object").map((r) => [r.key, r.data])) as Record<string, RecordData[K]>;
  }

  async putRecord<K extends keyof RecordData>(kind: K, key: string, data: RecordData[K]) {
    const { error } = await this.sb.from("records").upsert({ user_id: this.userId, kind, key, data, deleted: false }, { onConflict: "user_id,kind,key" });
    if (error) throw problem(error.message);
  }

  async getMyFoods() {
    const rows = await this.all<{ key: string; food: PersonalFood | null }>((a, b) => this.sb.from("my_foods").select("key,food").eq("deleted", false).order("key").range(a, b));
    return Object.fromEntries(rows.filter((r) => r.food).map((r) => [r.key, r.food as PersonalFood]));
  }
}
