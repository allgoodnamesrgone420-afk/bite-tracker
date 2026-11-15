/**
 * The MCP tools. Everything is computed with the app's own code (food
 * library and parser, targets, micronutrients, water, weight trend), so an
 * assistant sees and logs exactly what the app would.
 */
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { personalAsFoods } from "../lib/calibration";
import { FOODS } from "../lib/food-db";
import { localParse } from "../lib/local-parser";
import { MICRO_KEYS, MICRO_META, microStatus, microTargets, sumMicros } from "../lib/micros";
import { classifyDay, lastNDates, rangeStats, targetStreakInfo, type DayRow } from "../lib/progress";
import { LogItemSchema, MEALS, Meal, MicrosSchema, ParsedItemSchema, type DayLog, type LogItem, type ParsedItem } from "../lib/schemas";
import { addDays, byMeal, logDayKey, mealForTime, remaining, streakWithFreeze, sumItems, wallClock } from "../lib/totals";
import { addWater, setWaterTotal, waterGoal } from "../lib/water";
import { currentWeight, resolveTargets, weeklyRate } from "../lib/weight";
import type { BiteStore } from "./store";

export const INSTRUCTIONS = `Bite is a calorie tracker. These tools read and change the signed-in person's own log.
- A "day" runs 4 am to 4 am local time, so food eaten after midnight belongs to the day before. Leave \`date\` out to mean the current day.
- Changes reach the phone or web app the next time it syncs (about a minute, or when it's reopened).
- log_food logs from plain text only when the app's food library recognises every part with a clear portion. Otherwise it logs nothing and tells you what's missing: ask the person, or estimate, then call it again with \`items\`.
- Numbers are estimates for home-cooked food. This is general guidance, not medical advice.`;

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 1) }] });
const fail = (message: string) => ({ ...text(message), isError: true });

const DateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .describe("Day as YYYY-MM-DD. Leave out for today (the day runs 4 am to 4 am).");

const ItemArg = z.object({
  name: z.string().min(1).max(80),
  quantity: z.number().positive().max(5000),
  unit: z.string().min(1).max(30).describe("e.g. piece, katori, g, ml, cup, serving"),
  calories: z.number().min(0).max(5000).describe("kcal for the whole quantity"),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1000),
  fat_g: z.number().min(0).max(1000),
  fibre_g: z.number().min(0).max(1000).default(0),
  meal: Meal.optional(),
  micros: MicrosSchema.optional().describe("Sodium, sugar, saturated fat, calcium and iron for the whole quantity, if known"),
});

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A logged item as the tools show it. */
const show = (i: LogItem) => ({
  id: i.id,
  name: i.name,
  quantity: i.quantity,
  unit: i.unit,
  meal: i.meal,
  calories: Math.round(i.calories),
  protein_g: r1(i.protein_g),
  carbs_g: r1(i.carbs_g),
  fat_g: r1(i.fat_g),
  fibre_g: r1(i.fibre_g),
  ...(i.assumed ? { assumed_portion: true } : {}),
});

const rowOf = (d: DayLog): DayRow => {
  const m = sumMicros(d.items);
  return { date: d.date, count: d.items.length, ...sumItems(d.items), micros: m.covered ? m.total : undefined, microCovered: m.covered };
};

export type ToolOptions = {
  /** The real time (injectable for tests). */
  now?: () => Date;
  /** The person's IANA time zone, when the server doesn't run in it (the hosted endpoint). */
  timeZone?: string;
};

export function registerTools(server: McpServer, store: BiteStore, { now = () => new Date(), timeZone }: ToolOptions = {}) {
  /** The person's wall clock: which day and meal it is for them. Never a timestamp. */
  const wall = () => (timeZone ? wallClock(now(), timeZone) : now());
  const today = () => logDayKey(wall());

  /** The date to act on: today when omitted; never the future. */
  const dayFor = (date: string | undefined) => {
    const t = today();
    if (!date) return t;
    if (date > t) throw new Error(`${date} is in the future (today is ${t}).`);
    return date;
  };

  /** Profile, targets and the recent days they're calculated from. */
  const load = async (days = 35) => {
    const t = today();
    const [{ profile, overrides }, logs, weights, water] = await Promise.all([
      store.getProfile(),
      store.getDays(addDays(t, -(days - 1)), t),
      store.getRecords("weight"),
      store.getRecords("water"),
    ]);
    const rows = Object.fromEntries(logs.map((d) => [d.date, rowOf(d)]));
    const resolved = profile ? resolveTargets({ profile, overrides, weights, rows, today: t }) : null;
    return { today: t, profile, logs, rows, weights, water, calc: resolved?.calc ?? null, tdee: resolved?.tdee ?? null };
  };

  const waterOf = (ctx: Awaited<ReturnType<typeof load>>, date: string) => {
    const ml = ctx.water[date]?.ml ?? 0;
    const goal = waterGoal(ctx.profile, ctx.calc?.weightKg);
    return { ml, goal_ml: goal, left_ml: Math.max(0, goal - ml) };
  };

  /** One day in full: what the Today screen shows. */
  const dayView = (ctx: Awaited<ReturnType<typeof load>>, date: string, items: LogItem[]) => {
    const eaten = sumItems(items);
    const targets = ctx.calc?.targets ?? null;
    const meals = byMeal(items);
    const micro = sumMicros(items);
    const microT = targets ? microTargets(targets.calories, ctx.profile?.sex) : null;
    return {
      date,
      is_today: date === ctx.today,
      targets,
      eaten,
      remaining: targets ? remaining(targets, eaten) : null,
      status: targets && items.length ? classifyDay(eaten, targets).status : null,
      meals: Object.fromEntries(MEALS.filter((m) => meals[m].items.length).map((m) => [m, { calories: Math.round(meals[m].totals.calories), items: meals[m].items.map(show) }])),
      micronutrients:
        micro.covered && microT
          ? {
              covered_items: `${micro.covered} of ${micro.count}`,
              ...Object.fromEntries(
                MICRO_KEYS.map((k) => [k, { value: micro.total[k], [MICRO_META[k].kind === "limit" ? "limit" : "target"]: microT[k], status: microStatus(k, micro.total[k], microT[k]) }]),
              ),
            }
          : null,
      water: waterOf(ctx, date),
      ...(targets ? {} : { note: "No profile yet, so there are no targets. Set it up in the app under Settings." }),
    };
  };

  const guard =
    <A>(fn: (args: A) => Promise<ReturnType<typeof text>>) =>
    async (args: A) => {
      try {
        return await fn(args);
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Something went wrong.");
      }
    };

  /* --------------------------------- read --------------------------------- */

  server.registerTool(
    "get_day",
    {
      title: "Get a day's log",
      description: "What was eaten on a day, by meal, with totals, targets, what's left, micronutrients and water. Use this for \"what have I eaten\" or \"what's left today\".",
      inputSchema: { date: DateArg },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ date }) => {
      const ctx = await load();
      const d = dayFor(date);
      const items = ctx.logs.find((l) => l.date === d)?.items ?? (await store.getDays(d, d))[0]?.items ?? [];
      return text(dayView(ctx, d, items));
    }),
  );

  server.registerTool(
    "get_progress",
    {
      title: "Get progress",
      description: "The last N days: calories and protein per day against target, on-target and logging streaks, averages, best and toughest day, weight trend and water.",
      inputSchema: { days: z.number().int().min(1).max(90).default(14).describe("How many days back, including today") },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ days }) => {
      const ctx = await load(90);
      if (!ctx.calc) return fail("No profile yet, so there are no targets to measure against. Set it up in the app under Settings.");
      const t = ctx.calc.targets;
      const dates = lastNDates(ctx.today, days);
      const w = currentWeight(ctx.weights, ctx.today);
      const rate = weeklyRate(ctx.weights, ctx.today);
      const goal = waterGoal(ctx.profile, ctx.calc.weightKg);
      const drank = dates.filter((d) => ctx.water[d]?.ml);
      return text({
        from: dates[0],
        to: ctx.today,
        targets: t,
        stats: rangeStats(ctx.rows, dates, t),
        on_target_streak_days: targetStreakInfo(ctx.rows, ctx.today, t).days,
        logging_streak_days: streakWithFreeze((d) => !!ctx.rows[d]?.count, ctx.today).days,
        days: dates
          .filter((d) => ctx.rows[d]?.count)
          .map((d) => {
            const r = ctx.rows[d];
            const c = classifyDay(r, t);
            return { date: d, calories: Math.round(r.calories), protein_g: Math.round(r.protein_g), items: r.count, status: d === ctx.today && c.status !== "over" ? "in progress" : c.status, kcal_vs_target: c.kcalDelta };
          }),
        weight: w ? { trend_kg: r1(w.trend), last_weigh_in: { date: w.last, kg: w.lastKg }, kg_per_week: rate === null ? null : Math.round(rate * 100) / 100 } : null,
        water: { goal_ml: goal, days_logged: drank.length, days_goal_hit: drank.filter((d) => ctx.water[d].ml >= goal).length, avg_ml: drank.length ? Math.round(drank.reduce((s, d) => s + ctx.water[d].ml, 0) / drank.length) : 0 },
        note: "Streaks forgive one missed day per Monday-Sunday week. Statuses: hit, over, under, low (looks incomplete).",
      });
    }),
  );

  server.registerTool(
    "get_targets",
    {
      title: "Get targets and profile",
      description: "Daily calorie, macro and water targets, how they were calculated, and the profile they come from.",
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const ctx = await load();
      if (!ctx.profile || !ctx.calc) return fail("No profile yet. Set it up in the app under Settings.");
      const p = ctx.profile;
      return text({
        profile: { age: p.age, sex: p.sex, height_cm: p.heightCm, weight_kg: ctx.calc.weightKg, activity: p.activity, goal: p.goal, rate_kg_per_week: p.rateKgPerWeek, diet: p.diet || null, health_notes: p.healthNotes || null },
        targets: ctx.calc.targets,
        water_goal_ml: waterGoal(p, ctx.calc.weightKg),
        maintenance: {
          formula_kcal: ctx.calc.formulaTdee,
          used_kcal: ctx.calc.tdee,
          from_your_data: ctx.tdee?.ok ? { kcal: ctx.tdee.fromData, confidence: ctx.tdee.confidence, logged_days: ctx.tdee.days, weigh_ins: ctx.tdee.weighIns } : null,
          ...(ctx.tdee && !ctx.tdee.ok ? { to_estimate_from_data: `needs ${ctx.tdee.need}` } : {}),
        },
        how_calculated: ctx.calc.steps,
        warnings: ctx.calc.warnings,
      });
    }),
  );

  server.registerTool(
    "search_foods",
    {
      title: "Search foods",
      description: "Look up nutrition per unit in the person's own saved foods (their values win) and the app's built-in food library of common Indian foods.",
      inputSchema: { query: z.string().min(1).max(80) },
      annotations: { readOnlyHint: true },
    },
    guard(async ({ query }) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const hit = (hay: string) => words.every((w) => hay.includes(w));
      const per = (n: readonly number[]) => ({ calories: r1(n[0]), protein_g: r1(n[1]), carbs_g: r1(n[2]), fat_g: r1(n[3]), fibre_g: r1(n[4]) });
      const mine = Object.values(await store.getMyFoods())
        .filter((f) => hit(f.name.toLowerCase()))
        .map((f) => ({ name: f.name, per_one: f.unit, ...per(f.per), source: f.verified ? "your saved values" : "your history" }));
      const names = new Set(mine.map((f) => f.name.toLowerCase()));
      const library = FOODS.filter((f) => !names.has(f.name.toLowerCase()) && hit(`${f.name} ${f.aliases.join(" ")}`.toLowerCase())).map((f) => ({
        name: f.name,
        per_one: f.unit,
        ...per(f.n),
        ...(f.unit === "g" ? {} : { grams_per_unit: f.grams }),
        source: "food library",
      }));
      const results = [...mine, ...library].slice(0, 12);
      return text(results.length ? { results } : `Nothing matching "${query}" in the saved foods or the food library. Estimate it yourself and log it with log_food's items.`);
    }),
  );

  /* --------------------------------- write -------------------------------- */

  server.registerTool(
    "log_food",
    {
      title: "Log food",
      description:
        "Add food to a day. Pass `text` (\"2 rotis and a katori of dal for lunch\") to use the app's food library and the person's saved foods; if any part isn't recognised or a portion is unclear, nothing is logged and the reply says what's missing. Or pass `items` with your own numbers to log exactly those. Pass one of the two, not both.",
      inputSchema: {
        text: z.string().min(1).max(500).optional().describe("What was eaten, in plain words. Hinglish and household measures work."),
        items: z.array(ItemArg).min(1).max(25).optional().describe("Items with nutrition for the whole quantity each"),
        meal: Meal.optional().describe("Puts everything in this meal. Otherwise it's taken from the words (\"for lunch\") or the time of day."),
        date: DateArg,
      },
    },
    guard(async ({ text: said, items, meal, date }) => {
      if (!!said === !!items) return fail("Pass either `text` or `items`, not both.");
      const d = dayFor(date);
      const at = now();
      const clock = wall();
      let parsed: ParsedItem[];
      if (said) {
        const res = localParse(said, { now: clock, ...personalAsFoods(await store.getMyFoods()) });
        if (!res.complete) {
          return text({
            logged: false,
            reason: res.unknown.length ? "Some parts aren't in the food library." : "A portion was too vague to log without asking.",
            not_recognised: res.unknown,
            recognised: res.items.map(({ name, quantity, unit, calories, protein_g, carbs_g, fat_g, fibre_g, assumed }) => ({ name, quantity, unit, calories, protein_g, carbs_g, fat_g, fibre_g, ...(assumed ? { assumed_portion: true } : {}) })),
            next: "Ask for the missing detail or estimate it, then call log_food again with `items` (the recognised ones plus yours).",
          });
        }
        parsed = res.items;
      } else {
        // No words to go on, so the time of day decides the meal.
        parsed = items!.map((i) => ParsedItemSchema.parse({ ...i, meal: i.meal ?? mealForTime(clock), confidence: "medium", assumed: false, notes: "Added through the MCP server" }));
      }
      const logItems = parsed.map((i, k) => LogItemSchema.parse({ ...i, meal: meal ?? i.meal, id: randomUUID(), source: "llm", createdAt: at.getTime() + k }));
      await store.addItems(d, logItems);
      const [ctx, day] = await Promise.all([load(), store.getDays(d, d)]);
      const view = dayView(ctx, d, day[0]?.items ?? logItems);
      return text({ logged: true, date: d, items: logItems.map(show), day_total: view.eaten, remaining: view.remaining, note: "It appears in the app on its next sync." });
    }),
  );

  server.registerTool(
    "delete_food",
    {
      title: "Delete a logged item",
      description: "Remove one logged food item by its id (from get_day or log_food). Use it to undo a mistake; to change an item, delete it and log it again.",
      inputSchema: { id: z.string().uuid() },
      annotations: { destructiveHint: true },
    },
    guard(async ({ id }) => {
      const removed = await store.deleteItem(id);
      if (!removed) return fail("No logged item with that id. Call get_day to see the current ids.");
      return text({ deleted: show(removed.item), date: removed.date });
    }),
  );

  server.registerTool(
    "log_water",
    {
      title: "Log water",
      description: "Add water to a day (`add_ml`, negative to take some back) or set the day's total outright (`set_ml`). Pass one of the two.",
      inputSchema: {
        add_ml: z.number().int().min(-5000).max(5000).optional().describe("Millilitres to add; a glass is 250"),
        set_ml: z.number().int().min(0).max(10_000).optional().describe("The day's total in millilitres"),
        date: DateArg,
      },
    },
    guard(async ({ add_ml, set_ml, date }) => {
      if ((add_ml === undefined) === (set_ml === undefined) || add_ml === 0) return fail("Pass either `add_ml` (not zero) or `set_ml`.");
      const d = dayFor(date);
      const log = await store.getRecords("water");
      const next = set_ml !== undefined ? setWaterTotal(log, d, set_ml, now().getTime()) : addWater(log, d, add_ml!, now().getTime());
      await store.putRecord("water", d, next[d]);
      const ctx = await load();
      return text({ date: d, ...waterOf(ctx, d) });
    }),
  );

  server.registerTool(
    "log_weight",
    {
      title: "Log a weigh-in",
      description: "Record body weight in kg for a day (one weigh-in per day; logging again replaces it). Returns the smoothed trend the app uses for targets.",
      inputSchema: { kg: z.number().min(30).max(300), date: DateArg },
    },
    guard(async ({ kg, date }) => {
      const d = dayFor(date);
      await store.putRecord("weight", d, { kg: r1(kg), at: now().getTime() });
      const t = today();
      const weights = await store.getRecords("weight");
      const w = currentWeight(weights, t);
      const rate = weeklyRate(weights, t);
      return text({ date: d, kg: r1(kg), trend_kg: w ? r1(w.trend) : null, kg_per_week: rate === null ? null : Math.round(rate * 100) / 100 });
    }),
  );
}
