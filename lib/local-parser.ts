/**
 * Local natural-language food parser: "2 scoop whey", "1 katori dal aur 3 roti
 * at lunch", "150g paneer", "dedh glass milk". Runs in the browser (instant,
 * offline, free) and on the server as a fallback when no LLM is configured.
 * Anything it can't confidently resolve is reported as `unknown` so the AI (or
 * the user) can handle it; it never guesses at dishes it doesn't know.
 */
import { FOODS, type Food } from "./food-db";
import type { Meal, ParsedItem } from "./schemas";
import { mealForTime } from "./totals";
import { KNOWN_UNITS, normalizeUnit, unitToGrams } from "./units";

export type LocalParse = {
  items: ParsedItem[];
  /** Segments of the input that couldn't be resolved. */
  unknown: string[];
  /** Every segment resolved without vagueness: safe to skip the AI. */
  complete: boolean;
};

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, couple: 2, few: 3, half: 0.5, quarter: 0.25,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10,
  aadha: 0.5, aadhi: 0.5, adha: 0.5, adhi: 0.5, dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, sawa: 1.25,
};

const MEAL_WORDS: Record<string, Meal> = {
  breakfast: "breakfast", bfast: "breakfast", nashta: "breakfast", naashta: "breakfast", nasta: "breakfast", morning: "breakfast", subah: "breakfast",
  lunch: "lunch", dopahar: "lunch", afternoon: "lunch",
  snack: "snack", snacks: "snack", evening: "snack", shaam: "snack", preworkout: "snack", postworkout: "snack", workout: "snack",
  dinner: "dinner", raat: "dinner", night: "dinner", supper: "dinner", tonight: "dinner",
};

const SIZE: Record<string, number> = { small: 0.75, chota: 0.75, chhota: 0.75, medium: 1, regular: 1, large: 1.3, big: 1.3, bada: 1.3, heaped: 1.25, full: 1 };
const VAGUE = new Set(["some", "little", "bit", "thoda", "thodi", "kuch", "lots", "lot", "bunch", "zyada", "jyada"]);

// Words that carry no food meaning; anything else left over marks a segment as unknown.
const STOP = new Set(
  (
    "i ive i'd had have has ate eaten eat eating drank drink drunk took take taken having just also then today aaj yesterday kal " +
    "my me mein mai main maine liya liye li le lena khaya khayi khaye khana piya pi pee piye ki ka ke ko se hai tha thi the " +
    "of the for at in on around about approx approximately roughly with and plus extra homemade home made cooked fresh hot cold warm " +
    "plain bhi or like x after before gym pre post time am pm o'clock oclock serving servings portion size " +
    "wala wali wale mix mixed style bowlful glassful cupful total each per only also some"
  ).split(" "),
);

type Span = { start: number; end: number; food: Food; personal: "verified" | "learned" | null };
type Alias = { tokens: string[]; food: Food; personal: Span["personal"] };

const tokenMatches = (tok: string, a: string) =>
  tok === a || tok === `${a}s` || tok === `${a}es` || (a.endsWith("y") && tok === `${a.slice(0, -1)}ies`);

function buildIndex(verified: Food[], learned: Food[]): Map<string, Alias[]> {
  const index = new Map<string, Alias[]>();
  const seen = new Set<string>();
  const add = (food: Food, personal: Span["personal"]) => {
    for (const alias of food.aliases) {
      const tokens = alias.toLowerCase().split(/\s+/).filter(Boolean);
      const key = tokens.join(" ");
      if (!tokens.length || seen.has(key)) continue; // first registration wins
      seen.add(key);
      const list = index.get(tokens[0]) ?? [];
      list.push({ tokens, food, personal });
      index.set(tokens[0], list);
    }
  };
  verified.forEach((f) => add(f, "verified"));
  FOODS.forEach((f) => add(f, null));
  learned.forEach((f) => add(f, "learned"));
  for (const list of index.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return index;
}

function findSpans(tokens: string[], index: Map<string, Alias[]>): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < tokens.length) {
    let hit: Span | null = null;
    // Try exact first-token lookup, plus a de-pluralised variant.
    const candidates = [
      ...(index.get(tokens[i]) ?? []),
      ...(index.get(tokens[i].replace(/(es|s)$/, "")) ?? []),
      ...(index.get(tokens[i].replace(/ies$/, "y")) ?? []),
    ].sort((a, b) => b.tokens.length - a.tokens.length);
    for (const c of candidates) {
      if (c.tokens.every((t, k) => tokens[i + k] !== undefined && tokenMatches(tokens[i + k], t))) {
        hit = { start: i, end: i + c.tokens.length, food: c.food, personal: c.personal };
        break;
      }
    }
    if (hit) {
      spans.push(hit);
      i = hit.end;
    } else i++;
  }
  return spans;
}

function normalise(text: string): string {
  return (
    ` ${text.toLowerCase()} `
      .replace(/½/g, " 0.5 ")
      .replace(/¼/g, " 0.25 ")
      .replace(/¾/g, " 0.75 ")
      .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => ` ${(Number(a) / Number(b)).toFixed(2)} `)
      // negations: "no sugar", "without milk", "bina cheeni", "sugar free"
      .replace(/\b(?:no|without|bina|zero|minus)\s+(?:added\s+)?(sugar|cheeni|chini|milk|doodh|ghee|butter|oil|cheese|cream|mayo)\b/g, " ")
      .replace(/\b(sugar|cheeni)[\s-]?free\b/g, " ")
      // "one and a half", "2 and a half"
      .replace(/\b(\d+(?:\.\d+)?|one|two|three|ek|do|teen)\s+and\s+(?:a\s+)?half\b/g, (_, n) => ` ${(NUM_WORDS[n] ?? Number(n)) + 0.5} `)
      .replace(/\ba\s+half\b/g, " 0.5 ")
      // glue "200g" / "2scoops" apart
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/'/g, "")
      .replace(/[&]/g, " and ")
      .replace(/[;\n|]/g, ",")
      .replace(/[^\w\s.,'+]/g, " ")
      .replace(/\s+/g, " ")
  );
}

/** Pull "at 11", "around 7:30 pm", "8am" out of a segment (they aren't quantities). */
function extractTime(seg: string): { seg: string; meal: Meal | null } {
  let meal: Meal | null = null;
  const re = /\b(?:at|around|by)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b|\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/;
  const m = seg.match(re);
  if (m) {
    let h = Number(m[1] ?? m[4]);
    const ap = m[3] ?? m[6];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (!ap && h >= 1 && h <= 6) h += 12; // "at 5" in a food log almost always means 5 pm
    if (h >= 0 && h < 24) {
      const d = new Date();
      d.setHours(h, Number(m[2] ?? m[5] ?? 0));
      meal = mealForTime(d);
    }
    seg = seg.replace(m[0], " ");
  }
  return { seg, meal };
}

const isNumber = (t: string) => /^\d+(\.\d+)?$/.test(t);
const qtyOf = (t: string): number | null => (isNumber(t) ? Number(t) : (NUM_WORDS[t] ?? null));
const COUNTABLE = new Set(["piece", "slice", "bar", "scoop", "can", "bottle", "packet", "cup", "glass", "serving"]);

export function localParse(
  text: string,
  opts: { now?: Date; verified?: Food[]; learned?: Food[] } = {},
): LocalParse {
  const index = buildIndex(opts.verified ?? [], opts.learned ?? []);
  const verifiedSet = new Set(opts.verified ?? []);
  const norm = normalise(text);

  // Split into segments, remembering which ones were introduced by "with".
  const parts = norm.split(/(,|\band\b|\baur\b|\bplus\b|\+|\bthen\b|\balong with\b|\bwith\b|\bke saath\b|\bsaath\b|\bfollowed by\b)/);
  const segments: { text: string; withAddon: boolean }[] = [];
  let pendingWith = false;
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (/^(,|and|aur|plus|\+|then|along with|with|ke saath|saath|followed by)$/.test(t)) {
      pendingWith = /with|saath/.test(t);
      continue;
    }
    segments.push({ text: t, withAddon: pendingWith });
    pendingWith = false;
  }

  type Out = ParsedItem & { segIndex: number };
  const out: Out[] = [];
  const unknown: string[] = [];
  const segMeals: (Meal | null)[] = [];
  let vague = false;

  segments.forEach((segment, segIndex) => {
    const { seg, meal: timeMeal } = extractTime(segment.text);
    const tokens = seg.split(" ").map((t) => t.replace(/^[.']+|[.']+$/g, "")).filter(Boolean);
    let meal: Meal | null = timeMeal;
    const used = new Set<number>();
    tokens.forEach((t, i) => {
      if (MEAL_WORDS[t]) {
        meal = MEAL_WORDS[t];
        used.add(i);
      }
    });
    segMeals.push(meal);

    const spans = findSpans(tokens, index);
    spans.forEach((s) => {
      for (let k = s.start; k < s.end; k++) used.add(k);
    });

    const segVague = tokens.some((t) => VAGUE.has(t));
    const produced: Out[] = [];

    spans.forEach((span, si) => {
      const prevEnd = si === 0 ? 0 : spans[si - 1].end;
      const nextStart = si === spans.length - 1 ? tokens.length : spans[si + 1].start;
      // Look for quantity/unit before the food ("2 scoops of whey"), else after it ("whey 2 scoops").
      const scan = (from: number, to: number) => {
        let qty: number | null = null;
        let unit: string | null = null;
        let size = 1;
        const idx: number[] = [];
        for (let k = from; k < to; k++) {
          const t = tokens[k];
          if (used.has(k)) continue;
          const q = qtyOf(t);
          if (q !== null && qty === null && t !== "a" && t !== "an") {
            qty = q;
            idx.push(k);
          } else if ((t === "a" || t === "an") && qty === null) {
            qty = 1;
            idx.push(k);
          } else if (KNOWN_UNITS.has(t) && unit === null) {
            unit = normalizeUnit(t);
            idx.push(k);
          } else if (SIZE[t] !== undefined) {
            size = SIZE[t];
            idx.push(k);
          }
        }
        return { qty, unit, size, idx };
      };
      let found = scan(prevEnd, span.start);
      if (found.qty === null && found.unit === null) {
        const after = scan(span.end, nextStart);
        if (after.qty !== null || after.unit !== null) found = after;
      }
      found.idx.forEach((k) => used.add(k));

      const food = span.food;
      let { unit: userUnit, size } = found;
      // "small bowl" is a katori; "big bowl" stays a bowl scaled up.
      if (userUnit === "bowl" && size < 1) {
        userUnit = "katori";
        size = 1;
      }
      const asAddon = found.qty === null && !userUnit && segment.withAddon && !!food.addon;
      let qty = found.qty ?? (asAddon ? food.addon! : (food.def ?? 1));
      if (found.qty === null && userUnit) qty = 1; // "a bowl of dal" / "bowl dal"

      let factor = 1;
      let approx = false;
      if (userUnit && userUnit !== food.unit) {
        if (food.units?.[userUnit]) factor = food.units[userUnit];
        else {
          const g = unitToGrams(userUnit, food.density ?? 1);
          if (g !== null && food.grams > 0) factor = g / food.grams;
          else approx = true; // unknown relation, e.g. "piece" of dal
        }
      }
      const base = qty * factor * size;
      const r1 = (v: number) => Math.round(v * base * 10) / 10;
      const assumed = asAddon || (found.qty === null && !userUnit && !(COUNTABLE.has(food.unit) && !food.def));
      const itemVague = segVague || (!!food.vague && found.qty === null && !userUnit);
      if (itemVague) vague = true;

      produced.push({
        name: food.name,
        quantity: Math.round(qty * size * 100) / 100,
        unit: userUnit ?? food.unit,
        meal: "lunch", // resolved below
        calories: Math.round(food.n[0] * base),
        protein_g: r1(food.n[1]),
        carbs_g: r1(food.n[2]),
        fat_g: r1(food.n[3]),
        fibre_g: r1(food.n[4]),
        confidence: span.personal === "verified" || verifiedSet.has(food) ? "high" : itemVague ? "low" : assumed || approx ? "medium" : "high",
        assumed: assumed || itemVague,
        notes:
          span.personal === "verified"
            ? "Your saved values"
            : approx
              ? `Assumed 1 ${userUnit} ≈ 1 ${food.unit}`
              : assumed
                ? `Typical portion: ${fmt(qty)} ${food.unit}`
                : "",
        segIndex,
      });
    });

    // Anything meaningful left over means we don't really know this segment.
    const leftover = tokens.filter((t, i) => !used.has(i) && !STOP.has(t) && !VAGUE.has(t) && qtyOf(t) === null && !KNOWN_UNITS.has(t) && SIZE[t] === undefined && /[a-z]{3,}/.test(t));
    if (leftover.length) {
      unknown.push(segment.text.trim());
      return;
    }
    out.push(...produced);
  });

  // Meal resolution: one meal mentioned applies to everything; otherwise each
  // segment uses its own, then the next mentioned, then the previous, then the clock.
  const mentioned = segMeals.filter(Boolean) as Meal[];
  const fallback = mealForTime(opts.now ?? new Date());
  const resolve = (segIndex: number): Meal => {
    if (new Set(mentioned).size === 1) return mentioned[0];
    if (segMeals[segIndex]) return segMeals[segIndex]!;
    for (let k = segIndex + 1; k < segMeals.length; k++) if (segMeals[k]) return segMeals[k]!;
    for (let k = segIndex - 1; k >= 0; k--) if (segMeals[k]) return segMeals[k]!;
    return fallback;
  };

  const items: ParsedItem[] = out.map(({ segIndex, ...item }) => ({ ...item, meal: resolve(segIndex) }));
  return { items, unknown, complete: items.length > 0 && unknown.length === 0 && !vague };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
