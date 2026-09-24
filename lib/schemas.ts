import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared enums                                                        */
/* ------------------------------------------------------------------ */

export const MEALS = ["breakfast", "lunch", "snack", "dinner"] as const;
export const Meal = z.enum(MEALS);
export type Meal = z.infer<typeof Meal>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const Sex = z.enum(["male", "female"]);
export const Activity = z.enum(["sedentary", "light", "moderate", "active"]);
export const Goal = z.enum(["lose", "maintain", "gain"]);

/* ------------------------------------------------------------------ */
/* Profile (Settings)                                                  */
/* ------------------------------------------------------------------ */

export const ProfileSchema = z.object({
  age: z.number().int().min(18, "This calculator is built for adults (18+)").max(100),
  sex: Sex,
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(35).max(300),
  activity: Activity,
  goal: Goal,
  rateKgPerWeek: z.number().min(0).max(1.5),
  diet: z.string().max(300).default(""),
  healthNotes: z.string().max(300).default(""),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const TargetOverridesSchema = z.object({
  calories: z.number().positive().optional(),
  protein_g: z.number().positive().optional(),
  carbs_g: z.number().positive().optional(),
  fat_g: z.number().positive().optional(),
  fibre_g: z.number().positive().optional(),
});
export type TargetOverrides = z.infer<typeof TargetOverridesSchema>;

/* ------------------------------------------------------------------ */
/* LLM output: parser                                                  */
/* Kept deliberately flat - this schema is sent to the provider as the */
/* structured-output JSON schema, then used to validate the response.  */
/* ------------------------------------------------------------------ */

const grams = z.number().min(0).max(1000);

export const ParsedItemSchema = z.object({
  name: z.string().min(1).max(80),
  quantity: z.number().min(0).max(5000),
  unit: z.string().max(30),
  meal: Meal,
  calories: z.number().min(0).max(5000),
  protein_g: grams,
  carbs_g: grams,
  fat_g: grams,
  fibre_g: grams,
  confidence: Confidence,
  assumed: z.boolean(),
  notes: z.string().max(200),
});
export type ParsedItem = z.infer<typeof ParsedItemSchema>;

export const ParseResultSchema = z.object({
  items: z.array(ParsedItemSchema).max(25),
  needs_clarification: z.string().max(200).nullable(),
  suggested_answers: z.array(z.string().max(40)).max(4),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;

/* ------------------------------------------------------------------ */
/* API request bodies                                                  */
/* ------------------------------------------------------------------ */

export const PARSE_MAX_CHARS = 500;

export const ParseRequestSchema = z.object({
  text: z.string().trim().min(1, "Tell us what you ate").max(PARSE_MAX_CHARS),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  diet: z.string().max(300).optional(),
  clarification: z
    .object({ question: z.string().max(200), answer: z.string().max(100) })
    .optional(),
  skipClarification: z.boolean().optional(),
  correction: z
    .object({ item: ParsedItemSchema, text: z.string().trim().min(1).max(300) })
    .optional(),
});
export type ParseRequest = z.infer<typeof ParseRequestSchema>;

/* ------------------------------------------------------------------ */
/* Stored log item                                                     */
/* ------------------------------------------------------------------ */

export const LogItemSchema = ParsedItemSchema.extend({
  id: z.string(),
  source: z.enum(["llm", "manual"]),
  createdAt: z.number(),
});
export type LogItem = z.infer<typeof LogItemSchema>;

export const DayLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(LogItemSchema),
});
export type DayLog = z.infer<typeof DayLogSchema>;

/* ------------------------------------------------------------------ */
/* API response envelope                                               */
/* ------------------------------------------------------------------ */

export const API_ERROR_CODES = [
  "bad_request",
  "too_large",
  "unauthorized",
  "rate_limited",
  "timeout",
  "upstream",
  "invalid_output",
  "refused",
  "config",
  "offline",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };

/* ------------------------------------------------------------------ */
/* Parse API response                                                  */
/* ------------------------------------------------------------------ */

export type ParseEngine = "local" | "llm";
export type ParseResponse = ParseResult & {
  engine: ParseEngine;
  /** Input segments nobody could resolve; the UI turns these into manual rows. */
  unknown?: string[];
  notice?: string;
};

/* ------------------------------------------------------------------ */
/* Coach                                                               */
/* ------------------------------------------------------------------ */

const NutrientsSchema = z.object({
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fibre_g: z.number(),
});

export const CoachRequestSchema = z.object({
  mode: z.enum(["daily", "weekly"]),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  profile: z.object({
    age: z.number(),
    sex: Sex,
    weightKg: z.number(),
    goal: Goal,
    rateKgPerWeek: z.number(),
    activity: Activity,
    diet: z.string().max(300),
    healthNotes: z.string().max(300),
  }),
  targets: NutrientsSchema,
  today: z.object({
    items: z
      .array(
        z.object({
          name: z.string().max(80),
          quantity: z.number(),
          unit: z.string().max(30),
          meal: Meal,
          calories: z.number(),
          protein_g: z.number(),
          carbs_g: z.number(),
          fat_g: z.number(),
          fibre_g: z.number(),
        }),
      )
      .max(60),
    totals: NutrientsSchema,
  }),
  days: z.array(NutrientsSchema.extend({ date: z.string(), items: z.number() })).max(14),
  /** Code-computed patterns, so the model doesn't have to do arithmetic. */
  insights: z.array(z.string().max(300)).max(12),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

export const CoachResponseSchema = z.object({
  snapshot: z.string().max(400),
  went_well: z.string().max(500),
  changes: z
    .array(
      z.object({
        title: z.string().max(80),
        detail: z.string().max(300),
        est_kcal_impact: z.number(),
        est_protein_impact_g: z.number(),
      }),
    )
    .max(3),
  remaining_today: z.string().max(400).nullable(),
  pattern_note: z.string().max(300).nullable(),
  safety_flag: z.boolean(),
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;
export type CoachResult = CoachResponse & { engine: ParseEngine; generatedAt: number };

/* ------------------------------------------------------------------ */
/* Photo parse                                                         */
/* ------------------------------------------------------------------ */

/** ~2 MB of base64; the client downsizes photos to ~1024 px JPEG (~150-400 KB) first. */
export const PHOTO_MAX_BASE64 = 2_800_000;

export const PhotoParseRequestSchema = z.object({
  image: z.string().min(100).max(PHOTO_MAX_BASE64).regex(/^[A-Za-z0-9+/=]+$/, "Image must be base64"),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** Optional caption typed in the box, e.g. "this was 2 plates". */
  note: z.string().trim().max(200).optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  diet: z.string().max(300).optional(),
});
export type PhotoParseRequest = z.infer<typeof PhotoParseRequestSchema>;
