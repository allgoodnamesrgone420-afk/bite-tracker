import type { Profile, TargetOverrides } from "./schemas";

export type Targets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
};

export type CalcStep = { label: string; math: string; value: string };

export type TargetCalc = {
  /** Final targets, after safety floors and manual overrides. */
  targets: Targets;
  steps: CalcStep[];
  warnings: string[];
  bmr: number;
  tdee: number;
  floor: number;
  /** Rate actually used after the 1%/week cap (kg/week, signed: negative = loss). */
  effectiveRateKg: number;
  /** Maintenance from the formula alone, for comparison with the adaptive estimate. */
  formulaTdee: number;
  /** Weight the targets were calculated for (your trend weight when you weigh in). */
  weightKg: number;
  adaptive: boolean;
};

/** Inputs from your own data that refine the formula. */
export type Adapt = {
  /** Trend weight from recent weigh-ins; replaces the profile weight. */
  weightKg?: number;
  /** Maintenance estimated from your logs and weigh-ins; replaces the formula TDEE. */
  tdee?: number;
  tdeeNote?: string;
};

export const ACTIVITY_MULTIPLIER = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 } as const;
export const KCAL_PER_KG = 7700;
export const CALORIE_FLOOR = { female: 1200, male: 1500 } as const;
export const MAX_LOSS_FRACTION_PER_WEEK = 0.01;
export const MAX_GAIN_SURPLUS = 500;
export const PROTEIN_G_PER_KG = { lose: 2.0, maintain: 1.4, gain: 1.8 } as const;
export const MAX_PROTEIN_SHARE = 0.35;
export const FAT_SHARE = 0.28;
export const FIBRE_G_PER_1000_KCAL = 14;

const r10 = (n: number) => Math.round(n / 10) * 10;
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

export function mifflinStJeor(p: Pick<Profile, "weightKg" | "heightCm" | "age" | "sex">): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

/** Split a calorie target into macro/fibre targets. Pure; used for computed and overridden calories. */
export function macrosFor(calories: number, weightKg: number, goal: Profile["goal"]) {
  const proteinByWeight = weightKg * PROTEIN_G_PER_KG[goal];
  const proteinCap = (calories * MAX_PROTEIN_SHARE) / 4;
  const protein_g = Math.round(Math.min(proteinByWeight, proteinCap));
  const fat_g = Math.round((calories * FAT_SHARE) / 9);
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  const fibre_g = Math.round((calories / 1000) * FIBRE_G_PER_1000_KCAL);
  return { protein_g, fat_g, carbs_g, fibre_g, proteinCapped: proteinByWeight > proteinCap };
}

export function computeTargets(profile: Profile, overrides: TargetOverrides = {}, adapt: Adapt = {}): TargetCalc {
  const steps: CalcStep[] = [];
  const warnings: string[] = [];
  const floor = CALORIE_FLOOR[profile.sex];
  const p = adapt.weightKg ? { ...profile, weightKg: Math.round(adapt.weightKg * 10) / 10 } : profile;
  if (adapt.weightKg) steps.push({ label: "Weight", math: "trend of your recent weigh-ins", value: `${p.weightKg} kg` });

  const bmr = mifflinStJeor(p);
  steps.push({
    label: "BMR (Mifflin-St Jeor)",
    math: `10×${p.weightKg} kg + 6.25×${p.heightCm} cm − 5×${p.age} ${p.sex === "male" ? "+ 5" : "− 161"}`,
    value: `${fmt(bmr)} kcal`,
  });

  const mult = ACTIVITY_MULTIPLIER[p.activity];
  const formulaTdee = bmr * mult;
  const tdee = adapt.tdee ?? formulaTdee;
  if (adapt.tdee) {
    steps.push({ label: "Maintenance (from your data)", math: adapt.tdeeNote ?? `formula says ${fmt(formulaTdee)}`, value: `${fmt(tdee)} kcal` });
  } else {
    steps.push({ label: "Maintenance (TDEE)", math: `${fmt(bmr)} × ${mult} (${p.activity})`, value: `${fmt(tdee)} kcal` });
  }

  let calories = tdee;
  let effectiveRateKg = 0;

  if (p.goal === "lose") {
    const maxRate = +(p.weightKg * MAX_LOSS_FRACTION_PER_WEEK).toFixed(2);
    let rate = p.rateKgPerWeek;
    if (rate > maxRate) {
      warnings.push(`${rate} kg/week is faster than 1% of body weight. Capped at ${maxRate} kg/week.`);
      rate = maxRate;
    }
    const deficit = (rate * KCAL_PER_KG) / 7;
    calories = tdee - deficit;
    effectiveRateKg = -rate;
    steps.push({
      label: "Deficit for fat loss",
      math: `${rate} kg/wk × ${fmt(KCAL_PER_KG)} kcal/kg ÷ 7 days`,
      value: `−${fmt(deficit)} kcal/day`,
    });
  } else if (p.goal === "gain") {
    let surplus = (p.rateKgPerWeek * KCAL_PER_KG) / 7;
    if (surplus > MAX_GAIN_SURPLUS) {
      warnings.push(`Surplus capped at ${MAX_GAIN_SURPLUS} kcal/day; faster gain is mostly fat.`);
      surplus = MAX_GAIN_SURPLUS;
    }
    calories = tdee + surplus;
    effectiveRateKg = +((surplus * 7) / KCAL_PER_KG).toFixed(2);
    steps.push({
      label: "Surplus for muscle gain",
      math: `min(${p.rateKgPerWeek} kg/wk × ${fmt(KCAL_PER_KG)} ÷ 7, ${MAX_GAIN_SURPLUS})`,
      value: `+${fmt(surplus)} kcal/day`,
    });
  }

  if (calories < floor) {
    warnings.push(
      `That would put you at ${fmt(calories)} kcal/day, below the ${fmt(floor)} kcal safe minimum. Using ${fmt(floor)} kcal instead.`,
    );
    calories = floor;
    if (p.goal === "lose") effectiveRateKg = -Math.max(0, +(((tdee - floor) * 7) / KCAL_PER_KG).toFixed(2));
  }
  calories = r10(calories);
  steps.push({ label: "Daily calorie target", math: `rounded to nearest 10, min ${fmt(floor)}`, value: `${fmt(calories)} kcal` });

  // Manual calorie override still respects the floor.
  if (overrides.calories !== undefined) {
    if (overrides.calories < floor) {
      warnings.push(`Your override of ${fmt(overrides.calories)} kcal is below the ${fmt(floor)} kcal minimum. Using ${fmt(floor)}.`);
      calories = floor;
    } else {
      calories = Math.round(overrides.calories);
    }
  }

  const m = macrosFor(calories, p.weightKg, p.goal);
  steps.push({
    label: "Protein",
    math: `${p.weightKg} kg × ${PROTEIN_G_PER_KG[p.goal]} g/kg${m.proteinCapped ? `, capped at ${MAX_PROTEIN_SHARE * 100}% of kcal` : ""}`,
    value: `${m.protein_g} g`,
  });
  steps.push({ label: "Fat", math: `${fmt(calories)} × ${FAT_SHARE * 100}% ÷ 9 kcal/g`, value: `${m.fat_g} g` });
  steps.push({
    label: "Carbs (remainder)",
    math: `(${fmt(calories)} − ${m.protein_g}×4 − ${m.fat_g}×9) ÷ 4`,
    value: `${m.carbs_g} g`,
  });
  steps.push({ label: "Fibre", math: `${FIBRE_G_PER_1000_KCAL} g per 1,000 kcal`, value: `${m.fibre_g} g` });

  const targets: Targets = {
    calories,
    protein_g: overrides.protein_g ?? m.protein_g,
    carbs_g: overrides.carbs_g ?? m.carbs_g,
    fat_g: overrides.fat_g ?? m.fat_g,
    fibre_g: overrides.fibre_g ?? m.fibre_g,
  };

  return {
    targets,
    steps,
    warnings,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    floor,
    effectiveRateKg,
    formulaTdee: Math.round(formulaTdee),
    weightKg: p.weightKg,
    adaptive: adapt.tdee !== undefined,
  };
}
