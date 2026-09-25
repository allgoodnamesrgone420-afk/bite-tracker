/**
 * Recommendations computed in code from your own logs. They power the Coach
 * screen on their own (no API key needed) and are passed to the AI coach as
 * pre-computed facts so it never has to do arithmetic.
 */
import { foodKey } from "./calibration";
import { microTargets, sumMicros } from "./micros";
import { classifyDay } from "./progress";
import type { CoachResponse, DayLog, LogItem, Profile } from "./schemas";
import type { Targets } from "./targets";
import { sumItems } from "./totals";

export type Insight = {
  id: string;
  tone: "good" | "warn" | "tip";
  title: string;
  detail: string;
  kcal?: number;
  protein?: number;
  /** Higher = more important. */
  weight: number;
};

type FoodStat = { name: string; unit: string; qty: number; kcal: number; protein: number; fibre: number; fat: number; count: number; totalKcal: number };

/** Typical serving of each food you've logged (averaged). */
function foodStats(items: LogItem[]): FoodStat[] {
  const map = new Map<string, FoodStat>();
  for (const i of items) {
    const k = foodKey(i.name);
    const s = map.get(k) ?? { name: i.name, unit: i.unit, qty: 0, kcal: 0, protein: 0, fibre: 0, fat: 0, count: 0, totalKcal: 0 };
    s.count++;
    s.qty += i.quantity;
    s.kcal += i.calories;
    s.protein += i.protein_g;
    s.fibre += i.fibre_g;
    s.fat += i.fat_g;
    s.totalKcal += i.calories;
    map.set(k, s);
  }
  // Suggest a natural serving (nearest half unit of what you usually have), scaled per unit.
  return [...map.values()].map((s) => {
    const qty = Math.max(0.5, Math.round((s.qty / s.count) * 2) / 2);
    const k = qty / Math.max(s.qty, 0.01);
    return { ...s, qty, kcal: Math.round(s.kcal * k), protein: round(s.protein * k), fibre: round(s.fibre * k), fat: round(s.fat * k) };
  });
}

const round = (n: number) => Math.round(n * 10) / 10;
const serving = (f: { qty: number; unit: string; name: string }) => `${round(f.qty)} ${f.unit} ${f.name.toLowerCase()}`;

type Diet = "vegan" | "veg" | "egg" | "nonveg";
function dietOf(p: Profile | null): Diet {
  const d = (p?.diet ?? "").toLowerCase();
  if (/vegan/.test(d)) return "vegan";
  if (/non[\s-]?veg|chicken|fish|meat|mutton/.test(d)) return "nonveg";
  if (/egg/.test(d)) return "egg";
  if (/veg/.test(d)) return "veg";
  return "nonveg";
}

const PROTEIN_IDEAS: Record<Diet, { text: string; kcal: number; protein: number }[]> = {
  vegan: [
    { text: "30 g soya chunks in your sabzi", kcal: 105, protein: 16 },
    { text: "100 g tofu", kcal: 76, protein: 8 },
  ],
  veg: [
    { text: "1 scoop whey", kcal: 120, protein: 24 },
    { text: "150 g Greek yogurt / hung curd", kcal: 110, protein: 15 },
    { text: "100 g paneer", kcal: 265, protein: 18 },
  ],
  egg: [
    { text: "4 egg whites", kcal: 68, protein: 14 },
    { text: "1 scoop whey", kcal: 120, protein: 24 },
  ],
  nonveg: [
    { text: "150 g grilled chicken breast", kcal: 250, protein: 46 },
    { text: "4 egg whites", kcal: 68, protein: 14 },
    { text: "1 scoop whey", kcal: 120, protein: 24 },
  ],
};

export type InsightInput = {
  today: string;
  /** Recent days (any order), including today if logged. */
  days: DayLog[];
  targets: Targets;
  profile: Profile | null;
  now?: Date;
};

export function computeInsights({ today, days, targets: t, profile, now = new Date() }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const logged = days.filter((d) => d.items.length).sort((a, b) => a.date.localeCompare(b.date));
  const past = logged.filter((d) => d.date < today);
  const allItems = logged.flatMap((d) => d.items);
  const stats = foodStats(allItems);
  const rows = past.map((d) => ({ date: d.date, items: d.items, totals: sumItems(d.items), c: classifyDay(sumItems(d.items), t) }));
  const complete = rows.filter((r) => r.c.status !== "low");

  if (past.length < 3) {
    out.push({
      id: "warmup",
      tone: "tip",
      title: `${3 - past.length} more day${past.length === 2 ? "" : "s"} of logging to unlock patterns`,
      detail: "Recommendations get sharper the more of your real meals they see. Log everything, even the chai.",
      weight: 1,
    });
  }

  // ---------- protein ----------
  if (complete.length >= 2) {
    const short = complete.filter((r) => !r.c.proteinHit);
    const rate = 1 - short.length / complete.length;
    if (rate < 0.6) {
      const gap = Math.round(short.reduce((s, r) => s + (t.protein_g - r.totals.protein_g), 0) / short.length);
      const mine = stats
        .filter((f) => f.protein >= 6 && f.kcal > 0)
        .sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)[0];
      const idea = mine
        ? `Easiest fix from what you already eat: add ${serving(mine)} (+${mine.protein} g protein, ~${mine.kcal} kcal).`
        : `Try ${PROTEIN_IDEAS[dietOf(profile)].map((i) => `${i.text} (+${i.protein} g, ${i.kcal} kcal)`).join(" or ")}.`;
      out.push({
        id: "protein-short",
        tone: "warn",
        title: `Protein short on ${short.length} of ${complete.length} days`,
        detail: `You miss by ~${gap} g on those days. ${idea}`,
        protein: mine?.protein ?? PROTEIN_IDEAS[dietOf(profile)][0].protein,
        kcal: mine?.kcal ?? PROTEIN_IDEAS[dietOf(profile)][0].kcal,
        weight: 60 + gap,
      });
    } else if (rate >= 0.8 && complete.length >= 3) {
      out.push({ id: "protein-good", tone: "good", title: "Protein: sorted.", detail: `You hit protein on ${complete.length - short.length} of ${complete.length} days. Keep that anchor.`, weight: 5 });
    }
  }

  // ---------- going over ----------
  const overRows = complete.filter((r) => r.c.status === "over");
  if (overRows.length >= 2) {
    const overStats = foodStats(overRows.flatMap((r) => r.items)).sort((a, b) => b.totalKcal - a.totalKcal);
    const top = overStats.slice(0, 2);
    const avgOver = Math.round(overRows.reduce((s, r) => s + r.c.kcalDelta, 0) / overRows.length);
    const save = top[0] ? Math.round(top[0].kcal / 2) : 0;
    out.push({
      id: "over",
      tone: "warn",
      title: `Over target on ${overRows.length} of ${complete.length} days`,
      detail: top.length
        ? `By ~${avgOver} kcal on average. Biggest contributors on those days: ${top.map((f) => `${f.name} (~${f.kcal} kcal a serving)`).join(", ")}. Halving the ${top[0].name.toLowerCase()} saves ~${save} kcal.`
        : `By ~${avgOver} kcal on average.`,
      kcal: -save,
      weight: 50 + avgOver / 10,
    });
  }

  // ---------- fat ----------
  const fatHigh = complete.filter((r) => r.c.flags.some((f) => f.key === "fat_g"));
  if (fatHigh.length >= 3) {
    const fatty = stats.filter((f) => f.fat >= 5).sort((a, b) => b.fat * b.count - a.fat * a.count).slice(0, 2);
    out.push({
      id: "fat",
      tone: "warn",
      title: `Fat ran high on ${fatHigh.length} days`,
      detail: `${fatty.length ? `Main sources: ${fatty.map((f) => f.name).join(", ")}. ` : ""}Cutting 2 tsp of oil or ghee a day saves ~80 kcal without changing the food.`,
      kcal: -80,
      weight: 30,
    });
  }

  // ---------- fibre ----------
  if (complete.length >= 2) {
    const avgFibre = complete.reduce((s, r) => s + r.totals.fibre_g, 0) / complete.length;
    if (avgFibre < t.fibre_g * 0.7) {
      const mine = stats.filter((f) => f.fibre >= 3).sort((a, b) => b.fibre / Math.max(b.kcal, 1) - a.fibre / Math.max(a.kcal, 1))[0];
      out.push({
        id: "fibre",
        tone: "tip",
        title: `Fibre averages ${Math.round(avgFibre)} g of ${t.fibre_g} g`,
        detail: mine
          ? `Add ${serving(mine)} (+${mine.fibre} g fibre) more often, or a bowl of salad with lunch.`
          : "A katori of sprouts (+4 g) or dal (+5 g), or a bowl of salad, closes most of the gap.",
        kcal: mine?.kcal ?? 100,
        weight: 20,
      });
    }
  }

  // ---------- sodium ----------
  // Only days where most items carry micro data, so older entries don't hide it.
  const naLimit = microTargets(t.calories, profile?.sex).sodium_mg;
  const naDays = complete.map((r) => ({ r, m: sumMicros(r.items) })).filter(({ m }) => m.count && m.covered / m.count >= 0.8);
  const salty = naDays.filter(({ m }) => m.total.sodium_mg > naLimit);
  if (naDays.length >= 2 && salty.length >= 2) {
    const bySource = new Map<string, { name: string; na: number; n: number }>();
    for (const { r } of salty) for (const i of r.items) {
      if (!i.micros) continue;
      const k = foodKey(i.name);
      const f = bySource.get(k) ?? { name: i.name, na: 0, n: 0 };
      f.na += i.micros.sodium_mg;
      f.n++;
      bySource.set(k, f);
    }
    const top = [...bySource.values()].sort((a, b) => b.na - a.na).slice(0, 2);
    const avg = Math.round(salty.reduce((s, x) => s + x.m.total.sodium_mg, 0) / salty.length);
    out.push({
      id: "sodium",
      tone: "warn",
      title: `Sodium over ${naLimit.toLocaleString("en-IN")} mg on ${salty.length} of ${naDays.length} days`,
      detail: `Averaging ~${avg.toLocaleString("en-IN")} mg on those days.${top.length ? ` Biggest sources: ${top.map((f) => `${f.name} (~${Math.round(f.na / f.n).toLocaleString("en-IN")} mg each)`).join(", ")}.` : ""} Go easy on pickles, papad, namkeen and packaged snacks, and taste before adding salt.`,
      weight: 28,
    });
  }

  // ---------- snacks share ----------
  if (complete.length >= 3) {
    const snackShare =
      complete.reduce((s, r) => s + sumItems(r.items.filter((i) => i.meal === "snack")).calories, 0) /
      Math.max(1, complete.reduce((s, r) => s + r.totals.calories, 0));
    if (snackShare > 0.3) {
      const snackTop = foodStats(complete.flatMap((r) => r.items.filter((i) => i.meal === "snack"))).sort((a, b) => b.totalKcal - a.totalKcal)[0];
      out.push({
        id: "snacks",
        tone: "tip",
        title: `Snacks are ${Math.round(snackShare * 100)}% of your calories`,
        detail: snackTop
          ? `${snackTop.name} leads (~${snackTop.kcal} kcal each time). Roasted chana or fruit gives the crunch for about half.`
          : "Planning one bigger meal usually shrinks snacking.",
        weight: 25,
      });
    }
  }

  // ---------- weekday vs weekend ----------
  const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00`).getDay());
  const we = complete.filter((r) => isWeekend(r.date));
  const wd = complete.filter((r) => !isWeekend(r.date));
  if (we.length && wd.length) {
    const avg = (rs: typeof complete) => rs.reduce((s, r) => s + r.totals.calories, 0) / rs.length;
    const diff = Math.round(avg(we) - avg(wd));
    if (Math.abs(diff) > 250) {
      out.push({
        id: "weekend",
        tone: "tip",
        title: `Weekends run ${diff > 0 ? "+" : ""}${diff} kcal vs weekdays`,
        detail: diff > 0 ? "Pre-decide one weekend treat instead of letting the whole day drift." : "Weekdays are the heavier ones. Check the office snacks.",
        weight: 22,
      });
    }
  }

  // ---------- late eating ----------
  const lateDays = new Set(allItems.filter((i) => {
    const h = new Date(i.createdAt).getHours();
    return h >= 22 || h < 4;
  }).map((i) => new Date(i.createdAt).toDateString()));
  if (lateDays.size >= 3) {
    out.push({ id: "late", tone: "tip", title: `Late-night logging on ${lateDays.size} days`, detail: "Food after 10pm is often the easiest cut. Try closing the kitchen an hour earlier.", weight: 15 });
  }

  // ---------- incomplete logs ----------
  const lows = rows.filter((r) => r.c.status === "low").length;
  if (lows >= 2) {
    out.push({ id: "incomplete", tone: "tip", title: `${lows} days look incomplete`, detail: "Under half your target usually means missed meals. Advice is only as good as the log.", weight: 18 });
  }

  // ---------- adherence ----------
  if (complete.length >= 3) {
    const hits = complete.filter((r) => r.c.status === "hit").length;
    if (hits / complete.length >= 0.6) {
      out.push({ id: "adherence", tone: "good", title: `On target ${hits} of ${complete.length} days`, detail: "That's the job. Consistency beats perfect days.", weight: 6 });
    }
  }

  // ---------- rest of today ----------
  const todayLog = logged.find((d) => d.date === today);
  if (todayLog && now.getHours() < 21) {
    const tot = sumItems(todayLog.items);
    const kcalLeft = t.calories - tot.calories;
    const pLeft = t.protein_g - tot.protein_g;
    if (kcalLeft > 250 && pLeft > 15) {
      const mine = stats.filter((f) => f.protein >= 6 && f.kcal <= kcalLeft).sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)[0];
      out.push({
        id: "today-left",
        tone: "tip",
        title: `${Math.round(kcalLeft)} kcal and ${Math.round(pLeft)} g protein left today`,
        detail: mine ? `${serving(mine)} fits nicely (+${mine.protein} g protein, ~${mine.kcal} kcal).` : `Something like ${PROTEIN_IDEAS[dietOf(profile)][0].text} fits.`,
        weight: 40,
      });
    }
  }

  const toneOrder = { warn: 0, tip: 1, good: 2 };
  return out.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone] || b.weight - a.weight);
}

const SAFETY = /pregnan|breastfeed|lactat|eating disorder|anorexi|bulimi|binge|purg|orthorex/i;

/** Rule-based coach (used when no LLM is configured). Same shape as the AI coach. */
export function localCoach(mode: "daily" | "weekly", input: InsightInput): CoachResponse {
  const { today, days, targets: t, profile } = input;
  if (SAFETY.test(`${profile?.healthNotes ?? ""} ${profile?.diet ?? ""}`)) {
    return {
      snapshot: "Thanks for sharing your health notes. With what you've described, calorie targets should come from someone who knows your full picture.",
      went_well: "Logging what you eat is useful information to bring to that conversation.",
      changes: [],
      remaining_today: null,
      pattern_note: null,
      safety_flag: true,
    };
  }
  const insights = computeInsights(input);
  const todayLog = days.find((d) => d.date === today);
  const tot = sumItems(todayLog?.items ?? []);
  const warns = insights.filter((i) => i.tone === "warn" || i.id === "fibre" || i.id === "snacks");
  const changes = warns.slice(0, mode === "daily" ? 3 : 2).map((i) => ({
    title: i.title,
    detail: i.detail,
    est_kcal_impact: i.kcal ?? 0,
    est_protein_impact_g: i.protein ?? 0,
  }));
  const pattern = insights.find((i) => ["weekend", "late", "snacks"].includes(i.id));

  if (mode === "weekly") {
    const logged = days.filter((d) => d.items.length && d.date <= today);
    const rows = logged.map((d) => ({ d, tot: sumItems(d.items), c: classifyDay(sumItems(d.items), t) }));
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.tot.calories, 0) / rows.length) : 0;
    const hits = rows.filter((r) => r.c.status === "hit").length;
    const pHits = rows.filter((r) => r.c.proteinHit).length;
    const best = [...rows].filter((r) => r.c.status !== "low").sort((a, b) => Math.abs(a.c.kcalDelta) - Math.abs(b.c.kcalDelta))[0];
    const worst = [...rows].sort((a, b) => b.c.kcalDelta - a.c.kcalDelta)[0];
    const day = (d: string) => new Date(`${d}T00:00`).toLocaleDateString("en-IN", { weekday: "long" });
    return {
      snapshot: rows.length
        ? `${rows.length} days logged. Average ${avg.toLocaleString("en-IN")} kcal vs ${t.calories.toLocaleString("en-IN")} target; on target ${hits}/${rows.length} days, protein hit ${pHits}/${rows.length}.`
        : "No days logged this week yet.",
      went_well: best ? `${day(best.d.date)} was your best day: ${best.c.kcalDelta >= 0 ? "+" : ""}${best.c.kcalDelta} kcal from target${best.c.proteinHit ? " with protein hit" : ""}.` : "Every logged day is data. Keep going.",
      changes,
      remaining_today: null,
      pattern_note: worst && worst.c.kcalDelta > 150 ? `Toughest day: ${day(worst.d.date)} (+${worst.c.kcalDelta} kcal).${pattern ? ` ${pattern.title}.` : ""}` : (pattern?.title ?? null),
      safety_flag: false,
    };
  }

  const left = insights.find((i) => i.id === "today-left");
  const wentWell = !todayLog
    ? "Nothing logged yet today. Start with breakfast."
    : tot.protein_g >= t.protein_g * 0.9
      ? "Protein: sorted. That's the hardest target to hit."
      : (() => {
          const best = [...todayLog.items].sort((a, b) => b.protein_g - a.protein_g)[0];
          return `${best.name} brought ${Math.round(best.protein_g)} g protein. Build around foods like that.`;
        })();
  return {
    snapshot: todayLog
      ? `${tot.calories.toLocaleString("en-IN")} of ${t.calories.toLocaleString("en-IN")} kcal, ${Math.round(tot.protein_g)}/${t.protein_g} g protein, ${Math.round(tot.fibre_g)}/${t.fibre_g} g fibre.`
      : "Nothing logged today yet.",
    went_well: wentWell,
    changes,
    remaining_today: left ? `${left.title}: ${left.detail}` : null,
    pattern_note: pattern ? `${pattern.title}. ${pattern.detail}` : null,
    safety_flag: false,
  };
}
