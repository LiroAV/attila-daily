# Attila's Daily

Personal daily dashboard PWA — news brief, tasks, finance, Spotify, and daily content cards. Hosted on GitHub Pages, installable on iOS/Android as a home screen app.

**Live:** https://liroav.github.io/attila-daily/

---

## Project structure

```
index.html   — entire app (single file: HTML + CSS + JS)
sw.js        — service worker (PWA caching + offline support)
manifest.json — PWA manifest (name, icons, display mode)
icon-192.png / icon-512.png — app icons
```

---

## Running locally

```bash
cd /Users/attila/Documents/03_Projects/attila-daily
python3 -m http.server 8080
open http://localhost:8080
```

The service worker registers on `localhost` separately from the live site, so local testing doesn't interfere with the phone version.

---

## Deploying to production

The app is hosted on **GitHub Pages** from the `master` branch.

```bash
# Stage, commit, and push — one command deploys to production
git add index.html sw.js
git commit -m "Your message"
git push origin master
```

GitHub Pages deploys automatically within ~60 seconds after the push. You can verify the live version is updated by checking the cache version in `sw.js`:

```bash
curl -s https://liroav.github.io/attila-daily/sw.js | head -1
```

### Forcing a PWA update on mobile

After deploying, the phone may still show the old version due to service worker caching:

1. Close the app completely (swipe away from app switcher)
2. Reopen — the new service worker activates and forces a reload automatically

If it still doesn't update:
- iOS Safari: **Settings → Safari → Advanced → Website Data** → find the site → delete

### Bumping the service worker cache

Every time you deploy a meaningful change, bump the cache version in `sw.js`:

```js
const CACHE = 'attila-daily-v10'; // increment this
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

All API calls are made directly from the browser (no backend). Results are cached in `localStorage` per day where noted.

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
| Morning Brief | [Anthropic Claude API](https://api.anthropic.com/v1/messages) | Uses `claude-haiku-4-5`. User provides their own API key, stored locally |

### Home tab — Spotify

Uses **PKCE OAuth** (no backend, no client secret needed).

**Setup:**
1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add your app's URL as a Redirect URI (e.g. `https://liroav.github.io/attila-daily/`)
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
| Stocks (AAPL, NVDA, MSFT, GOOGL, META, TSLA) | [Yahoo Finance via rss2json](https://query1.finance.yahoo.com/v8/finance/chart/) |
| Market indices (S&P 500, Nasdaq, Gold) | Yahoo Finance |
| Crypto (BTC, ETH) | [CoinGecko](https://api.coingecko.com/api/v3/simple/price) |

---

## localStorage reference

| Key | What it stores |
|---|---|
| `atd_daily_v1` | All daily cached content keyed by date (`quote`, `facts`, `knowledge`, `historyEvent`, `holidays`, `engWord`, `joke`, `usedEng`, `usedDeu`, `gratitude`) |
| `atd_tasks_v2` | Task list array |
| `atd_claude_key` | Anthropic API key for Morning Brief |
| `atd_country` | Detected country code (for holiday API) |
| `spotify_*` | Spotify OAuth tokens (see above) |
| `atd_fin_cache` | Finance data cache (expires after 5 min) |

---

## PWA / Service Worker

- **Cache name:** `attila-daily-v10` — bump this in `sw.js` on every deploy
- **Strategy:** Network-first for app shell (HTML), always network for external APIs
- **On activate:** Deletes old caches, forces all open clients to reload (`client.navigate`)
- **`skipWaiting`:** New service worker takes over immediately on install

---

## Adding a new API-connected card

1. Add the HTML card in `index.html` inside `<div class="home-section">`
2. Write an async load function — check `getTodayData()` for a cached value first, fetch if missing, call `setTodayData({...})` to cache
3. Call your function from `loadHome()`
4. Bump the SW cache version in `sw.js`
5. Push to `main`
