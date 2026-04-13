# Attila's Daily

Personal daily dashboard PWA — news brief, tasks, finance, Spotify, and daily content cards. Deploy on Vercel for built-in AI API routes, installable on iOS/Android as a home screen app.

**Live:** Deploy the Vercel project URL after adding `GEMINI_API_KEY` and `FINNHUB_API_KEY`.

---

## Project structure

```
index.html   — app markup / shell
app.css      — app styles
app.js       — app behavior, API calls, local persistence
api/ai.js    — Vercel function that calls Gemini with a server-side key
api/finnhub.js — Vercel function that calls Finnhub with a server-side key
sw.js        — service worker (PWA caching + offline support)
manifest.json — PWA manifest (name, icons, display mode)
icon-192.png / icon-512.png — app icons
```

---

## Running locally

Use Vercel locally when testing AI or finance, because `/api/ai` and `/api/finnhub` are Vercel functions:

```bash
cd /Users/attila/Documents/03_Projects/attila-daily
cp .env.example .env.local
# edit .env.local with your real keys
npx vercel dev
```

For UI-only testing, a static server is still fine:

```bash
cd /Users/attila/Documents/03_Projects/attila-daily
python3 -m http.server 8080
open http://localhost:8080
```

The service worker registers on `localhost` separately from the live site, so local testing doesn't interfere with the phone version.

---

## Deploying to production

The app should be hosted on **Vercel** so `/api/ai` and `/api/finnhub` can call paid/keyed APIs without exposing secrets in browser code.

### One-time Vercel setup

1. Import the GitHub repo `LiroAV/attila-daily` in Vercel.
2. Add Environment Variable `GEMINI_API_KEY` with your Google AI Studio key.
3. Add Environment Variable `FINNHUB_API_KEY` with your Finnhub key.
4. Optionally add `GEMINI_MODEL=gemini-2.5-flash-lite`.
5. Check the Vercel production branch. This project currently deploys **Production** from `main`.

### Branch setup

Local work happens on `master`, while Vercel Production currently watches `main`.

That means a normal push to `master` creates a Vercel **Preview** deployment, not Production. To ship to Production, fast-forward `main` from `master` after committing.

Commit the app files before deploying:

```bash
git add .gitignore .env.example index.html app.css app.js api/ai.js api/finnhub.js sw.js
git commit -m "Your message"
git push origin master
```

Ship the same commit to Vercel Production:

```bash
git push origin master:main
```

In Vercel → **Deployments**, the production deployment should show:

```text
Production
Current
Ready
main
<latest commit>
```

If Vercel's production branch is changed to `master` later, remove the `git push origin master:main` step and use only `git push origin master`.

### Required Vercel env vars

| Name | Used by | Notes |
|---|---|---|
| `GEMINI_API_KEY` | `/api/ai` | Gemini key from Google AI Studio |
| `FINNHUB_API_KEY` | `/api/finnhub` | Finnhub API token for stock/index quotes |
| `GEMINI_MODEL` | `/api/ai` | Optional. Defaults to `gemini-2.5-flash-lite`, with fallback to `gemini-2.5-flash` |

After adding or changing env vars, redeploy the latest production deployment.

### Forcing a PWA update on mobile

After deploying, the phone may still show the old version due to service worker caching:

1. Close the app completely (swipe away from app switcher)
2. Reopen — the new service worker activates and forces a reload automatically

If it still doesn't update:
- iOS Safari: **Settings → Safari → Advanced → Website Data** → find the site → delete

### Bumping the service worker cache

Every time you deploy a meaningful change, bump the cache version in `sw.js`:

```js
const CACHE = 'attila-daily-v30'; // increment this
```

This tells the browser a new service worker is available and triggers the update flow.

---

## Tabs

| Tab | Description |
|---|---|
| **Home** | Weather, stats, Spotify, quote, morning brief, daily cards |
| **Brief** | AI-curated news from RSS feeds across 4 topics |
| **Tasks** | Local task manager with voice input |
| **Finance** | Live stock + crypto market data |

---

## APIs used

Most API calls are made directly from the browser. Gemini and Finnhub go through Vercel API routes so keys stay server-side. Results are cached in `localStorage` per day where noted.

### Home tab — daily cards

| Card | API | Notes |
|---|---|---|
| Weather | [Open-Meteo](https://open-meteo.com/) | Free, no key. GPS coordinates from browser |
| Weather location | [Nominatim (OpenStreetMap)](https://nominatim.openstreetmap.org/) | Reverse geocoding from lat/lon |
| Quote of the Day | [ZenQuotes](https://zenquotes.io/api/today) → [DummyJSON](https://dummyjson.com/quotes/random) | Cached daily. ZenQuotes returns the same quote all day |
| Today's Days | [Nager.at](https://date.nager.at/api/v3/PublicHoliday/) + [Checkiday](https://www.checkiday.com/api/3/) | Public holidays (HU + US) + special days. Cached daily |
| This Day in History | [Wikipedia On This Day](https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/) | Random event from today's date in history. Cached daily |
| Words of the Day (English) | [Merriam-Webster WOTD RSS](https://www.merriam-webster.com/wotd/feed/rss2) via [rss2json](https://api.rss2json.com/) | Cached daily |
| Words of the Day (German) | Local curated list of 10 words | No free German WOTD API exists — rotates by day of year |
| Did You Know | [UselessFacts](https://uselessfacts.jsph.pl/api/v2/facts/random) | 5 random facts fetched in parallel. Cached daily |
| Worth Knowing | [Wikipedia Random Summary](https://en.wikipedia.org/api/rest_v1/page/random/summary) | 2 random Wikipedia article summaries. Cached daily |
| Daily Joke | [JokeAPI](https://v2.jokeapi.dev/joke/Any?safe-mode) | Safe mode, blacklists nsfw/racist/sexist. Cached daily |
| Morning Brief | [Google Gemini API](https://ai.google.dev/) via `/api/ai` | Uses `gemini-2.5-flash-lite` by default. Key is stored in Vercel env vars |

### Home tab — Spotify

Uses **PKCE OAuth** (no backend, no client secret needed).

**Setup:**
1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add your Vercel app URL as a Redirect URI (e.g. `https://your-app.vercel.app/`)
4. Copy the Client ID
5. Paste into the Spotify card in the app and tap Connect

**How it works:**
- Generates a PKCE code verifier + challenge in the browser
- Redirects to Spotify auth, comes back with a code
- Exchanges the code for access + refresh tokens (stored in `localStorage`)
- Access token auto-refreshes when expired (1 hour lifetime)
- Shows currently playing track, or falls back to recently played

**Scopes used:** `user-read-currently-playing`, `user-read-recently-played`

**Relevant localStorage keys:**
```
spotify_client_id
spotify_access_token
spotify_refresh_token
spotify_expires_at
spotify_pkce_verifier
```

### Brief tab — News RSS

All feeds go through [rss2json](https://api.rss2json.com/) as a CORS proxy.

| Topic | Feeds |
|---|---|
| AI | VentureBeat AI, AI News, TechCrunch AI |
| Technology | TechCrunch, The Verge, Wired |
| Research | arXiv cs.AI, ScienceDaily AI, arXiv cs.LG |
| Markets | Yahoo Finance, MarketWatch, WSJ Markets |

### Finance tab

| Data | API |
|---|---|
| Stocks + market indices | [Finnhub](https://finnhub.io/) via `/api/finnhub` | Key is stored in Vercel env vars |
| Crypto (BTC, ETH) | [CoinGecko](https://api.coingecko.com/api/v3/coins/markets) | No key |

---

## localStorage reference

| Key | What it stores |
|---|---|
| `atd_daily_v1` | All daily cached content keyed by date (`quote`, `facts`, `knowledge`, `historyEvent`, `holidays`, `engWord`, `joke`, `usedEng`, `usedDeu`, `gratitude`) |
| `atd_tasks_v2` | Task list array |
| `atd_country` | Detected country code (for holiday API) |
| `spotify_*` | Spotify OAuth tokens (see above) |
| `atd_finance_v2` | Finance data cache (expires after 15 min) |
| IndexedDB `atd_photos_db_v1` | Photo-a-day archive |

---

## PWA / Service Worker

- **Cache name:** `attila-daily-v30` — bump this in `sw.js` on every deploy
- **Strategy:** Network-first for app shell (HTML), always network for `/api/*` and external APIs
- **On activate:** Deletes old caches, forces all open clients to reload (`client.navigate`)
- **`skipWaiting`:** New service worker takes over immediately on install

---

## Adding a new API-connected card

1. Add the HTML card in `index.html` inside `<div class="home-section">`
2. Write an async load function — check `getTodayData()` for a cached value first, fetch if missing, call `setTodayData({...})` to cache
3. Call your function from `loadHomeCard()` and add it to the visible-card list if it belongs on Home
4. Bump the SW cache version in `sw.js`
5. Push to `master`
