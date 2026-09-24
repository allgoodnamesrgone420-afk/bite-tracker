# Bite: plain-language calorie tracker

Describe what you ate ("2 rotis, a bowl of dal and a small bowl of curd at lunch"), confirm the parsed items, and track the day against targets calculated in code.

**What's in:** natural-language logging (built-in food library + AI), voice, photo and barcode logging, personal calibration, saved meals and recipes, quick-add chips, editing with a "correct this" box, "same as yesterday" and "log again" from history, Today dashboard with micronutrients (sodium, sugar, sat. fat, calcium, iron), Progress (14/30/90-day chart with 7-day average, calendar, weight trend, adaptive maintenance, averages, top foods), Coach (chat that remembers your preferences, patterns from your logs, AI daily/weekly review), a desktop layout, system/light/dark themes, backup, and an installable PWA with an offline app shell.

## How logging works

1. **Food library first (instant, free, offline).** `lib/local-parser.ts` understands quantities (`2`, `½`, `dedh`, `150g`), household units (scoop, katori, glass, tbsp, peg…), Hinglish, meal words and times. It knows about 200 common Indian home-cooked, street, restaurant, gym and packaged foods, each with macros and micronutrients (`lib/food-db.ts`, checked by `tests/food-db.test.ts`). "2 scoop whey" resolves with no AI call.
2. **Your foods.** Everything you log is remembered per unit. If you change the numbers in the confirm sheet (for example your whey brand's label), the food becomes *calibrated* and your values win over the library and AI from then on. Manage them on the **Foods** tab.
3. **AI for the rest.** Anything the library doesn't recognise, or anything vague ("some rice"), goes to `/api/parse`. With no key, or offline, you get the library's partial result plus blank rows for the parts it didn't know.
4. **Quick add and repeats.** Chips above the input hold your most-logged foods at your usual portion. Today offers "Same breakfast as yesterday?" for the current meal slot, and every past meal in Progress has **Log again**.
5. **Editing.** Tap any logged item to change the numbers, delete it, or type a fix in **Correct this** ("that was 1 tbsp of oil, not 3"). The AI applies corrections. Offline, or without a key, simple ones like "it was 3" or "only half" still work; recipe changes need the AI. Edited numbers calibrate that food.
6. **Photos.** The camera icon in the input opens the phone camera (or a picker on desktop). The photo is downsized to about 1024px in the browser and sent to `/api/parse-photo` (vision model), which breaks it into items with portions and macros. Anything typed in the box goes along as a caption ("that was 2 plates"). Photos are analysed in memory and never stored. **This needs the API key.**
7. **Voice.** The mic in the input uses the browser's speech recognition (`en-IN`) and fills the box; you still press send. Chrome processes the audio on Google's servers, Safari on Apple's.
8. **Barcodes.** **+** → *Scan a barcode* scans packaged food with the camera (native `BarcodeDetector`, or a self-hosted WebAssembly decoder on iPhone), from a photo, or by typing the number. `/api/barcode` looks it up in [Open Food Facts](https://world.openfoodfacts.org) (only the number is sent) and returns label values per serving. Not found? *Snap the label* reads it with the vision model.
9. **Saved meals and recipes.** Tap the bookmark on a meal (or *Save as meal* when confirming) to log the same group in one tap from **+**. On **Foods**, a recipe takes your ingredient list, works out the nutrition, and divides by servings; it then acts as a calibrated food, so "1 serving mom's rajma" parses instantly.

## Targets that adapt

- **Weight.** Log weigh-ins on Progress. Bite smooths them into a trend (exponential moving average) and uses your trend weight for targets once you weigh in.
- **Adaptive maintenance** (`lib/weight.ts`). With at least 10 fully logged days and 4 weigh-ins spread over 10+ days in the last 4 weeks, Bite estimates what you actually burn: average intake minus the energy implied by your weight trend (7,700 kcal/kg). Days under half your target are skipped as incomplete. The estimate is clamped to ±25% of the formula and blended with it until confidence is high. Targets use it when **Adapt to my data** is on (Settings, default on); the 1,200/1,500 kcal floors and the 1%/week loss cap still apply.
- **Micronutrients.** Sodium (under 2,000 mg), sugar and saturated fat (under 10% of calories each), calcium (1,000 mg) and iron (19 mg men / 29 mg women, ICMR-NIN 2020). Items logged before micronutrients were added don't have them, so every total shows its coverage.

## Coach chat

Ask anything ("plan my dinner", "why am I not losing weight?"). To keep it cheap:
- The app sends a **compact digest** of your logs computed on the device (targets, today, last 7 days, 14-day averages, frequent foods, weight trend, patterns), a few hundred tokens instead of raw history.
- Only the **last 10 turns** go with each message, history first, so the provider's prompt cache can reuse it.
- **Memory:** the coach saves short notes about you (vegetarian, dislikes mushrooms, gym at 7am…) and uses them in chat and in the daily and weekly reviews. You can see, add and delete them under *What the coach remembers*. Memory and chat sync with your account.
- "What's left today?" is answered on the device with no AI call.
- Limits: 10 messages a minute, 120 a day per person.

## Accounts & sync

With Supabase connected, Bite has accounts and syncs across devices:

- **Sign in** with email + password. Sign-up is **invite-only**: a database trigger rejects any email that isn't on the invite list, and the owner manages invites in Settings → People.
- **Local-first sync.** Each device keeps a full copy in IndexedDB, so the app is instant and works offline. Every change goes into an outbox, gets pushed to Postgres, and changes from other devices are pulled and merged by record (`lib/sync.ts`, `lib/sync-core.ts`). The server's `updated_at` decides order, so the last write to reach the server wins per item. Syncs run after edits, on focus, when you're back online, and every minute.
- **Privacy.** Row-level security (`supabase/schema.sql`) means each user can only read and write their own rows, and only while their email is still invited. Removing someone cuts off their sync and AI access.
- **What syncs:** log items, your foods, profile and targets, plus a generic `records` table for weigh-ins, saved meals, recipes, the coach's memory and chat history (each record capped at 64 KB).
- **Your name** is stored on your account (`display_name`); set it at sign-up or in Settings. Change your password under Settings → Account, which asks for your current password first.
- **AI routes** accept only a signed-in, invited user, which replaces the passcode. Without Supabase the app runs in local-only mode, exactly as before.
- **Signing out** clears this device; your data stays in your account. The first sign-in on a device uploads anything logged there before the account existed.

### Setting it up

1. In Vercel, open the `bite-tracker` project → **Storage** → **Create Database** → **Supabase**, pick a region near you, and connect it to all environments. This adds the Supabase env vars to the project.
2. Pull the env vars locally, then create the tables and register yourself as owner:
   ```bash
   npx vercel env pull .env.local
   ```
   ```bash
   npm run db:setup -- you@example.com
   ```
3. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your production URL, and add `https://<your-domain>/**` and `http://localhost:3000/**` to **Redirect URLs** (for confirmation and password-reset links). In **Authentication → Providers → Email** (or *Sign In / Providers*), set the minimum password length to 8 to match the app.
4. Redeploy, open the site, choose **New account** with the owner email, confirm it from your inbox, and sign in.

## AI providers

Bring a key from any supported provider. Settings → AI shows what's active.

| Key looks like | Provider | Defaults |
|---|---|---|
| `sk-…`, `sk-proj-…` | OpenAI (Responses API) | `gpt-6-luna` for text, photos and coach, `low` reasoning effort, `store: false` |
| `sk-ant-…` | Anthropic | `claude-haiku-4-5` text, `claude-sonnet-5` photos and coach |
| `AIza…` · `gsk_…` · `sk-or-…` · `xai-…` | Gemini · Groq · OpenRouter · xAI | set `LLM_MODEL` |
| anything else | `LLM_PROVIDER=deepseek`, `mistral`, or `compatible` + `LLM_BASE_URL` | set `LLM_MODEL` |

Every provider gets the same guarantees: schema-constrained JSON, Zod validation with one repair retry, a 20 s timeout, and the same error handling. `lib/llm/` has one adapter per API style (Anthropic Messages, OpenAI Responses, OpenAI-compatible Chat Completions), and nothing outside it knows which provider is in use. For photos, pick a model that accepts images.

To switch: change `LLM_API_KEY` (plus `LLM_PROVIDER` / `LLM_MODEL` if needed) in Vercel → Settings → Environment Variables, then redeploy.

## Architecture

- **Next.js 16 App Router + TypeScript + Tailwind v4 + Zod.** Client-rendered screens with a phone layout (bottom dock) and a desktop layout (sidebar, food bar on top, multi-column dashboards; press `/` to jump to the food box). Stateless route handlers: `/api/parse` (text), `/api/parse-photo` (vision), `/api/coach` (reviews), `/api/chat` (coach chat) and `/api/barcode` (Open Food Facts). The client owns all fallbacks (food library, built-in coach), so the server stays a thin, keyed proxy.
- **`lib/llm/`** is the only code that knows about AI providers. `callLLM({ task, system, messages, schema, maxTokens, temperature })` picks the provider and model from env (`config.ts`), sends a strict JSON schema, parses fences defensively, validates with Zod, retries once with the validation error appended, and returns a typed error. There's a 20 s wall clock, and the SDKs retry 429/5xx once with backoff. Per-model quirks (temperature, thinking, effort) live in the adapters.
- **`lib/server/guard.ts`** verifies the signed-in, invited user, then rate-limits per user and route in Postgres (`take_token()`: a per-minute token bucket plus a daily cap, so limits hold across every serverless instance). Limits per minute / per day: parse 20/300, photos 8/40, reviews 6/30, chat 10/120, barcode 20/200. In local-only mode it falls back to the optional `APP_PASSCODE` and an in-memory limiter. **`lib/server/prompts.ts`** holds the static, cache-friendly system prompts. User text goes inside tags with `<`/`>` neutralised.
- **`lib/targets.ts`** is pure code: Mifflin-St Jeor → TDEE → goal adjustment (7,700 kcal/kg) → protein / fat / carbs / fibre. It enforces the 1,200 kcal (women) and 1,500 kcal (men) floors, caps loss at 1% of body weight per week, and returns every step for "How we calculated this".
- **`lib/totals.ts`** sums totals, per-meal splits, remaining, macro split and streak. The LLM never does totals arithmetic.
- **`lib/db.ts`** stores everything on the device in IndexedDB (`idb-keyval`): `profile`, `overrides`, `summaries` (one compact row per day, with micros), `day:YYYY-MM-DD`, `myFoods`, `rec:<kind>` records, `parseCache`, and the sync outbox and cursor. It also handles JSON export/import.
- **Supabase** (Postgres + Auth) is the cloud copy when accounts are enabled: tables `profiles`, `log_items`, `my_foods`, `records`, `allowed_emails` and `rate_limits`, all behind row-level security. Re-run `npm run db:setup -- you@example.com` after pulling schema changes; it's idempotent.

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
| `LLM_API_KEY` | Any supported provider's API key (server-only); the provider is inferred from the key |
| `LLM_PROVIDER` | optional: `openai`, `anthropic`, `gemini`, `groq`, `openrouter`, `deepseek`, `xai`, `mistral`, `compatible` |
| `LLM_MODEL` | optional: one model for all tasks; or per task `LLM_PARSER_MODEL`, `LLM_VISION_MODEL`, `LLM_COACH_MODEL` |
| `LLM_REASONING_EFFORT` | optional: `none` … `max`, where the model supports it |
| `LLM_BASE_URL` | required for `compatible` (any OpenAI-compatible endpoint) |
| `APP_PASSCODE` | optional; if set, clients must send it (entered once, stored on device) |

```bash
npm run dev
```

Open http://localhost:3000, fill in Settings, then log food from the bar at the bottom.

```bash
npm test
```

Runs Vitest: target calculator, totals/streak, local parser (whey, Hinglish, fractions, times, add-ons, negations, unknown dishes), food-library data checks (calories match macros, sugar within carbs), calibration, micros, weight trend and adaptive maintenance, record sync, coach memory and digest, Open Food Facts mapping, recipes, progress classification, insights and the local coach, and Zod fixtures for parse, coach, chat and photo requests.

Without a key the app still works: the food library, your calibrated foods, Progress and the built-in coach are all computed on-device. Only unrecognised dishes, photos and the AI coach need `LLM_API_KEY`.

## Deploy (Vercel)

1. Push the repo and import it in Vercel.
2. In Project → Settings → Environment Variables, add `LLM_API_KEY`, `LLM_PARSER_MODEL`, `LLM_VISION_MODEL`, `LLM_COACH_MODEL` and optionally `APP_PASSCODE`.
3. Deploy. The route handlers run on the Node.js runtime. With Supabase connected, rate limits live in Postgres; `npm install` copies the barcode decoder into `public/vendor/` (postinstall).

## Install as an app (PWA)

In a production build (`npm run build && npm start`, or deployed), open the site on your phone:
- **Android / Chrome:** menu → *Install app*.
- **iPhone / Safari:** Share → *Add to Home Screen*.

A service worker (`public/sw.js`, registered only in production) caches the app shell. Offline you can still open the app, browse history, use the food library and your saved foods, and add entries manually. AI calls are never cached. Icons are rendered by `node scripts/generate-icons.mjs`.

## Security notes

- The only `NEXT_PUBLIC_` vars are the Supabase URL and anon/publishable key, which are public by design; row-level security protects the data. The service-role key is never used. `lib/llm.ts` and `lib/server/*` import `server-only`, so importing them from a client component fails the build.
- Verified by building with sentinel values and grepping `.next/static`. No key, passcode value, provider host or system prompt is in client JS.
- The server logs only an error code and model name, never payloads or keys. Photos are analysed in memory and never stored.
- Security headers on every route: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Permissions-Policy` limiting device access to the camera (photos, barcodes) and microphone (voice). The service worker gets its own strict CSP.
- The coach's memory is plain text you can read and delete in the app; it's sent to the AI provider only with your own chat and review requests (OpenAI with `store: false`).

## Test inputs

1. `2 scoop whey` or `1 scoop whey with milk and 2 banana` (instant, food library)
2. `2 rotis, a bowl of dal and a small bowl of curd at lunch` (multi-item, household measures)
3. `had some rice` (vague, so you get a clarifying question with chips. Try "Skip" to get an ASSUMED item.)
4. `poha for breakfast, 2 boiled eggs at 11, and chicken biryani with raita for dinner` (multi-meal)
5. Correction: log `dal tadka`, tap it, and type `that was 1 tbsp of oil, not 3` in **Correct this** (needs the key). Offline, try `it was 2` instead.
6. `remind me to call mom at 6` (non-food, so the sheet says "doesn't look like food")
7. `aaj lunch mein 3 roti, sabzi aur chaas` (Hinglish)
8. Photo: tap the camera in the input and snap your plate (needs the key). Type "only ate half" first to add a caption.
9. Barcode: **+** → *Scan a barcode*, or type `3017620422003` (Nutella) to test the lookup.
10. Voice: tap the mic and say "two roti and a katori of dal for lunch".
11. Recipe: Foods → Recipes → New, `250g rajma (dry), 2 tbsp oil, 2 onion, 2 tomato`, 4 servings. Then type `1 serving rajma` (use your recipe's name).
12. Coach chat: ask "plan my dinner", answer its question, then open *What the coach remembers*.
13. Weight: log a few weigh-ins on Progress; after ~2 weeks of full logging, Settings shows maintenance "from your data".
