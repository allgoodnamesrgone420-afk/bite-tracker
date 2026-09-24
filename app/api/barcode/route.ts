import { z } from "zod";
import { OFF_FIELDS, offToItem, type OffProduct } from "@/lib/barcode";
import { BarcodeSchema, Meal } from "@/lib/schemas";
import { errorResponse, guard, okResponse, readJsonBody } from "@/lib/server/guard";

export const runtime = "nodejs";

const RequestSchema = z.object({ code: BarcodeSchema, meal: Meal });

/** Barcode → Open Food Facts (free, open database) → one item with label values. No AI involved. */
export async function POST(req: Request) {
  const blocked = await guard(req, "barcode");
  if (blocked) return blocked;

  const body = await readJsonBody(req, 500);
  if (!body.ok) return errorResponse("bad_request", "Couldn't read that request.");
  const parsed = RequestSchema.safeParse(body.body);
  if (!parsed.success) return errorResponse("bad_request", parsed.error.issues[0]?.message ?? "Invalid barcode.");
  const { code, meal } = parsed.data;

  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, {
      // Open Food Facts asks apps to identify themselves. No user data is sent.
      headers: { "user-agent": "Bite/1.0 (personal calorie tracker; https://github.com/allgoodnamesrgone420-afk/bite-tracker)" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return errorResponse(timeout ? "timeout" : "upstream", "Couldn't reach the product database. Try again, or snap the label.");
  }
  if (res.status === 404) return notFound();
  if (!res.ok) return errorResponse("upstream", "The product database is having a moment. Try again, or snap the label.");

  const json = (await res.json().catch(() => null)) as { status?: number; product?: OffProduct } | null;
  if (!json?.product || json.status === 0) return notFound();
  const item = offToItem(json.product, meal);
  if (!item) return errorResponse("not_found", "Found the product, but it has no nutrition data. Snap the label instead.");
  return okResponse({ code, item, source: "openfoodfacts" as const });
}

const notFound = () => errorResponse("not_found", "That barcode isn't in Open Food Facts yet. Snap the nutrition label instead.");
