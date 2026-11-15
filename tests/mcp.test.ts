import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersonalFood } from "@/lib/calibration";
import type { DayLog, LogItem, Profile, TargetOverrides } from "@/lib/schemas";
import { logDayKey, validTimeZone, wallClock } from "@/lib/totals";
import { fileStorage, readPublicEnv } from "@/mcp/auth";
import { DEFAULT_TIME_ZONE, serveMcp, timeZoneFor } from "@/mcp/http";
import type { BiteStore, RecordData } from "@/mcp/store";
import { INSTRUCTIONS, registerTools } from "@/mcp/tools";

/** The synced data, in memory. */
class FakeStore implements BiteStore {
  profile: Profile | null = { age: 30, sex: "female", heightCm: 165, weightKg: 65, activity: "light", goal: "lose", rateKgPerWeek: 0.5, diet: "", healthNotes: "" };
  overrides: TargetOverrides = {};
  days = new Map<string, LogItem[]>();
  records: { [K in keyof RecordData]: Record<string, RecordData[K]> } = { weight: {}, water: {} };
  foods: Record<string, PersonalFood> = {};

  async getProfile() {
    return { profile: this.profile, overrides: this.overrides };
  }
  async getDays(from: string, to: string): Promise<DayLog[]> {
    return [...this.days.entries()].filter(([d, items]) => d >= from && d <= to && items.length).map(([date, items]) => ({ date, items }));
  }
  async addItems(date: string, items: LogItem[]) {
    this.days.set(date, [...(this.days.get(date) ?? []), ...items]);
  }
  async deleteItem(id: string) {
    for (const [date, items] of this.days) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      this.days.set(date, items.filter((i) => i.id !== id));
      return { date, item };
    }
    return null;
  }
  async getRecords<K extends keyof RecordData>(kind: K) {
    return { ...this.records[kind] };
  }
  async putRecord<K extends keyof RecordData>(kind: K, key: string, data: RecordData[K]) {
    (this.records[kind] as Record<string, RecordData[K]>)[key] = data;
  }
  async getMyFoods() {
    return this.foods;
  }
}

// 1 pm on Sunday 1 November 2026, so "today" is 2026-11-01 and the meal slot is lunch.
let clock = new Date(2026, 10, 1, 13, 0);
let store: FakeStore;
let client: Client;

beforeEach(async () => {
  clock = new Date(2026, 10, 1, 13, 0);
  store = new FakeStore();
  const server = new McpServer({ name: "bite", version: "test" }, { instructions: INSTRUCTIONS });
  registerTools(server, store, { now: () => clock });
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

/** Call a tool and parse its JSON reply. */
async function call<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<{ data: T; raw: string; isError: boolean }> {
  const res = await client.callTool({ name, arguments: args });
  const raw = (res.content as { type: string; text: string }[])[0].text;
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* a plain sentence */
  }
  return { data: data as T, raw, isError: !!res.isError };
}

describe("MCP server", () => {
  it("lists its tools, marking the read-only ones", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["delete_food", "get_day", "get_progress", "get_targets", "log_food", "log_water", "log_weight", "search_foods"]);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort();
    expect(readOnly).toEqual(["get_day", "get_progress", "get_targets", "search_foods"]);
    expect(client.getInstructions()).toContain("4 am to 4 am");
  });

  it("logs food from text with the app's parser and shows the day", async () => {
    const res = await call<{ logged: boolean; date: string; items: { id: string; name: string; meal: string; calories: number }[]; remaining: { calories: number } }>("log_food", {
      text: "2 roti and a katori of dal",
    });
    expect(res.data.logged).toBe(true);
    expect(res.data.date).toBe("2026-11-01");
    expect(res.data.items.map((i) => [i.name, i.meal])).toEqual([["Roti", "lunch"], ["Dal", "lunch"]]);
    const eaten = res.data.items.reduce((s, i) => s + i.calories, 0);

    const day = await call<{ eaten: { calories: number }; targets: { calories: number }; remaining: { calories: number }; meals: Record<string, { items: unknown[] }>; is_today: boolean }>("get_day");
    expect(day.data.is_today).toBe(true);
    expect(day.data.eaten.calories).toBe(eaten);
    expect(day.data.remaining.calories).toBe(day.data.targets.calories - eaten);
    expect(day.data.meals.lunch.items).toHaveLength(2);
    // Stored exactly as the app stores items, so a device can sync them in.
    const stored = store.days.get("2026-11-01")!;
    expect(stored[0]).toMatchObject({ source: "llm", name: "Roti" });
    expect(stored[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs nothing when part of the text isn't recognised, and says what's missing", async () => {
    const res = await call<{ logged: boolean; not_recognised: string[]; recognised: { name: string }[] }>("log_food", { text: "2 roti and khao suey" });
    expect(res.data.logged).toBe(false);
    expect(res.data.not_recognised).toEqual(["khao suey"]);
    expect(res.data.recognised.map((i) => i.name)).toEqual(["Roti"]);
    expect(store.days.size).toBe(0);
  });

  it("logs caller-supplied items, to a past day and a chosen meal", async () => {
    const res = await call<{ logged: boolean; date: string; items: { meal: string; calories: number }[] }>("log_food", {
      items: [{ name: "Khao suey", quantity: 1, unit: "bowl", calories: 520, protein_g: 18, carbs_g: 60, fat_g: 22 }],
      date: "2026-10-31",
      meal: "dinner",
    });
    expect(res.data).toMatchObject({ logged: true, date: "2026-10-31" });
    expect(res.data.items[0]).toMatchObject({ meal: "dinner", calories: 520 });
    expect(store.days.get("2026-10-31")).toHaveLength(1);
  });

  it("rejects future dates and ambiguous arguments without writing", async () => {
    expect((await call("log_food", { text: "2 roti", date: "2026-11-02" })).isError).toBe(true);
    expect((await call("log_food", {})).isError).toBe(true);
    expect((await call("log_food", { text: "2 roti", items: [{ name: "x", quantity: 1, unit: "g", calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0 }] })).isError).toBe(true);
    expect((await call("log_water", { add_ml: 250, set_ml: 500 })).isError).toBe(true);
    expect(store.days.size).toBe(0);
    expect(store.records.water).toEqual({});
  });

  it("counts the small hours toward the day before", async () => {
    clock = new Date(2026, 10, 2, 1, 30); // 1:30 am on the 2nd
    const res = await call<{ date: string }>("log_food", { text: "1 samosa" });
    expect(res.data.date).toBe("2026-11-01");
  });

  it("deletes a logged item by id", async () => {
    const logged = await call<{ items: { id: string }[] }>("log_food", { text: "2 roti" });
    const id = logged.data.items[0].id;
    const del = await call<{ deleted: { name: string }; date: string }>("delete_food", { id });
    expect(del.data).toMatchObject({ deleted: { name: "Roti" }, date: "2026-11-01" });
    expect(store.days.get("2026-11-01")).toEqual([]);
    expect((await call("delete_food", { id })).isError).toBe(true);
  });

  it("adds, removes and sets water against the person's goal", async () => {
    expect((await call("log_water", { add_ml: 250 })).data).toEqual({ date: "2026-11-01", ml: 250, goal_ml: 2250, left_ml: 2000 });
    expect((await call<{ ml: number }>("log_water", { add_ml: 500 })).data.ml).toBe(750);
    expect((await call<{ ml: number }>("log_water", { add_ml: -250 })).data.ml).toBe(500);
    expect((await call<{ ml: number }>("log_water", { set_ml: 2250 })).data).toMatchObject({ ml: 2250, left_ml: 0 });
    store.profile = { ...store.profile!, waterGoalMl: 3000 };
    expect((await call<{ goal_ml: number }>("log_water", { add_ml: 250, date: "2026-10-31" })).data).toMatchObject({ ml: 250, goal_ml: 3000 });
    expect(store.records.water["2026-11-01"].ml).toBe(2250);
  });

  it("records a weigh-in and reports the trend", async () => {
    const res = await call<{ kg: number; trend_kg: number }>("log_weight", { kg: 64.64 });
    expect(res.data).toMatchObject({ date: "2026-11-01", kg: 64.6, trend_kg: 64.6 });
    expect(store.records.weight["2026-11-01"].kg).toBe(64.6);
    // Targets now use the trend weight, like the app.
    const t = await call<{ profile: { weight_kg: number } }>("get_targets");
    expect(t.data.profile.weight_kg).toBe(64.6);
  });

  it("summarises progress over a range", async () => {
    await call("log_food", { text: "2 roti and a katori of dal", date: "2026-10-31" });
    await call("log_food", { text: "2 roti" });
    const res = await call<{ from: string; to: string; stats: { logged: number }; days: { date: string; status: string }[]; logging_streak_days: number }>("get_progress", { days: 7 });
    expect(res.data).toMatchObject({ from: "2026-10-26", to: "2026-11-01", stats: { logged: 2 }, logging_streak_days: 2 });
    expect(res.data.days.map((d) => [d.date, d.status])).toEqual([["2026-10-31", "low"], ["2026-11-01", "in progress"]]);
  });

  it("explains itself when there's no profile yet", async () => {
    store.profile = null;
    expect((await call("get_targets")).isError).toBe(true);
    const day = await call<{ targets: null; note: string }>("get_day");
    expect(day.data.targets).toBeNull();
    expect(day.data.note).toMatch(/No profile yet/);
  });

  it("searches saved foods first, then the library", async () => {
    store.foods = { whey: { key: "whey", name: "Whey protein", unit: "scoop", per: [130, 26, 3, 2, 0], verified: true, uses: 5, updatedAt: 1 } };
    const res = await call<{ results: { name: string; calories: number; source: string }[] }>("search_foods", { query: "whey" });
    expect(res.data.results[0]).toMatchObject({ name: "Whey protein", calories: 130, source: "your saved values" });
    expect(res.data.results.filter((r) => r.name === "Whey protein")).toHaveLength(1);
    const diet = await call<{ results: { name: string }[] }>("search_foods", { query: "diet coke" });
    expect(diet.data.results[0].name).toBe("Diet soft drink");
    expect((await call("search_foods", { query: "zzzz" })).raw).toMatch(/Nothing matching/);
  });
});

describe("MCP sign-in storage", () => {
  it("keeps the session in a file only the owner can read, and removes it when emptied", () => {
    const file = join(mkdtempSync(join(tmpdir(), "bite-mcp-")), "nested", "session.json");
    const s = fileStorage(file);
    expect(s.getItem("k")).toBeNull();
    s.setItem("k", "v");
    expect(s.getItem("k")).toBe("v");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    s.removeItem("k");
    expect(() => statSync(file)).toThrow();
  });

  it("reads only the public Supabase settings from .env.local", () => {
    const file = join(mkdtempSync(join(tmpdir(), "bite-env-")), ".env.local");
    writeFileSync(file, 'NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"\nNEXT_PUBLIC_SUPABASE_ANON_KEY=anon\nPOSTGRES_URL="postgres://secret"\nLLM_API_KEY=sk-secret\n');
    const env = readPublicEnv(file);
    expect(env).toEqual({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(JSON.stringify(env)).not.toContain("secret");
    expect(readFileSync(file, "utf8")).toContain("secret"); // the file itself is untouched
  });
});

/* --------------------------- hosted (HTTP) server --------------------------- */

const rpc = (method: string, params: unknown, id = 1) =>
  new Request("https://bite.example/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

describe("time zones", () => {
  it("reads the wall clock of a zone, whatever zone the server runs in", () => {
    const at = new Date("2026-11-01T20:00:00Z"); // 1:30 am on the 2nd in India
    const india = wallClock(at, "Asia/Kolkata");
    expect([india.getDate(), india.getHours(), india.getMinutes()]).toEqual([2, 1, 30]);
    expect(logDayKey(india)).toBe("2026-11-01"); // before 4 am: still the 1st
    expect(logDayKey(wallClock(new Date("2026-11-01T23:00:00Z"), "Asia/Kolkata"))).toBe("2026-11-02"); // 4:30 am
    expect(logDayKey(wallClock(at, "America/Los_Angeles"))).toBe("2026-11-01"); // noon on the 1st
    expect(validTimeZone("Asia/Kolkata")).toBe(true);
    expect(validTimeZone("Mars/Olympus")).toBe(false);
    expect(validTimeZone(undefined)).toBe(false);
  });

  it("takes a person's zone from their profile, then the deployment, then India", async () => {
    const s = new FakeStore();
    expect(await timeZoneFor(s, {})).toBe(DEFAULT_TIME_ZONE);
    expect(await timeZoneFor(s, { BITE_TIMEZONE: "Europe/London" })).toBe("Europe/London");
    s.profile = { ...s.profile!, timeZone: "America/New_York" };
    expect(await timeZoneFor(s, { BITE_TIMEZONE: "Europe/London" })).toBe("America/New_York");
    s.profile = { ...s.profile!, timeZone: "Not/AZone" };
    expect(await timeZoneFor(s, {})).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("hosted MCP endpoint", () => {
  it("answers initialize and lists tools over HTTP, with no session to keep", async () => {
    const s = new FakeStore();
    const init = await serveMcp(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }), s);
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();
    const body = (await init.json()) as { result: { serverInfo: { name: string }; instructions: string } };
    expect(body.result.serverInfo.name).toBe("bite");
    expect(body.result.instructions).toContain("4 am to 4 am");

    const list = await serveMcp(rpc("tools/list", {}, 2), s);
    const tools = ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools).toHaveLength(8);
  });

  it("logs into the person's day, not the server's, and stamps real time", async () => {
    const s = new FakeStore();
    const at = new Date("2026-11-01T20:00:00Z"); // 1:30 am on the 2nd in India: still the 1st, and it's dinner time
    const res = await serveMcp(rpc("tools/call", { name: "log_food", arguments: { items: [{ name: "Maggi", quantity: 1, unit: "pack", calories: 380, protein_g: 8, carbs_g: 52, fat_g: 14 }] } }), s, {
      now: () => at,
      timeZone: "Asia/Kolkata",
    });
    const out = JSON.parse(((await res.json()) as { result: { content: { text: string }[] } }).result.content[0].text) as { date: string; items: { meal: string }[] };
    expect(out.date).toBe("2026-11-01");
    expect(out.items[0].meal).toBe("dinner");
    expect(s.days.get("2026-11-01")![0].createdAt).toBe(at.getTime());
    // The same instant for someone in California is noon on the 1st: lunch.
    const s2 = new FakeStore();
    await serveMcp(rpc("tools/call", { name: "log_food", arguments: { text: "2 roti" } }), s2, { now: () => at, timeZone: "America/Los_Angeles" });
    expect(s2.days.get("2026-11-01")![0].meal).toBe("lunch");
  });

  it("rejects malformed protocol requests without touching data", async () => {
    const s = new FakeStore();
    const res = await serveMcp(new Request("https://bite.example/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" }), s);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(s.days.size).toBe(0);
  });
});

describe("hosted MCP routes", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("challenges callers without a token and says where to sign in", async () => {
    const { POST, GET } = await import("@/app/api/mcp/route");
    const res = await POST(new Request("https://bite.example/api/mcp", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-host": "bite.example", "x-forwarded-proto": "https" }, body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://bite.example/.well-known/oauth-protected-resource/api/mcp"');
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/Sign in/);
    expect((await GET()).status).toBe(405);
  });

  it("publishes which sign-in server protects the endpoint", async () => {
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/[[...path]]/route");
    const req = new Request("http://internal/.well-known/oauth-protected-resource/api/mcp", { headers: { "x-forwarded-host": "bite.example", "x-forwarded-proto": "https" } });
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await GET(req)).status).toBe(404); // local-only deployment: nothing to sign in to
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co/";
    const res = await GET(req);
    expect(await res.json()).toEqual({ resource: "https://bite.example/api/mcp", authorization_servers: ["https://abc.supabase.co/auth/v1"], bearer_methods_supported: ["header"], resource_name: "Bite" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
