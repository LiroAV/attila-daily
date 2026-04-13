# Attila's Daily — Feature Reference

A personal daily dashboard PWA. Static app (`index.html` + `app.css` + `app.js` + `sw.js`) plus Vercel API routes for Gemini and Finnhub.

---

## Architecture

- **Static vanilla app** with separate `index.html`, `app.css`, and `app.js`
- **No framework** — vanilla JS, DOM manipulation via `innerHTML`
- **Vercel serverless functions** proxy Gemini (`api/ai.js`) and Finnhub (`api/finnhub.js`) with server-side env vars
- **localStorage** for settings/tasks/cache, IndexedDB for photos
- **Service Worker** (`sw.js`) for PWA install + offline shell
- **Dark iOS-first design** — system fonts, safe-area insets, max-width 440px on desktop

---

## Tab 1 — Home

### Weather

**API**: [Open-Meteo](https://open-meteo.com/) (free, no auth)
- `GET https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=...&daily=...&timezone=auto`
- Fields: temperature, weather code (WMO), wind speed, humidity, daily high/low

**Reverse geocoding**: [Nominatim](https://nominatim.org/) (OpenStreetMap)
- `GET https://nominatim.openstreetmap.org/reverse?lat=...&lon=...&format=json`
- Used to show city + country code

**Flow**: Browser Geolocation API → both APIs fetched in parallel → WMO code mapped to condition string + SVG icon → rendered with large temp, feels-like, wind, humidity.

**Fallback**: Static message if location permission denied.

---

### Market Overview Stats

Small 2-column grid on the Home tab showing:
- **Tasks left** — count of incomplete tasks (green if 0)
- **Stories today** — count of articles loaded in the Brief tab

Pulls from in-memory state, no API call.

---

### Upcoming Events

Tracks three UZH-area clubs:

| Club | Data source |
|------|-------------|
| IC UZH | `GET https://www.icuzh.ch/api/events?page=1&limit=50` (JSON) |
| FVOEC | Manual link card (no public API) |
| UZHack | Manual link card (no public API) |

IC UZH events are fetched, filtered to future + published entries, and the next upcoming event per club is shown with date/time/location. Cache TTL: 4 hours (`atd_club_events_v1` in localStorage).

---

### Spotify — Now Playing

**Auth**: OAuth 2.0 PKCE flow (no backend, no client secret)
1. User provides their Spotify Client ID from the Spotify Developer Dashboard
2. App generates a 32-byte PKCE verifier → SHA-256 challenge
3. Redirects to `https://accounts.spotify.com/authorize`
4. On return, exchanges auth code for tokens at `https://accounts.spotify.com/api/token`
5. Access token auto-refreshed using the refresh token when expired

**Scopes**: `user-read-currently-playing`, `user-read-recently-played`

**Playback endpoint**: `GET https://api.spotify.com/v1/me/player/currently-playing`
- Falls back to `recently-played?limit=1` if nothing is playing

**Display**: Album art (56×56), track name, artist(s), play/pause status, progress bar.

**Storage keys**: `spotify_client_id`, `spotify_access_token`, `spotify_refresh_token`, `spotify_expires_at`, `spotify_pkce_verifier`

---

### Quote of the Day

**Primary**: `GET https://zenquotes.io/api/today` → `{ q, a }`
**Fallback 1**: `GET https://dummyjson.com/quotes/random` → `{ quote, author }`
**Fallback 2**: Hardcoded — "The secret of getting ahead is getting started." — Mark Twain

Cached daily in `atd_daily_v1`.

---

### Morning Brief (AI)

**Model**: `gemini-2.5-flash` via the local Vercel `/api/ai` route
```
POST /api/ai
Body: { prompt, maxTokens }
```

**Context injected into the prompt**:
- Today's date
- First 5 open tasks
- S&P 500 and BTC price + daily % change

**Prompt**: "Write a concise 3-sentence morning brief for Attila. Mention what matters today based on this context. Be warm and direct."

The Gemini API key is stored as the Vercel environment variable `GEMINI_API_KEY`; users do not paste a key into the app.

---

### Daily Cards

All cards cache their data in `atd_daily_v1` keyed by today's date string — data is fetched once per day.

#### Holidays / Special Days

- **Public holidays**: `GET https://date.nager.at/api/v3/PublicHoliday/{year}/{countryCode}` — fetched for user's detected country, US, and HU (Hungary)
- **Special days**: `GET https://www.checkiday.com/api/3/?d={MM}/{DD}/{YYYY}` — top 3 results
- Combined list, max 5 entries shown.

#### Word of the Day

- **English**: Merriam-Webster RSS → rss2json CORS proxy  
  `GET https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.merriam-webster.com%2Fwotd%2Ffeed%2Frss2`  
  Definition extracted from sentences longer than 3 words in the description field.
- **German**: Rotates through a curated list of 10 words (`dayOfYear() % 10`) — no free German WOTD API exists.

"Used it today?" toggle tracked per-day in localStorage.

#### Did You Know

**API**: UselessFacts — `GET https://uselessfacts.jsph.pl/api/v2/facts/random?language=en`  
Fetches 5 in parallel, takes whichever succeed first, caches 3.

#### This Day in History

**API**: Wikipedia On This Day  
`GET https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{month}/{day}`  
Randomly picks 1 of the first 10 events returned. Shows year + event text.

#### Worth Knowing

**API**: Wikipedia Random Summary (2 articles)  
`GET https://en.wikipedia.org/api/rest_v1/page/random/summary`  
Takes first sentence from each article's `extract`, formats as "Title: Sentence."

#### Grateful for Today

Textarea that auto-saves with an 800ms debounce. Stored in `atd_daily_v1[today].gratitude`. Shows "Saved" confirmation.

#### Daily Joke

**API**: JokeAPI  
`GET https://v2.jokeapi.dev/joke/Any?safe-mode&blacklistFlags=nsfw,racist,sexist`  
Handles both `twopart` (setup + delivery) and `single` formats.

---

## Tab 2 — Brief (News)

### RSS Feed Aggregation

Four topic categories, each with 3 RSS feeds:

| Topic | Sources |
|-------|---------|
| AI | VentureBeat AI, AI News, TechCrunch AI |
| Technology | TechCrunch, The Verge, Wired |
| Research | arXiv cs.AI, ScienceDaily AI, arXiv cs.LG |
| Stocks | Yahoo Finance, MarketWatch, WSJ Markets |

**Fetch pipeline**:
1. All feeds fetched via rss2json CORS proxy: `https://api.rss2json.com/v1/api.json?rss_url=...`
2. 9-second timeout per feed
3. Articles deduplicated by title
4. Scored by keyword importance (`breaking`, `crash`, `major`, `launch`, etc.) → score 1–9
5. 3–6 articles selected per topic targeting ~10–15 min total read time (220 WPM baseline)
6. Sorted by score descending

**Article cards**: Score badge (color-coded), source, title, 3-sentence summary, relative publish time, "Read full article →" link.

**Category glance**: Score + first sentence shown above article cards for quick scanning.

**Filter pills**: All / AI / Technology / Research / Stocks — rerenders on click.

---

### X Mode

Toggle (X button, top-right header) switches from RSS mode to embedded Twitter timelines.

**Implementation**: Loads Twitter widget JS, renders `<a class="twitter-timeline">` elements with topic-specific search queries, calls `window.twttr.widgets.load()`.

**Search queries by topic**: e.g., AI → `"AI OR OpenAI OR ChatGPT OR LLM"`.

---

## Tab 3 — Tasks

### Task Management

**Model**:
```js
{ id: Date.now(), text: "...", done: false, date: "Mar 15", time: "2:30 PM", priority: "high" }
```

**Operations**: Add, toggle done/undone, delete. List sorted — incomplete first.

**Storage**: `atd_tasks_v2` in localStorage. Task count badge on tab icon.

---

### Voice Input

**API**: Web Speech Recognition — `window.SpeechRecognition` / `window.webkitSpeechRecognition`  
Language: `en-US`, continuous mode, interim results enabled.

**Flow**: Mic button starts recording → transcript accumulated → on stop, `processVoiceResult()` runs smart parsing:

- **Date parsing**: Keywords (today, tomorrow, day names, month names) + regex `/\b(jan|feb|...)\s+(\d{1,2})/`
- **Time parsing**: Regex `/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i` with AM/PM inference
- **Priority parsing**: Keywords — urgent/asap/critical → `urgent`, important/must → `high`, low priority → `low`
- **Text cleaning**: Strips parsed date/time/priority keywords, collapses whitespace

**Preview UI**: Shows transcribed text + extracted date/time/priority badges before confirming.

**iOS recovery**: Auto-restarts recognition on `onend` if still in recording state.

---

## Tab 4 — Finance

### Market Indices

| Symbol | Label |
|--------|-------|
| ^GSPC | S&P 500 |
| ^IXIC | Nasdaq |
| BTC-USD | Bitcoin |
| ETH-USD | Ethereum |

### Watchlist (18 stocks)

META, COIN, MSFT, ELF, CAKE, AMZN, IONQ, SCHG, VT, QQQM, SOFI, TSM, GOOGL, VGT, NVDA, PLTR, VOO, AMD

---

### Data Sources

**Stocks & Indices**: Finnhub API  
Browser calls `GET /api/finnhub?symbols={comma-separated-symbols}`; Vercel calls `https://finnhub.io/api/v1/quote?symbol={symbol}&token={key}`.  
Response: `c` (price), `d` (change abs), `dp` (% change), `o` (open), `h` (high), `l` (low), `pc` (prev close)  
Finnhub API key is stored as the Vercel environment variable `FINNHUB_API_KEY`; users do not paste a key into the app.

**Crypto**: CoinGecko  
`GET https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&...`  
Response includes `current_price`, `price_change_24h`, `price_change_percentage_24h`, `high_24h`, `low_24h`, `ath`, `atl`.

**Cache TTL**: 15 minutes (`atd_finance_v2` in localStorage). Force-refresh available.

---

### Stock Card Display

Each stock card shows:
- Ticker + company name
- Price (large), absolute + percentage change (green/red)
- Open, High, Low stats
- 52-week range bar with a dot marking current price position
- Smart note: "Trading near 52-week high/low", "Surging X%", etc.

---

## PWA / Offline

**Manifest** (`manifest.json`): `display: standalone`, portrait orientation, black theme, icons at 192 and 512px.

**Service Worker** (`sw.js`, cache `attila-daily-v30`):
- On install: `skipWaiting()` to take over immediately
- On activate: deletes old caches, calls `client.navigate()` to force-reload all open tabs
- Fetch strategy: Vercel API routes and external APIs → network only (fail with 503); app shell → network-first with cache fallback

---

## All APIs at a Glance

| Service | Endpoint | Auth | Purpose |
|---------|----------|------|---------|
| Open-Meteo | `/v1/forecast` | None | Weather |
| Nominatim | `/reverse` | None | Reverse geocoding |
| ZenQuotes | `/api/today` | None | Quote of the day |
| DummyJSON | `/quotes/random` | None | Quote fallback |
| Nager.at | `/api/v3/PublicHoliday/{year}/{cc}` | None | Public holidays |
| Checkiday | `/api/3/` | None | Special days |
| Merriam-Webster (via rss2json) | RSS feed | None | English WOTD |
| UselessFacts | `/api/v2/facts/random` | None | Random facts |
| Wikipedia (On This Day) | `/api/rest_v1/feed/onthisday/events/...` | None | Historical events |
| Wikipedia (Random) | `/api/rest_v1/page/random/summary` | None | Worth knowing |
| JokeAPI | `/joke/Any?safe-mode` | None | Daily joke |
| Google Gemini | `/api/ai` → Gemini `generateContent` | Vercel env var | Morning brief, AI summary, Market Pulse |
| IC UZH | `/api/events` | None | Club events |
| Spotify | `/authorize`, `/api/token`, `/v1/me/player/*` | OAuth PKCE | Now playing |
| Finnhub | `/api/finnhub` → `/api/v1/quote` | Vercel env var | Stock quotes |
| CoinGecko | `/api/v3/coins/markets` | None | Crypto prices |
| rss2json | `/v1/api.json` | None | CORS proxy for all RSS feeds |

---

## localStorage Keys

| Key | Content |
|-----|---------|
| `atd_daily_v1` | All daily cached content (quote, facts, knowledge, history, holidays, words, joke, gratitude) |
| `atd_tasks_v2` | Task list array |
| `atd_country` | Detected country code from geolocation |
| `atd_finance_v2` | Finance quote cache with timestamp |
| `atd_club_events_v1` | Club events with timestamp |
| `spotify_*` | Spotify OAuth tokens and Client ID |

## IndexedDB Stores

| Database | Content |
|----------|---------|
| `atd_photos_db_v1` | Photo-a-day archive, migrated from legacy `atd_photos_v1` localStorage data |
