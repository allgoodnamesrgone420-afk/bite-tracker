/** Unit normalisation and household-measure conversions (shared client/server). */

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kgs: "kg", kilo: "kg",
  ml: "ml", millilitre: "ml", milliliter: "ml", millilitres: "ml", milliliters: "ml",
  l: "l", litre: "l", liter: "l", litres: "l", liters: "l", ltr: "l",
  scoop: "scoop", scoops: "scoop",
  cup: "cup", cups: "cup",
  glass: "glass", glasses: "glass",
  katori: "katori", katoris: "katori", katoori: "katori", vati: "katori",
  bowl: "bowl", bowls: "bowl",
  plate: "plate", plates: "plate", thali: "plate",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", spoon: "tsp", spoons: "tsp", chammach: "tsp", chamach: "tsp",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", nos: "piece", cube: "cube", cubes: "cube",
  slice: "slice", slices: "slice",
  serving: "serving", servings: "serving", portion: "serving", portions: "serving",
  handful: "handful", handfuls: "handful", mutthi: "handful",
  packet: "packet", packets: "packet", pack: "packet", packs: "packet", sachet: "packet",
  bar: "bar", bars: "bar",
  can: "can", cans: "can", bottle: "bottle", bottles: "bottle", pint: "pint",
  mug: "cup", mugs: "cup",
};

export const KNOWN_UNITS = new Set(Object.keys(UNIT_ALIASES));

export function normalizeUnit(u: string): string {
  const k = u.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[k] ?? k;
}

/** Approximate volume of household measures in ml. */
export const VOLUME_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  katori: 150,
  cup: 240,
  glass: 250,
  bowl: 250,
  plate: 300,
  can: 330,
  bottle: 330,
  pint: 473,
};

/** Grams-equivalent of a unit for a food with the given density (g/ml). */
export function unitToGrams(unit: string, density = 1): number | null {
  const u = normalizeUnit(unit);
  if (u === "g") return 1;
  if (u === "kg") return 1000;
  if (u in VOLUME_ML) return VOLUME_ML[u] * density;
  return null;
}
