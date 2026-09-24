# Bite: plain-language calorie tracker

Describe what you ate ("2 rotis, a bowl of dal and a small bowl of curd at lunch"), confirm the parsed items, and track the day against targets calculated in code.

**What's in:** natural-language logging (built-in food library + AI), photo logging, personal calibration, quick-add chips, editing with a "correct this" box, "same as yesterday" and "log again" from history, Today dashboard, Progress (calendar, 14-day chart, per-macro over/short), Coach (patterns from your logs + AI daily/weekly review), system/light/dark themes, backup, and an installable PWA with an offline app shell.

## How logging works

1. **Food library first (instant, free, offline).** `lib/local-parser.ts` understands quantities (`2`, `½`, `dedh`, `150g`), household units (scoop, katori, glass, tbsp…), Hinglish, meal words and times. It knows about 100 common Indian home-cooked, gym and packaged foods (`lib/food-db.ts`). "2 scoop whey" resolves with no AI call.
2. **Your foods.** Everything you log is remembered per unit. If you change the numbers in the confirm sheet (for example your whey brand's label), the food becomes *calibrated* and your values win over the library and AI from then on. Manage them in Settings → My foods.
3. **AI for the rest.** Anything the library doesn't recognise, or anything vague ("some rice"), goes to `/api/parse`. With no key, or offline, you get the library's partial result plus blank rows for the parts it didn't know.
4. **Quick add and repeats.** Chips above the input hold your most-logged foods at your usual portion. Today offers "Same breakfast as yesterday?" for the current meal slot, and every past meal in Progress has **Log again**.
5. **Editing.** Tap any logged item to change the numbers, delete it, or type a fix in **Correct this** ("that was 1 tbsp of oil, not 3"). The AI applies corrections. Offline, or without a key, simple ones like "it was 3" or "only half" still work; recipe changes need the AI. Edited numbers calibrate that food.
6. **Photos.** The camera icon in the input opens the phone camera (or a picker on desktop). The photo is downsized to about 1024px in the browser and sent to `/api/parse-photo` (vision model), which breaks it into items with portions and macros. Anything typed in the box goes along as a caption ("that was 2 plates"). Photos are analysed in memory and never stored. **This needs the API key.**

## Architecture

- **Next.js 16 App Router + TypeScript + Tailwind v4 + Zod.** Client-rendered screens; three stateless route handlers: `/api/parse` (text), `/api/parse-photo` (vision) and `/api/coach`. The client owns all fallbacks (food library, built-in coach), so the server stays a thin, keyed proxy to the model.
- **`lib/llm.ts`** is the only file that knows about the provider (Anthropic SDK). It exposes `callLLM({ model, system, messages, schema, maxTokens, temperature })`. It uses structured JSON-schema output, parses fences defensively, validates with Zod, retries once with the validation error appended, and returns a typed error. There's a 20 s wall clock, and the SDK retries 429/5xx once with backoff. Temperature and thinking settings are adjusted per model, because newer models reject `temperature`.
- **`lib/server/guard.ts`** handles the optional `APP_PASSCODE` header check (constant-time), a per-IP token-bucket rate limit (20/min for parse), body-size limits and error mapping. **`lib/server/prompts.ts`** holds the static, cache-friendly system prompt. User text goes inside `<input>` tags with `<`/`>` neutralised.
- **`lib/targets.ts`** is pure code: Mifflin-St Jeor → TDEE → goal adjustment (7,700 kcal/kg) → protein / fat / carbs / fibre. It enforces the 1,200 kcal (women) and 1,500 kcal (men) floors, caps loss at 1% of body weight per week, and returns every step for "How we calculated this".
- **`lib/totals.ts`** sums totals, per-meal splits, remaining, macro split and streak. The LLM never does totals arithmetic.
- **`lib/db.ts`** stores everything in IndexedDB (`idb-keyval`) under these keys: `profile`, `overrides`, `passcode`, `summaries` (one compact row per day), `day:YYYY-MM-DD`, and `parseCache` (keyed by normalised text + meal slot, so repeated inputs make no API call). It also handles JSON export/import.

## Setup

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Var | Purpose |
|---|---|
| `LLM_API_KEY` | Anthropic API key (server-only) |
| `LLM_PARSER_MODEL` | defaults to `claude-haiku-4-5` |
| `LLM_VISION_MODEL` | photo breakdowns, defaults to `claude-sonnet-5` |
| `LLM_COACH_MODEL` | defaults to `claude-sonnet-5` |
| `APP_PASSCODE` | optional; if set, clients must send it (entered once, stored on device) |

```bash
npm run dev
```

Open http://localhost:3000, fill in Settings, then log food from the bar at the bottom.

```bash
npm test
```

Runs Vitest: target calculator, totals/streak, local parser (whey, Hinglish, fractions, times, add-ons, negations, unknown dishes), calibration, progress classification, insights and the local coach, and Zod fixtures for parse, coach and photo requests.

Without a key the app still works: the food library, your calibrated foods, Progress and the built-in coach are all computed on-device. Only unrecognised dishes, photos and the AI coach need `LLM_API_KEY`.

## Deploy (Vercel)

1. Push the repo and import it in Vercel.
2. In Project → Settings → Environment Variables, add `LLM_API_KEY`, `LLM_PARSER_MODEL`, `LLM_VISION_MODEL`, `LLM_COACH_MODEL` and optionally `APP_PASSCODE`.
3. Deploy. The route handler runs on the Node.js runtime. The in-memory rate limiter is per instance, which is fine for a personal app; use Upstash or Redis if you share it.

## Install as an app (PWA)

In a production build (`npm run build && npm start`, or deployed), open the site on your phone:
- **Android / Chrome:** menu → *Install app*.
- **iPhone / Safari:** Share → *Add to Home Screen*.

A service worker (`public/sw.js`, registered only in production) caches the app shell. Offline you can still open the app, browse history, use the food library and your saved foods, and add entries manually. AI calls are never cached. Icons are rendered by `node scripts/generate-icons.mjs`.

## Security notes

- No env var is prefixed `NEXT_PUBLIC_`, and `lib/llm.ts`, `lib/server/*` import `server-only`, so importing them from a client component fails the build.
- Verified by building with sentinel values and grepping `.next/static`. No key, passcode value, provider host or system prompt is in client JS.
- The server logs only an error code and model name, never payloads or keys. Photos are analysed in memory and never stored.
- Security headers on every route: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Permissions-Policy` limiting device access to the camera. The service worker gets its own strict CSP.

## Test inputs

1. `2 scoop whey` or `1 scoop whey with milk and 2 banana` (instant, food library)
2. `2 rotis, a bowl of dal and a small bowl of curd at lunch` (multi-item, household measures)
3. `had some rice` (vague, so you get a clarifying question with chips. Try "Skip" to get an ASSUMED item.)
4. `poha for breakfast, 2 boiled eggs at 11, and chicken biryani with raita for dinner` (multi-meal)
5. Correction: log `dal tadka`, tap it, and type `that was 1 tbsp of oil, not 3` in **Correct this** (needs the key). Offline, try `it was 2` instead.
6. `remind me to call mom at 6` (non-food, so the sheet says "doesn't look like food")
7. `aaj lunch mein 3 roti, sabzi aur chaas` (Hinglish)
8. Photo: tap the camera in the input and snap your plate (needs the key). Type "only ate half" first to add a caption.
