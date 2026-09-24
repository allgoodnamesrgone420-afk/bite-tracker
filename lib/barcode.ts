/** Open Food Facts product → one loggable item (label values, per serving when the label gives one). */
import type { Meal, Micros, ParsedItem } from "./schemas";

export type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutriments?: Record<string, number | string | undefined>;
};

export const OFF_FIELDS = "product_name,product_name_en,brands,quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments";

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

export function offToItem(p: OffProduct, meal: Meal): ParsedItem | null {
  const n = p.nutriments ?? {};
  const num = (k: string): number | undefined => {
    const v = Number(n[k]);
    return n[k] !== undefined && n[k] !== "" && Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const kj = num("energy_100g");
  const kcal100 = num("energy-kcal_100g") ?? (kj !== undefined ? kj / 4.184 : undefined);
  if (kcal100 === undefined) return null;

  const liquid = p.serving_quantity_unit === "ml" || /\d\s*(ml|cl|l)\b/i.test(p.quantity ?? "");
  const sq = Number(p.serving_quantity);
  const hasServing = Number.isFinite(sq) && sq > 0 && sq <= 1000;
  const qty = hasServing ? Math.round(sq) : 100;
  const k = qty / 100;
  const g = (key: string) => Math.round(clamp((num(key) ?? 0) * k, 1000) * 10) / 10;

  const sodium = num("sodium_100g") ?? (num("salt_100g") !== undefined ? num("salt_100g")! / 2.5 : undefined);
  const sugar = num("sugars_100g");
  const micros: Micros | undefined =
    sodium !== undefined && sugar !== undefined
      ? {
          sodium_mg: Math.round(clamp(sodium * 1000 * k, 20000)),
          sugar_g: Math.round(clamp(sugar * k, 1000) * 10) / 10,
          satfat_g: g("saturated-fat_100g"),
          calcium_mg: Math.round(clamp((num("calcium_100g") ?? 0) * 1000 * k, 10000)),
          iron_mg: Math.round(clamp((num("iron_100g") ?? 0) * 1000 * k, 200) * 10) / 10,
        }
      : undefined;

  const product = (p.product_name_en || p.product_name || "").trim();
  const brand = (p.brands ?? "").split(",")[0].trim();
  const name = (product.toLowerCase().includes(brand.toLowerCase()) ? product : [brand, product].filter(Boolean).join(" ")).slice(0, 80) || "Packaged food";

  return {
    name,
    quantity: qty,
    unit: liquid ? "ml" : "g",
    meal,
    calories: Math.round(clamp(kcal100 * k, 5000)),
    protein_g: g("proteins_100g"),
    carbs_g: g("carbohydrates_100g"),
    fat_g: g("fat_100g"),
    fibre_g: g("fiber_100g"),
    micros,
    confidence: "high",
    assumed: !hasServing,
    notes: (hasServing ? `Label: 1 serving = ${p.serving_size || `${qty} ${liquid ? "ml" : "g"}`}` : "Label values per 100. Set how much you had.").slice(0, 200),
  };
}
