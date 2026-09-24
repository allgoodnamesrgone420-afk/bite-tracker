import type { Meal } from "./schemas";

export const MEAL_STYLE: Record<Meal, { label: string; color: string; glyph: string }> = {
  breakfast: { label: "Breakfast", color: "#ffb800", glyph: "☀" },
  lunch: { label: "Lunch", color: "#d4ff3a", glyph: "◐" },
  snack: { label: "Snacks", color: "#ff6f9a", glyph: "✦" },
  dinner: { label: "Dinner", color: "#9b7bff", glyph: "☾" },
};
