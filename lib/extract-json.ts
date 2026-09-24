/** Pull a JSON object out of model text, tolerating stray ``` fences or prose around it. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in response");
  return JSON.parse(unfenced.slice(start, end + 1));
}
