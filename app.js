// ── CONFIG ──────────────────────────────────
const TOPICS = {
  AI: {
    color: '#0A84FF',
    label: 'Artificial Intelligence',
    feeds: [
      'https://venturebeat.com/category/ai/feed/',
      'https://www.artificialintelligence-news.com/feed/',
      'https://techcrunch.com/category/artificial-intelligence/feed/'
    ]
  },
  Technology: {
    color: '#30d158',
    label: 'Technology',
    feeds: [
      'https://techcrunch.com/feed/',
      'https://www.theverge.com/rss/index.xml',
      'https://www.wired.com/feed/rss'
    ]
  },
  Research: {
    color: '#bf5af2',
    label: 'Research & Science',
    feeds: [
      'https://arxiv.org/rss/cs.AI',
      'https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml',
      'https://rss.arxiv.org/rss/cs.LG'
    ]
  },
  Stocks: {
    color: '#ff9f0a',
    label: 'Markets & Finance',
    feeds: [
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^NDX,AAPL,NVDA,MSFT',
      'https://www.marketwatch.com/rss/topstories',
      'https://feeds.a.dj.com/rss/RSSMarketsMain.xml'
    ]
  }
};

const R2J = 'https://api.rss2json.com/v1/api.json?rss_url=';
const WPM = 220;
const TARGET_MIN = 10;
const TARGET_MAX = 15;

// ── STATE ────────────────────────────────────
let data = {};
let activeFilter = 'all';

// ── SPLASH ───────────────────────────────────
const SPLASH_STEPS = [
  { id: 'spN0', label: 'fetching weather…' },
  { id: 'spN1', label: 'loading brief…' },
  { id: 'spN2', label: 'syncing markets…' },
  { id: 'spN3', label: 'building tasks…' },
];
function runSplash(onDone) {
  const status = document.getElementById('spStatus');
  let i = 0;
  function step() {
    if (i >= SPLASH_STEPS.length) {
      status.style.opacity = '0';
      setTimeout(() => {
        document.getElementById('splash').classList.add('hide');
        setTimeout(onDone, 560);
      }, 220);
      return;
    }
    const s = SPLASH_STEPS[i];
    document.getElementById(s.id).classList.add('lit');
    status.textContent = s.label;
    i++;
    setTimeout(step, 320);
  }
  setTimeout(step, 350); // brief pause before first step
}

// ── BOOT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  runSplash(async () => {
    await handleSpotifyCallback();
    setHeader();
    loadAll();
    renderTasks();
    renderHabits();
    loadHome();
  });
});

function setHeader() {
  const now = new Date(), h = now.getHours();
  document.getElementById('greeting').textContent =
    h < 12 ? 'Good morning, Attila' : h < 17 ? 'Good afternoon, Attila' : 'Good evening, Attila';
  document.getElementById('dateLine').textContent =
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── UTILS ─────────────────────────────────────
function strip(h) { const d = document.createElement('div'); d.innerHTML = h; return d.textContent || ''; }
function countWords(t) { return strip(t).split(/\s+/).filter(Boolean).length; }
function readMin(t) { return Math.max(1, Math.ceil(countWords(t) / WPM)); }
function ago(s) {
  const m = Math.floor((Date.now() - new Date(s)) / 60000), hh = Math.floor(m / 60);
  return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : hh < 24 ? hh + 'h ago' : Math.floor(hh / 24) + 'd ago';
}
function src(a) {
  try { return (a.author || new URL(a.link || 'http://x').hostname.replace('www.', '')).slice(0, 25); }
  catch { return 'News'; }
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getScore(title, desc) {
  const t = (title + ' ' + (desc || '')).toLowerCase();
  if (/breaking|crash|collaps|attack|hack|breach|war|recall|fraud|lawsuit|shutdown|crisis|threat|ban|emergency|dead|kill/i.test(t)) return 9;
  if (/major|historic|milestone|record.break|critical|significant|massive|urgent/i.test(t)) return 8;
  if (/launch|acqui|ipo|breakthrough|open.source|raises.*billion|new.*model/i.test(t)) return 7;
  if (/announc|introduc|reveal|partner|study|research|report|unveil/i.test(t)) return 6;
  if (/update|new |beats|expands|cuts|rises|drops|shows|finds/i.test(t)) return 5;
  if (/plan|consider|might|could|expect|explore/i.test(t)) return 4;
  return 3;
}

function scoreColor(n) {
  if (n >= 8) return { color: '#ff453a', bg: 'rgba(255,69,58,0.15)' };
  if (n >= 6) return { color: '#ff9f0a', bg: 'rgba(255,159,10,0.15)' };
  return { color: '#30d158', bg: 'rgba(48,209,88,0.15)' };
}

function getSummary(desc) {
  const text = strip(desc);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).length > 4)
    .slice(0, 3)
    .join(' ');
}

// ── NEWS ──────────────────────────────────────
async function fetchFeed(url) {
  try {
    const r = await fetch(R2J + encodeURIComponent(url), { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const d = await r.json();
    return d.status === 'ok' ? d.items : [];
  } catch { return []; }
}

function showSkeleton() {
  document.getElementById('briefContent').innerHTML = [1, 2, 3].map(() => `
    <div class="skel skel-card"></div>
    <div class="skel skel-card" style="height:140px;margin-top:10px"></div>
  `).join('');
}

async function loadAll() {
  showSkeleton();
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spin');
  let anyErr = false;

  await Promise.all(Object.entries(TOPICS).map(async ([topic, cfg]) => {
    const fetches = await Promise.allSettled(cfg.feeds.map(u => fetchFeed(u)));
    let items = [];
    fetches.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    if (!items.length) { anyErr = true; }

    const seen = new Set();
    items = items.filter(a => { if (seen.has(a.title)) return false; seen.add(a.title); return true; });
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    let chosen = [], totalWords = 0;
    const targetWords = TARGET_MIN * WPM;
    const maxWords = TARGET_MAX * WPM;

    for (const art of items) {
      const w = countWords(art.description || art.title || '');
      if (totalWords + w > maxWords && chosen.length >= 3) break;
      chosen.push(art);
      totalWords += w;
      if (totalWords >= targetWords && chosen.length >= 4) break;
    }

    if (chosen.length < 3) chosen = items.slice(0, 3);
    if (chosen.length > 6) chosen = chosen.slice(0, 6);

    // Sort by importance score descending
    chosen.sort((a, b) => getScore(b.title, b.description || '') - getScore(a.title, a.description || ''));

    data[topic] = chosen;
  }));

  btn.classList.remove('spin');
  document.getElementById('errNote').style.display = anyErr ? 'block' : 'none';
  updateSummaryBar();
  renderBrief();
  generateNewsSummary();
}

function updateSummaryBar() {
  let totalWords = 0, totalArticles = 0;
  Object.values(data).forEach(arts => {
    arts.forEach(a => { totalWords += countWords(a.description || a.title); });
    totalArticles += arts.length;
  });
  const mins = Math.ceil(totalWords / WPM);
  document.getElementById('totalMins').textContent = '~' + mins;
  document.getElementById('briefSub').textContent = totalArticles + ' stories across 4 topics';
}

function refreshAll() {
  data = {};
  loadAll();
}

function filter(t, btn) {
  activeFilter = t;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderBrief();
}


function renderBrief() {
  const topics = activeFilter === 'all' ? Object.keys(TOPICS) : [activeFilter];
  let html = '';

  topics.forEach((topic, tIdx) => {
    const cfg = TOPICS[topic];
    const arts = data[topic] || [];
    if (!arts.length) return;

    if (tIdx > 0) html += '<div class="divider"></div>';

    const topicWords = arts.reduce((s, a) => s + countWords(a.description || a.title), 0);
    const topicMins = Math.ceil(topicWords / WPM);

    html += `<div class="topic-header">
      <div class="topic-header-left">
        <div class="topic-dot" style="background:${cfg.color}"></div>
        <span class="topic-name" style="color:${cfg.color}">${topic}</span>
      </div>
      <span class="topic-meta">${arts.length} stories · ~${topicMins} min</span>
    </div>`;

    // Category overview block
    const overviewItems = arts.map(a => {
      const score = getScore(a.title || '', a.description || '');
      const sc = scoreColor(score);
      const firstSentence = (strip(a.description || '').match(/[^.!?]+[.!?]+/) || [''])[0].trim();
      const line = firstSentence.split(/\s+/).length > 4 ? firstSentence : strip(a.title || '');
      return `<div class="cat-overview-item">
        <span class="cat-overview-score" style="color:${sc.color}">${score}</span>
        <span class="cat-overview-text">${esc(line)}</span>
      </div>`;
    }).join('');
    html += `<div class="cat-overview">
      <div class="cat-overview-title">Today at a glance</div>
      ${overviewItems}
    </div>`;

    arts.forEach(a => {
      const score = getScore(a.title || '', a.description || '');
      const sc = scoreColor(score);
      const summary = getSummary(a.description || '');

      html += `<div class="article-card">
        <div class="article-card-top">
          <div class="score-badge" style="background:${sc.bg};color:${sc.color}">${score}</div>
          <span class="article-source">${esc(src(a))}</span>
        </div>
        <div class="article-title">${esc(a.title || '')}</div>
        ${summary ? `<div class="article-summary">${esc(summary)}</div>` : ''}
        <div class="article-footer">
          <span class="article-ago">${ago(a.pubDate)}</span>
          <a class="article-read-link" href="${esc(a.link || '#')}" target="_blank" rel="noopener">Read full article →</a>
        </div>
      </div>`;
    });
  });

  if (!html) {
    html = `<div class="empty"><p>Couldn't load stories.<br>Check your connection and tap refresh.</p></div>`;
  }

  document.getElementById('briefContent').innerHTML = html;
}

// ── DAILY ─────────────────────────────────────
const DAILY_LS = 'atd_daily_v1';
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getDailyData() { try { return JSON.parse(localStorage.getItem(DAILY_LS) || '{}'); } catch { return {}; } }
function setDailyData(d) { localStorage.setItem(DAILY_LS, JSON.stringify(d)); }
function getTodayData() { const d = getDailyData(); return d[todayKey()] || {}; }
function setTodayData(patch) { const d = getDailyData(); d[todayKey()] = { ...getTodayData(), ...patch }; setDailyData(d); }
function dayOfYear() { const n = new Date(), s = new Date(n.getFullYear(),0,1); return Math.floor((n-s)/86400000); }




async function loadDaily() {
  fetchQuote();
  renderHolidays();
  renderHistory();
  renderWords();
  renderFacts();
  renderKnowledge();
  loadBook();
  loadMovie();
  loadGratitude();
  loadJoke();
}

async function renderHolidays() {
  const now = new Date();
  const todayStr = todayKey();
  const el = document.getElementById('holidayCard');

  const td = getTodayData();
  if (td.holidays) { renderHolidayHTML(el, td.holidays); return; }

  let official = [];
  try {
    const cc = localStorage.getItem('atd_country') || 'HU';
    const countries = [...new Set([cc, 'US', 'HU'])];
    const results = await Promise.all(
      countries.map(c =>
        fetch(`https://date.nager.at/api/v3/PublicHoliday/${now.getFullYear()}/${c}`)
          .then(r => r.json()).catch(() => [])
      )
    );
    const seen = new Set();
    results.flat()
      .filter(h => h.date === todayStr)
      .forEach(h => {
        if (!seen.has(h.name)) { seen.add(h.name); official.push({ name: h.name, type: 'Public holiday', fun: false }); }
      });
  } catch {}

  let fun = [];
  try {
    const m = String(now.getMonth()+1).padStart(2,'0');
    const dy = String(now.getDate()).padStart(2,'0');
    const r = await fetch(`https://www.checkiday.com/api/3/?d=${m}/${dy}/${now.getFullYear()}`, { signal: AbortSignal.timeout(6000) });
    const cdata = await r.json();
    if (cdata.holidays && cdata.holidays.length) {
      fun = cdata.holidays.slice(0, 3).map(h => ({ name: h.name, type: 'Special day', fun: true }));
    }
  } catch {}

  const all = [...official, ...fun].slice(0, 5);
  setTodayData({ holidays: all });
  renderHolidayHTML(el, all);
}

function renderHolidayHTML(el, all) {
  if (!all.length) {
    el.innerHTML = `<div class="card-title">Today's Days</div><div class="no-holidays">No special days today — make your own.</div>`;
    return;
  }
  el.innerHTML = `<div class="card-title">Today's Days</div>` +
    all.map(h => `<div class="holiday-item">
      <div class="holiday-dot ${h.fun ? 'fun' : ''}"></div>
      <div><div class="holiday-name">${esc(h.name)}</div><div class="holiday-type">${h.type}</div></div>
    </div>`).join('');
}

const DEU_WORDS_MINI = [
  {w:'Torschlusspanik',    d:'Gate-closing panic; the fear that life\'s opportunities are passing you by.',      e:'"At 35, she felt a creeping Torschlusspanik about changing careers."'},
  {w:'Fernweh',            d:'Longing for distant places; the opposite of homesickness.',                        e:'"After months at home, his Fernweh became unbearable and he booked a flight."'},
  {w:'Waldeinsamkeit',     d:'The peaceful solitude and connection with nature felt deep in a forest.',          e:'"She found the Waldeinsamkeit of the Black Forest deeply healing."'},
  {w:'Gemütlichkeit',      d:'A warm, cosy, convivial feeling of comfort and belonging.',                        e:'"The small alpine hut had an irresistible Gemütlichkeit about it."'},
  {w:'Kopfkino',           d:'Head cinema; the vivid mental film that plays out in your imagination.',           e:'"When she didn\'t reply for hours, his Kopfkino went into overdrive."'},
  {w:'Fingerspitzengefühl',d:'Fingertip feeling; an intuitive sensitivity and delicate touch.',                  e:'"Negotiating a peace deal requires extraordinary Fingerspitzengefühl."'},
  {w:'Verschlimmbessern',  d:'To make something worse while trying to improve it.',                              e:'"He tried to fix his original mistake but ended up verschlimmbessern-ing it."'},
  {w:'Weltschmerz',        d:'World-weariness; deep sadness about the imperfection of the world.',              e:'"Reading the news on a bad day can trigger a real Weltschmerz."'},
  {w:'Schnapsidee',        d:'A ridiculous idea that sounds great when you\'re drunk.',                          e:'"Driving to Morocco was a total Schnapsidee, but it turned out wonderfully."'},
  {w:'Ohrwurm',            d:'Earworm; a tune that gets stuck in your head and won\'t leave.',                  e:'"That jingle is such an Ohrwurm — I\'ve been humming it for three days."'},
];

async function fetchDeuWordOfDay() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  // Try today then yesterday (Wiktionary sometimes publishes slightly late)
  for (const offset of [0, -1]) {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    try {
      const url = `https://de.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent('Wiktionary:Wort des Tages/'+ds)}&prop=wikitext&format=json&origin=*`;
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      const data = await r.json();
      if (data.error) continue;

      const wikitext = data.parse?.wikitext?.['*'] || '';

      // Extract named template fields
      const get = key => { const m = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^|}\n]+)`)); return m ? m[1].trim() : null; };

      // Strip wikitext markup: [[link|text]] → text, [[link]] → link, bold/italic
      const clean = s => s ? s.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g,'$1').replace(/'{2,3}/g,'').replace(/<[^>]+>/g,'').trim() : null;

      const word = clean(get('Wort'));
      const def  = clean(get('Bedeutung') || get('Kurzbedeutung') || get('Definition'));
      const ex   = clean(get('Verwendungsbeispiel') || get('Beispiel'));

      if (word && def) return { w: word, d: def, e: ex ? `"${ex}"` : null };
    } catch {}
  }
  throw new Error('Wiktionary WOTD unavailable');
}

async function renderWords() {
  const el = document.getElementById('wordsCard');
  el.innerHTML = `<div class="card-title">Words of the day</div><div style="font-size:13px;color:var(--text3)">Loading…</div>`;

  const td = getTodayData();

  // German — fetch from Wiktionary, cache daily, fallback to local list
  let deu = td.deuWord || null;
  if (!deu) {
    try {
      deu = await fetchDeuWordOfDay();
      setTodayData({ deuWord: deu });
    } catch {
      deu = DEU_WORDS_MINI[dayOfYear() % DEU_WORDS_MINI.length];
    }
  }

  let engWord = td.engWord || null;
  if (!engWord) {
    try {
      const mwUrl = 'https://www.merriam-webster.com/wotd/feed/rss2';
      const r = await fetch(R2J + encodeURIComponent(mwUrl), { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d.status === 'ok' && d.items && d.items[0]) {
        const item = d.items[0];
        const w = strip(item.title || '').trim();
        const rawDesc = strip(item.description || item.content || '');
        const sents = rawDesc.match(/[^.!?]+[.!?]+/g) || [];
        const def = sents.filter(s => s.split(/\s+/).length > 3).slice(0, 2).join(' ').trim() || rawDesc.slice(0, 150);
        if (w && def) { engWord = { w, d: def, e: null }; setTodayData({ engWord }); }
      }
    } catch {}
  }
  if (!engWord) engWord = { w: 'Serendipity', d: 'Finding something good without looking for it.', e: '"Meeting his co-founder at that random conference was pure serendipity."' };

  el.innerHTML = `<div class="card-title">Words of the day</div>` +
    [
      { lang: 'English', color: '#0A84FF', word: engWord, key: 'usedEng' },
      { lang: 'German',  color: '#bf5af2', word: deu,     key: 'usedDeu' }
    ].map(item => {
      const used = !!td[item.key];
      return `<div class="word-item">
        <div class="word-body">
          <div class="word-lang" style="color:${item.color}">${item.lang}</div>
          <div class="word-word">${esc(item.word.w)}</div>
          <div class="word-def">${esc(item.word.d)}</div>
          ${item.word.e ? `<div class="word-example">${esc(item.word.e)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center">
          <button class="word-tick ${used?'used':''}" onclick="toggleWord('${item.key}')">${used?'✓':''}</button>
          <div class="word-tick-label">${used?'Used!':'Used?'}</div>
        </div>
      </div>`;
    }).join('');
}

function toggleWord(key) {
  const td = getTodayData();
  setTodayData({ [key]: !td[key] });
  renderWords();
}

async function renderFacts() {
  const el = document.getElementById('factsCard');
  el.innerHTML = `<div class="card-title">Did you know?</div><div style="font-size:13px;color:var(--text3)">Loading…</div>`;

  const td = getTodayData();
  if (td.facts && td.facts.length >= 3) {
    el.innerHTML = `<div class="card-title">Did you know?</div>` +
      td.facts.map((f, i) => `<div class="fact-item"><div class="fact-num">${i+1}</div><div class="fact-text">${esc(f)}</div></div>`).join('');
    return;
  }

  try {
    const results = await Promise.allSettled(
      Array.from({length: 5}, () =>
        fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { signal: AbortSignal.timeout(6000) })
          .then(r => r.json()).then(d => d.text)
      )
    );
    const facts = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    if (facts.length >= 3) {
      setTodayData({ facts });
      el.innerHTML = `<div class="card-title">Did you know?</div>` +
        facts.map((f, i) => `<div class="fact-item"><div class="fact-num">${i+1}</div><div class="fact-text">${esc(f)}</div></div>`).join('');
      return;
    }
  } catch {}

  el.innerHTML = `<div class="card-title">Did you know?</div><div style="font-size:13px;color:var(--text3)">Could not load facts — check your connection.</div>`;
}

async function renderHistory() {
  const el = document.getElementById('historyCard');
  el.innerHTML = `<div class="card-title">This Day in History</div><div class="history-text" style="color:var(--text3)">Loading…</div>`;

  const td = getTodayData();
  if (td.historyEvent) {
    el.innerHTML = `<div class="card-title">This Day in History</div>
      <div class="history-year">${esc(String(td.historyEvent.year))}</div>
      <div class="history-text">${esc(td.historyEvent.text)}</div>`;
    return;
  }

  try {
    const now = new Date();
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${now.getMonth()+1}/${now.getDate()}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json();
    const events = (d.events || []).filter(e => e.year && e.text);
    if (events.length) {
      const evt = events[Math.floor(Math.random() * Math.min(events.length, 10))];
      const historyEvent = { year: String(evt.year), text: evt.text };
      setTodayData({ historyEvent });
      el.innerHTML = `<div class="card-title">This Day in History</div>
        <div class="history-year">${esc(historyEvent.year)}</div>
        <div class="history-text">${esc(historyEvent.text)}</div>`;
      return;
    }
  } catch {}

  el.innerHTML = `<div class="card-title">This Day in History</div><div class="history-text" style="color:var(--text3)">Could not load history — check your connection.</div>`;
}

async function renderKnowledge() {
  const el = document.getElementById('knowledgeCard');
  el.innerHTML = `<div class="card-title">Worth Knowing</div><div style="font-size:13px;color:var(--text3)">Loading…</div>`;

  const td = getTodayData();
  if (td.knowledge && td.knowledge.length >= 2) {
    el.innerHTML = `<div class="card-title">Worth Knowing</div>` +
      td.knowledge.map((k, i) => `<div class="knowledge-item">
        <div class="fact-num">${i+1}</div>
        <div class="fact-text">${esc(k)}</div>
      </div>`).join('');
    return;
  }

  try {
    const results = await Promise.allSettled([
      fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', { signal: AbortSignal.timeout(6000) }).then(r => r.json()),
      fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary', { signal: AbortSignal.timeout(6000) }).then(r => r.json()),
    ]);
    const items = results
      .filter(r => r.status === 'fulfilled' && r.value && r.value.extract)
      .map(r => {
        const p = r.value;
        const sentence = (p.extract.match(/[^.!?]+[.!?]+/) || [p.extract])[0].trim();
        return `${p.title}: ${sentence}`;
      });
    if (items.length >= 1) {
      while (items.length < 2) items.push(items[0]);
      setTodayData({ knowledge: items });
      el.innerHTML = `<div class="card-title">Worth Knowing</div>` +
        items.map((k, i) => `<div class="knowledge-item">
          <div class="fact-num">${i+1}</div>
          <div class="fact-text">${esc(k)}</div>
        </div>`).join('');
      return;
    }
  } catch {}

  el.innerHTML = `<div class="card-title">Worth Knowing</div><div style="font-size:13px;color:var(--text3)">Could not load content — check your connection.</div>`;
}

function loadGratitude() {
  const td = getTodayData();
  const area = document.getElementById('gratitudeArea');
  area.value = td.gratitude || '';
  let saveTimer;
  area.addEventListener('input', () => {
    clearTimeout(saveTimer);
    document.getElementById('gratitudeSaved').textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      setTodayData({ gratitude: area.value });
      document.getElementById('gratitudeSaved').textContent = 'Saved';
    }, 800);
  });
  if (td.gratitude) document.getElementById('gratitudeSaved').textContent = 'Saved';
}

// ── MORNING BRIEF / GEMINI API ────────────────
const AI_PROXY_URL = '/api/ai';

async function callGemini(prompt, maxTokens) {
  const res = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, maxTokens: maxTokens || 300 }),
    signal: AbortSignal.timeout(20000)
  });
  const raw = await res.text();
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error(`AI route returned ${res.status}. Open the Vercel URL, not GitHub Pages or the static Python server.`);
  }
  if (!res.ok || d.error) throw new Error(d.error || 'Gemini API error');
  if (!d.text) throw new Error('Empty response from Gemini');
  return d.text;
}

function initMorningBrief() {
  generateMorningBrief();
}

function renderBriefText(text) {
  const container = document.getElementById('morningBriefContent');
  if (!container) return;
  container.innerHTML = `
    <div class="brief-output">${text.split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <button class="brief-generate-btn" onclick="generateMorningBrief(true)" style="margin-top:10px;width:100%">↻ Refresh</button>`;
}

async function generateMorningBrief(force) {
  const container = document.getElementById('morningBriefContent');

  if (!force) {
    const cached = getTodayData().morningBrief;
    if (cached) { renderBriefText(cached); return; }
  }

  if (container) container.innerHTML = `<div style="font-size:13px;color:var(--text3)">Generating your brief…</div>`;
  const context = buildBriefContext();
  try {
    const text = await callGemini(
      `Write a concise 3-sentence morning brief for Attila. Mention what matters today based on this context. Be warm and direct.\n\n${context}`,
      600
    );
    setTodayData({ morningBrief: text });
    renderBriefText(text);
  } catch (e) {
    if (container) container.innerHTML = `
      <div style="font-size:13px;color:var(--red);line-height:1.45">Could not generate brief.<br>${esc(e.message || 'Unknown AI error')}</div>
      <button class="brief-generate-btn" onclick="generateMorningBrief(true)" style="margin-top:8px;width:100%">↻ Try again</button>`;
  }
}

function buildBriefContext() {
  const parts = [];
  const now = new Date();
  parts.push(`Date: ${now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}`);
  const tasks = getTasks().filter(t => !t.done);
  if (tasks.length) parts.push(`Open tasks: ${tasks.slice(0,5).map(t => t.text).join('; ')}`);
  else parts.push('No open tasks.');
  const finCache = getFinCache();
  if (finCache && finCache.quotes) {
    const sp = finCache.quotes['^GSPC'], btc = finCache.quotes['BTC-USD'];
    const mkt = [];
    if (sp) mkt.push(`S&P 500 ${sp.price.toFixed(0)} (${sp.changePct>=0?'+':''}${sp.changePct.toFixed(2)}%)`);
    if (btc) mkt.push(`BTC $${btc.price.toFixed(0)} (${btc.changePct>=0?'+':''}${btc.changePct.toFixed(2)}%)`);
    if (mkt.length) parts.push(`Markets: ${mkt.join(', ')}`);
  }
  return parts.join('\n');
}

// ── NEWS SUMMARY ──────────────────────────────
async function generateNewsSummary() {
  const el = document.getElementById('newsSummaryContent');
  if (!el) return;

  // Use cached summary if from today
  const cached = getTodayData().newsSummary;
  if (cached) { renderNewsSummary(cached); return; }

  // Wait until articles are loaded
  const allArticles = Object.values(data).flat();
  if (!allArticles.length) { el.innerHTML = '<div class="news-summary-loading">Loading articles…</div>'; return; }

  el.innerHTML = '<div class="news-summary-loading">Summarising with AI…</div>';

  const headlines = allArticles.slice(0, 12).map(a => `- ${strip(a.title)}`).join('\n');
  const prompt = `Here are today's top news headlines:\n${headlines}\n\nWrite exactly 3 bullet points summarising the most important themes across these stories. Each bullet should be one sentence, direct and informative. No intro, no outro — just the 3 bullets starting with "•".`;

  try {
    const text = await callGemini(prompt, 600);
    if (text) {
      setTodayData({ newsSummary: text });
      renderNewsSummary(text);
    }
  } catch (e) {
    el.innerHTML = `<div class="news-summary-loading" style="color:var(--red)">Could not summarise — ${esc(e.message || 'try refreshing')}.</div>`;
  }
}

function renderNewsSummary(text) {
  const el = document.getElementById('newsSummaryContent');
  if (!el) return;
  const bullets = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('•') || l.startsWith('-')).map(l => l.replace(/^[•\-]\s*/, ''));
  if (!bullets.length) { el.innerHTML = `<div class="news-summary-loading">${esc(text)}</div>`; return; }
  el.innerHTML = `<ul class="news-summary-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`;
}

// ── BOOK OF THE DAY ───────────────────────────
async function loadBook() {
  const el = document.getElementById('bookCard');
  if (!el) return;
  const cached = getTodayData().bookOfDay;
  if (cached) { renderBook(el, cached); return; }
  try {
    // Open Library trending books — free, no key
    const res = await fetch('https://openlibrary.org/trending/daily.json?limit=20', { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const works = json.works || [];
    if (!works.length) throw new Error('no works');
    // Pick one based on day of year for consistency
    const pick = works[dayOfYear() % works.length];
    const key = pick.key; // e.g. /works/OL123W
    // Fetch full work details
    const detail = await fetch(`https://openlibrary.org${key}.json`, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    const title = detail.title || pick.title || 'Unknown';
    const author = (pick.author_name || [])[0] || 'Unknown author';
    const desc = typeof detail.description === 'string' ? detail.description : detail.description?.value || '';
    const coverId = pick.cover_i || (detail.covers || [])[0];
    const cover = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
    const year = pick.first_publish_year || '';
    const book = { title, author, desc: desc.slice(0, 220) + (desc.length > 220 ? '…' : ''), cover, year };
    setTodayData({ bookOfDay: book });
    renderBook(el, book);
  } catch {
    el.innerHTML = `<div class="card-title">Book of the day</div><div style="font-size:13px;color:var(--text3)">Could not load — try again later.</div>`;
  }
}

function renderBook(el, b) {
  el.innerHTML = `<div class="card-title">Book of the day</div>
    <div class="rec-row">
      ${b.cover ? `<img class="rec-cover" src="${esc(b.cover)}" alt="">` : `<div class="rec-cover"></div>`}
      <div class="rec-body">
        <div class="rec-title">${esc(b.title)}</div>
        <div class="rec-meta">${esc(b.author)}${b.year ? ' · ' + b.year : ''}</div>
        ${b.desc ? `<div class="rec-desc">${esc(b.desc)}</div>` : ''}
      </div>
    </div>`;
}

// ── MOVIE OF THE DAY ──────────────────────────
const TMDB_LS = 'atd_tmdb_key';
function getTmdbKey() { return localStorage.getItem(TMDB_LS) || ''; }

async function loadMovie() {
  const el = document.getElementById('movieCard');
  if (!el) return;
  const cached = getTodayData().movieOfDay;
  if (cached) { renderMovie(el, cached); return; }
  const key = getTmdbKey();
  if (!key) { renderMovieSetup(el); return; }
  try {
    const res = await fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${encodeURIComponent(key)}&language=en-US`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.status_code === 7) { renderMovieSetup(el); return; } // invalid key
    const results = json.results || [];
    if (!results.length) throw new Error('no results');
    const pick = results[dayOfYear() % Math.min(results.length, 10)];
    const movie = {
      title: pick.title,
      year: pick.release_date?.slice(0, 4) || '',
      desc: (pick.overview || '').slice(0, 220) + ((pick.overview || '').length > 220 ? '…' : ''),
      rating: pick.vote_average?.toFixed(1),
      cover: pick.poster_path ? `https://image.tmdb.org/t/p/w154${pick.poster_path}` : null,
    };
    setTodayData({ movieOfDay: movie });
    renderMovie(el, movie);
  } catch {
    el.innerHTML = `<div class="card-title">Movie of the day</div><div style="font-size:13px;color:var(--text3)">Could not load — check your TMDB key.</div>`;
  }
}

function renderMovie(el, m) {
  el.innerHTML = `<div class="card-title">Movie of the day</div>
    <div class="rec-row">
      ${m.cover ? `<img class="rec-cover" src="${esc(m.cover)}" alt="">` : `<div class="rec-cover"></div>`}
      <div class="rec-body">
        <div class="rec-title">${esc(m.title)}</div>
        <div class="rec-meta">${m.year}</div>
        ${m.desc ? `<div class="rec-desc">${esc(m.desc)}</div>` : ''}
        ${m.rating ? `<div class="rec-rating">★ ${m.rating}</div>` : ''}
      </div>
    </div>`;
}

function renderMovieSetup(el) {
  el.innerHTML = `<div class="card-title">Movie of the day</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:10px">Get a free API key at <strong>themoviedb.org</strong> → Settings → API.</p>
    <div style="display:flex;gap:8px">
      <input style="flex:1;background:var(--bg3);border:0.5px solid var(--border);border-radius:10px;padding:9px 12px;color:var(--text);font-size:13px" id="tmdbKeyInp" type="password" placeholder="Paste TMDB API key…">
      <button style="background:var(--accent);border:none;border-radius:10px;padding:9px 14px;color:#fff;font-size:13px;font-weight:700;cursor:pointer" onclick="saveTmdbKey()">Save</button>
    </div>`;
}

function saveTmdbKey() {
  const v = document.getElementById('tmdbKeyInp')?.value.trim();
  if (!v) return;
  localStorage.setItem(TMDB_LS, v);
  loadMovie();
}

// ── CLUB EVENTS ───────────────────────────────
const CLUBS = [
  { id: 'icuzh',  name: 'IC UZH',  color: '#0A84FF', url: 'https://www.icuzh.ch/events' },
  { id: 'fvoec',  name: 'FVOEC',   color: '#30d158', url: 'https://fvoec.ch/events' },
  { id: 'uzhack', name: 'UZHack',  color: '#bf5af2', url: 'https://uzhack.com/schedule' },
];
const EVENTS_LS = 'atd_club_events_v1';
const EVENTS_TTL = 4 * 60 * 60 * 1000;

async function loadClubEvents() {
  const el = document.getElementById('clubEventsContent');
  let staleEvents = null;
  try {
    const cached = JSON.parse(localStorage.getItem(EVENTS_LS) || '{}');
    if (cached.ts && Date.now() - cached.ts < EVENTS_TTL && cached.events) {
      renderClubEvents(el, cached.events); return;
    }
    if (cached.events) staleEvents = cached.events;
  } catch {}
  let events = {};
  try {
    const d = await fetch('/api/events', { signal: AbortSignal.timeout(10000) }).then(r => {
      if (!r.ok) throw new Error('Events request failed');
      return r.json();
    });
    events = d.events || {};
    localStorage.setItem(EVENTS_LS, JSON.stringify({ ts: Date.now(), events }));
  } catch {
    events = staleEvents || {};
  }
  renderClubEvents(el, events);
}

function renderClubEvents(el, events) {
  let cacheAge = '';
  try {
    const ec = JSON.parse(localStorage.getItem(EVENTS_LS) || '{}');
    if (ec.ts) { const a = Math.round((Date.now()-ec.ts)/60000); cacheAge = a<1?'Just now':a<60?`${a}m ago`:`${Math.floor(a/60)}h ago`; }
  } catch {}
  el.innerHTML = CLUBS.map(club => {
    const e = events[club.id];
    if (e) {
      const d = new Date(e.start);
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const location = typeof e.location === 'string' ? e.location : (e.location?.address || e.location?.onlineUrl || '');
      const url = e.url || club.url;
      return `<div class="club-event-item">
        <div class="club-event-dot" style="background:${club.color}"></div>
        <div class="club-event-body">
          <div class="club-event-club" style="color:${club.color}">${club.name}</div>
          <div class="club-event-date">${dateStr} · ${timeStr}${location ? ' · ' + esc(location) : ''}</div>
          <a class="club-event-title" href="${esc(url)}" target="_blank" rel="noopener">${esc(e.title)}</a>
        </div>
      </div>`;
    }
    return `<div class="club-event-item">
      <div class="club-event-dot" style="background:${club.color};opacity:0.35"></div>
      <div class="club-event-body">
        <div class="club-event-club" style="color:${club.color}">${club.name}</div>
        <a class="club-event-visit" href="${esc(club.url)}" target="_blank" rel="noopener">View schedule →</a>
      </div>
    </div>`;
  }).join('') + (cacheAge ? `<div class="freshness">Updated ${cacheAge}</div>` : '');
}

// ── JOKE ──────────────────────────────────────
async function loadJoke() {
  const el = document.getElementById('jokeContent');
  const td = getTodayData();
  if (td.joke) { renderJoke(el, td.joke); return; }
  try {
    const d = await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode&blacklistFlags=nsfw,racist,sexist', { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    if (d && !d.error) {
      const joke = d.type === 'twopart' ? { setup: d.setup, delivery: d.delivery } : { single: d.joke };
      setTodayData({ joke });
      renderJoke(el, joke);
      return;
    }
  } catch {}
  el.innerHTML = `<div class="joke-single" style="color:var(--text3)">Could not load joke — check your connection.</div>`;
}

function renderJoke(el, joke) {
  if (joke.single) {
    el.innerHTML = `<div class="joke-single">${esc(joke.single)}</div>`;
  } else {
    el.innerHTML = `<div class="joke-setup">${esc(joke.setup)}</div><div class="joke-delivery">${esc(joke.delivery)}</div>`;
  }
}

// ── SPOTIFY ───────────────────────────────────
const SP_LS = {
  clientId:    'spotify_client_id',
  accessToken: 'spotify_access_token',
  refreshToken:'spotify_refresh_token',
  expiresAt:   'spotify_expires_at',
  verifier:    'spotify_pkce_verifier',
};

function spGet(k) { return localStorage.getItem(SP_LS[k]) || ''; }
function spSet(k, v) { localStorage.setItem(SP_LS[k], v); }

function generateSpVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function generateSpChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function connectSpotify() {
  const clientId = document.getElementById('spClientIdInp').value.trim();
  if (!clientId) return;
  spSet('clientId', clientId);
  const verifier = generateSpVerifier();
  spSet('verifier', verifier);
  const challenge = await generateSpChallenge(verifier);
  const redirectUri = window.location.href.split('?')[0].split('#')[0];
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'user-read-currently-playing user-read-recently-played user-modify-playback-state',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.href = 'https://accounts.spotify.com/authorize?' + params;
}

async function handleSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const clientId = spGet('clientId');
  if (!code || !clientId) return;
  window.history.replaceState({}, document.title, window.location.pathname);
  const verifier = spGet('verifier');
  const redirectUri = window.location.href.split('?')[0].split('#')[0];
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }),
    });
    const d = await r.json();
    if (d.access_token) {
      spSet('accessToken', d.access_token);
      spSet('refreshToken', d.refresh_token || '');
      spSet('expiresAt', String(Date.now() + d.expires_in * 1000));
    }
  } catch {}
}

async function getSpToken() {
  const expiresAt = parseInt(spGet('expiresAt') || '0');
  if (spGet('accessToken') && Date.now() < expiresAt - 60000) return spGet('accessToken');
  const clientId = spGet('clientId');
  const refreshToken = spGet('refreshToken');
  if (!clientId || !refreshToken) return null;
  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
    });
    const d = await r.json();
    if (d.access_token) {
      spSet('accessToken', d.access_token);
      spSet('expiresAt', String(Date.now() + d.expires_in * 1000));
      if (d.refresh_token) spSet('refreshToken', d.refresh_token);
      return d.access_token;
    }
  } catch {}
  return null;
}

function disconnectSpotify() {
  ['clientId','accessToken','refreshToken','expiresAt','verifier'].forEach(k => localStorage.removeItem(SP_LS[k]));
  loadSpotify();
}

async function loadSpotify() {
  const el = document.getElementById('spotifyContent');
  if (!spGet('clientId')) { renderSpConnect(el); return; }
  el.innerHTML = `<div style="font-size:13px;color:var(--text3)">Loading…</div>`;
  const token = await getSpToken();
  if (!token) { renderSpConnect(el); return; }
  try {
    // Try currently playing first
    const r1 = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000)
    });
    if (r1.status === 200) {
      const d = await r1.json();
      if (d && d.item) { renderSpTrack(el, d.item, d.is_playing, d.progress_ms, d.item.duration_ms); return; }
    }
    // Fall back to recently played
    const r2 = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000)
    });
    if (r2.ok) {
      const d = await r2.json();
      if (d.items && d.items[0]) { renderSpTrack(el, d.items[0].track, false, 0, 0); return; }
    }
  } catch {}
  el.innerHTML = `<div style="font-size:13px;color:var(--text3)">Nothing playing right now.</div><button class="sp-disconnect" onclick="disconnectSpotify()">Disconnect Spotify</button>`;
}

function renderSpTrack(el, track, isPlaying, progress, duration) {
  const art = (track.album.images[1] || track.album.images[0] || {}).url || '';
  const artists = track.artists.map(a => a.name).join(', ');
  const pct = duration ? Math.round((progress / duration) * 100) : 0;
  const playPauseIcon = isPlaying
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`;
  const prevIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,20 9,12 19,4"/><rect x="5" y="4" width="3" height="16"/></svg>`;
  const nextIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="16" y="4" width="3" height="16"/></svg>`;
  el.innerHTML = `<div class="sp-now">
    ${art ? `<img class="sp-art" src="${esc(art)}" alt="">` : `<div class="sp-art"></div>`}
    <div class="sp-info">
      <div class="sp-status">${isPlaying ? '▶ Now playing' : 'Last played'}</div>
      <div class="sp-track">${esc(track.name)}</div>
      <div class="sp-artist">${esc(artists)}</div>
      ${duration ? `<div class="sp-progress"><div class="sp-progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
  </div>
  ${isPlaying ? `<div class="sp-controls">
    <button class="sp-ctrl-btn" onclick="spControl('previous')" title="Previous">${prevIcon}</button>
    <button class="sp-ctrl-btn play" onclick="spControl('pause')" title="Pause">${playPauseIcon}</button>
    <button class="sp-ctrl-btn" onclick="spControl('next')" title="Next">${nextIcon}</button>
  </div>` : ''}
  <button class="sp-disconnect" onclick="disconnectSpotify()">Disconnect</button>`;
}

async function spControl(action) {
  const token = await getSpToken();
  if (!token) return;
  try {
    if (action === 'play' || action === 'pause') {
      await fetch(`https://api.spotify.com/v1/me/player/${action}`, {
        method: 'PUT', headers: { Authorization: 'Bearer ' + token }
      });
    } else if (action === 'next' || action === 'previous') {
      await fetch(`https://api.spotify.com/v1/me/player/${action}`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }
      });
    }
    // Refresh after short delay to show updated state
    setTimeout(loadSpotify, 800);
  } catch {}
}

function renderSpConnect(el) {
  el.innerHTML = `<div class="sp-connect">
    <p style="font-size:13px;color:var(--text2);margin-bottom:10px">Connect Spotify to see what you're playing.</p>
    <input class="sp-inp" id="spClientIdInp" type="text" placeholder="Paste your Spotify Client ID…">
    <button class="sp-btn" onclick="connectSpotify()">Connect Spotify</button>
    <div style="font-size:11px;color:var(--text3);margin-top:8px">Get a free Client ID at <strong>developer.spotify.com</strong> → Create app</div>
  </div>`;
}

// ── HOME ──────────────────────────────────────
function wmoCondition(c) {
  if (c === 0) return 'Clear sky';
  if (c <= 2)  return 'Mostly clear';
  if (c === 3) return 'Overcast';
  if (c <= 48) return 'Foggy';
  if (c <= 55) return 'Drizzle';
  if (c <= 67) return 'Rain';
  if (c <= 77) return 'Snow';
  if (c <= 82) return 'Showers';
  if (c <= 86) return 'Snow showers';
  return 'Thunderstorm';
}

function weatherSVG(c, size) {
  const s = size || 56;
  if (c === 0) return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22.5" y2="12"/><line x1="4.6" y1="4.6" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.4" y2="19.4"/><line x1="19.4" y1="4.6" x2="17.3" y2="6.7"/><line x1="6.7" y1="17.3" x2="4.6" y2="19.4"/></svg>`;
  if (c <= 2)  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="13" r="4" stroke="#FFD60A"/><path d="M9 9a4 4 0 0 1 7.9 1c2.2.3 3.1 2.7 1.5 4.3" stroke="#aaa"/><path d="M6 17h11" stroke="#aaa"/></svg>`;
  if (c <= 48) return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="1.8" stroke-linecap="round"><path d="M3 10h2M7 6h2M3 14h2M7 18h2M11 6h2M11 18h2M15 10h2M19 6h2M15 14h2M19 18h2"/></svg>`;
  if (c <= 67 || (c >= 80 && c <= 82)) return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" stroke="#888"/><line x1="8" y1="19" x2="8" y2="21" stroke="#5ac8fa"/><line x1="12" y1="17" x2="12" y2="21" stroke="#5ac8fa"/><line x1="16" y1="19" x2="16" y2="21" stroke="#5ac8fa"/></svg>`;
  if (c <= 77 || (c >= 85 && c <= 86)) return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" stroke="#888"/><circle cx="8" cy="20" r="1" fill="#aef"/><circle cx="12" cy="18" r="1" fill="#aef"/><circle cx="16" cy="20" r="1" fill="#aef"/></svg>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" stroke="#888"/><polyline points="13 11 9 17 15 17 11 23" stroke="#FFD60A"/></svg>`;
}

const homeLoadedCards = new Set();

function isHomeCardVisible(cardId) {
  return !getHiddenCards().includes(cardId);
}

function loadHomeCard(cardId, force) {
  if (!force && homeLoadedCards.has(cardId)) return;
  homeLoadedCards.add(cardId);
  if (cardId === 'clubEventsCard') loadClubEvents();
  if (cardId === 'spotifyCard') loadSpotify();
  if (cardId === 'morningBriefCard') initMorningBrief();
  if (cardId === 'footballCard') loadFootball();
  if (cardId === 'weatherCard') {
    navigator.geolocation.getCurrentPosition(
      p => fetchWeather(p.coords.latitude, p.coords.longitude),
      () => { document.getElementById('weatherCard').innerHTML = `<div class="weather-error">Enable location access to see weather.</div>`; }
    );
  }
}

async function loadHome() {
  applyHomeVisibility();
  ['weatherCard','morningBriefCard','clubEventsCard','spotifyCard','footballCard'].forEach(cardId => {
    if (isHomeCardVisible(cardId)) loadHomeCard(cardId);
  });
}

function loadVisibleHomeCards() {
  ['weatherCard','morningBriefCard','clubEventsCard','spotifyCard','footballCard'].forEach(cardId => {
    if (isHomeCardVisible(cardId)) loadHomeCard(cardId);
  });
}

async function fetchWeather(lat, lon) {
  try {
    const [wx, geo] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`).then(r => r.json()),
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`).then(r => r.json()).catch(() => null)
    ]);
    const c = wx.current, d = wx.daily;
    const code = c.weather_code;
    const city = geo ? (geo.address.city || geo.address.town || geo.address.village || '') : '';
    const country = geo ? (geo.address.country_code || '').toUpperCase() : '';
    if (country) localStorage.setItem('atd_country', country);
    const location = [city, country].filter(Boolean).join(', ');
    document.getElementById('weatherCard').innerHTML = `
      <div class="weather-top">
        <div>
          <div class="weather-temp">${Math.round(c.temperature_2m)}<sup>°C</sup></div>
          <div class="weather-condition">${wmoCondition(code)}</div>
          <div class="weather-location">${esc(location) || 'Your location'}</div>
        </div>
        <div class="weather-icon-wrap">${weatherSVG(code)}</div>
      </div>
      <div class="weather-row">
        <div class="weather-stat"><strong>${Math.round(d.temperature_2m_max[0])}°</strong> / ${Math.round(d.temperature_2m_min[0])}° today</div>
        <div class="weather-stat">Feels <strong>${Math.round(c.apparent_temperature)}°</strong></div>
        <div class="weather-stat">Wind <strong>${Math.round(c.wind_speed_10m)} km/h</strong></div>
        <div class="weather-stat">Humidity <strong>${c.relative_humidity_2m}%</strong></div>
      </div>`;
  } catch {
    document.getElementById('weatherCard').innerHTML = `<div class="weather-error">Could not load weather.</div>`;
  }
}


async function fetchQuote() {
  const td = getTodayData();
  if (td.quote) {
    document.getElementById('quoteCard').innerHTML = `
      <div class="card-title">Quote of the day</div>
      <div class="quote-text">"${esc(td.quote.text)}"</div>
      <div class="quote-author">— ${esc(td.quote.author)}</div>`;
    return;
  }
  try {
    const d = await fetch('https://zenquotes.io/api/today', { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    if (d && d[0] && d[0].q) {
      const quote = { text: d[0].q, author: d[0].a };
      setTodayData({ quote });
      document.getElementById('quoteCard').innerHTML = `
        <div class="card-title">Quote of the day</div>
        <div class="quote-text">"${esc(quote.text)}"</div>
        <div class="quote-author">— ${esc(quote.author)}</div>`;
      return;
    }
  } catch {}
  try {
    const d = await fetch('https://dummyjson.com/quotes/random', { signal: AbortSignal.timeout(6000) }).then(r => r.json());
    if (d && d.quote) {
      const quote = { text: d.quote, author: d.author };
      setTodayData({ quote });
      document.getElementById('quoteCard').innerHTML = `
        <div class="card-title">Quote of the day</div>
        <div class="quote-text">"${esc(quote.text)}"</div>
        <div class="quote-author">— ${esc(quote.author)}</div>`;
      return;
    }
  } catch {}
  document.getElementById('quoteCard').innerHTML = `
    <div class="card-title">Quote of the day</div>
    <div class="quote-text">"The secret of getting ahead is getting started."</div>
    <div class="quote-author">— Mark Twain</div>`;
}


// ── TASKS ─────────────────────────────────────
const LS = 'atd_tasks_v2';
let pendingMeta = {};
let recognition = null;
let isRecording = false;

function getTasks() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } }
function putTasks(t) { localStorage.setItem(LS, JSON.stringify(t)); }

function addTask() {
  const inp = document.getElementById('taskInp'), txt = inp.value.trim();
  if (!txt) return;
  const t = getTasks();
  t.unshift({ id: Date.now(), text: txt, done: false, ...pendingMeta });
  putTasks(t);
  inp.value = '';
  pendingMeta = {};
  document.getElementById('voicePreview').classList.remove('show');
  renderTasks();
}

function toggleTask(id) { const t = getTasks(), x = t.find(t => t.id === id); if (x) x.done = !x.done; putTasks(t); renderTasks(); }
function delTask(id) { putTasks(getTasks().filter(t => t.id !== id)); renderTasks(); }

function renderTasks() {
  const tasks = getTasks(), rem = tasks.filter(t => !t.done).length;
  document.getElementById('taskBadge').textContent = rem === 0 ? 'All done' : rem + ' left';
  const el = document.getElementById('taskList');
  if (!tasks.length) { el.innerHTML = `<div class="empty"><p>No tasks yet.<br>Add something above.</p></div>`; return; }
  el.innerHTML = [...tasks].sort((a, b) => a.done - b.done).map(t => {
    const badges = [];
    if (t.date) badges.push(`<span class="tbadge tbadge-date">${esc(t.date)}</span>`);
    if (t.time) badges.push(`<span class="tbadge tbadge-time">${esc(t.time)}</span>`);
    if (t.priority === 'urgent') badges.push(`<span class="tbadge tbadge-urgent">Urgent</span>`);
    if (t.priority === 'high')   badges.push(`<span class="tbadge tbadge-high">Important</span>`);
    if (t.priority === 'low')    badges.push(`<span class="tbadge tbadge-low">Low priority</span>`);
    return `<div class="task-row ${t.done ? 'done' : ''}">
      <div class="task-check ${t.done ? 'on' : ''}" onclick="toggleTask(${t.id})"></div>
      <div class="task-body">
        <div class="task-txt">${esc(t.text)}</div>
        ${badges.length ? `<div class="task-meta">${badges.join('')}</div>` : ''}
      </div>
      <button class="task-del" onclick="delTask(${t.id})">✕</button>
    </div>`;
  }).join('');
}

// ── HABITS ────────────────────────────────────
const HABIT_LS = 'atd_habits_v1';
const HABIT_STREAK_LS = 'atd_habit_streak_v1';

const HABITS = [
  { id: 'meditation', label: 'Meditation',           emoji: '🧘' },
  { id: 'reading',    label: '15 min of reading',    emoji: '📖' },
  { id: 'moving',     label: '30 min of moving',     emoji: '🏃' },
  { id: 'social',     label: '30 min of social',     emoji: '🤝' },
  { id: 'water',      label: 'Drink enough water',   emoji: '💧' },
  { id: 'journal',    label: '5 min journaling',     emoji: '📝' },
  { id: 'sleep',      label: 'In bed by 10 pm',      emoji: '🌙' },
];

const PLANT_MSGS = [
  "I'm thirsty… please check off a habit!",
  "A little water — I can feel it!",
  "Getting greener — keep it up!",
  "Halfway there, I'm starting to bloom!",
  "Looking good — more than halfway!",
  "Almost there, I can feel the sunshine!",
  "Just one more — you're so close!",
  "I'm thriving! You nailed every habit today! ✨",
];

function lerpColor(c1, c2, t) {
  const h = s => parseInt(s, 16);
  const r1=h(c1.slice(1,3)), g1=h(c1.slice(3,5)), b1=h(c1.slice(5,7));
  const r2=h(c2.slice(1,3)), g2=h(c2.slice(3,5)), b2=h(c2.slice(5,7));
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

function plantSVG(checked) {
  const total = HABITS.length;
  const t = checked / total;
  const stemC = lerpColor('#8B7355', '#2a7a2a', t);
  const leafD  = lerpColor('#7A7A55', '#2d8c2d', t);
  const leafM  = lerpColor('#9B9B6A', '#44bb44', t);
  const leafL  = lerpColor('#BCAC80', '#88EE88', t);

  // Round leaf ball: 3 overlapping circles for organic depth
  function ball(cx, cy, r) {
    const R = v => Math.round(v);
    return `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" fill="${leafD}"/>` +
           `<circle cx="${R(cx-r*.3)}" cy="${R(cy-r*.28)}" r="${R(r*.76)}" fill="${leafM}"/>` +
           `<circle cx="${R(cx+r*.15)}" cy="${R(cy-r*.42)}" r="${R(r*.55)}" fill="${leafL}"/>`;
  }
  function stm(x1,y1,x2,y2,w) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stemC}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  function flw(cx, cy, pr) {
    const pc = lerpColor('#FFB3C6','#FF55AA',t);
    let s = '';
    for (let i=0; i<5; i++) {
      const a = (i*72-90)*Math.PI/180;
      s += `<circle cx="${Math.round(cx+Math.cos(a)*pr*2.2)}" cy="${Math.round(cy+Math.sin(a)*pr*2.2)}" r="${pr}" fill="${pc}"/>`;
    }
    return s + `<circle cx="${cx}" cy="${cy}" r="${Math.round(pr*.95)}" fill="#FFE566"/>`;
  }
  function bud(cx, cy, r) {
    const R = v => Math.round(v);
    return `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" fill="${leafD}"/>` +
           `<circle cx="${R(cx-r*.3)}" cy="${R(cy-r*.28)}" r="${R(r*.76)}" fill="${leafM}"/>` +
           `<ellipse cx="${cx}" cy="${R(cy-r*.7)}" rx="${R(r*.55)}" ry="${R(r*.7)}" fill="#FFB3C8" opacity="0.85"/>`;
  }

  const sx = 60, sb = 118;
  let plant = '';

  if (checked === 0) {
    plant = `<path d="M60,118 Q63,111 60,106 Q57,101 62,98" stroke="${stemC}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
            `<ellipse cx="63" cy="96" rx="5" ry="6" fill="${leafM}" transform="rotate(-15 63 96)"/>`;
  } else if (checked === 1) {
    plant = stm(sx,sb,sx,95,2.5) + ball(sx,88,13);
  } else if (checked === 2) {
    plant = stm(sx,sb,sx,88,3);
    plant += ball(sx-10,92,12) + ball(sx+9,88,12) + ball(sx,81,11);
  } else if (checked === 3) {
    plant = stm(sx,sb,sx,78,3.5);
    plant += ball(sx-16,92,13) + ball(sx+14,88,13);
    plant += ball(sx-6,80,12) + ball(sx+9,77,12) + ball(sx,70,11);
  } else if (checked === 4) {
    plant = stm(sx,sb,sx,66,4);
    plant += ball(sx-20,94,14) + ball(sx+18,89,14);
    plant += ball(sx-12,79,13) + ball(sx+12,77,13);
    plant += ball(sx-4,68,12) + ball(sx+6,64,12);
  } else if (checked === 5) {
    plant = stm(sx,sb,sx,55,4.5);
    plant += ball(sx-24,95,15) + ball(sx+22,90,15);
    plant += ball(sx-16,79,14) + ball(sx+16,76,14);
    plant += ball(sx-20,65,13) + ball(sx+8,62,13) + ball(sx-3,53,13);
  } else if (checked === 6) {
    plant = stm(sx,sb,sx,44,5);
    plant += ball(sx-28,96,16) + ball(sx+26,90,16);
    plant += ball(sx-18,78,15) + ball(sx+18,75,15);
    plant += ball(sx-24,64,14) + ball(sx+12,61,14);
    plant += ball(sx-6,50,14) + ball(sx+4,44,13);
    plant += bud(sx-32,76,7) + bud(sx+28,68,7) + bud(sx,37,8);
  } else {
    plant = stm(sx,sb,sx,34,5.5);
    plant += ball(sx-32,97,17) + ball(sx+30,91,17);
    plant += ball(sx-22,79,16) + ball(sx+22,76,16);
    plant += ball(sx-28,64,15) + ball(sx+16,60,15);
    plant += ball(sx-10,50,15) + ball(sx+8,44,14) + ball(sx-2,34,14);
    plant += flw(sx-36,78,7) + flw(sx+32,70,7);
    plant += flw(sx-18,50,6) + flw(sx+16,44,6);
    plant += flw(sx,26,9);
  }

  // Face — SVG y goes DOWN.
  // SMILE: control BELOW endpoints (higher y)  → curve bows down = U = smile ✓
  // FROWN: control ABOVE endpoints (lower y)   → curve bows up  = ∩ = frown ✓
  const mouths = [
    `M52,139 Q60,134 68,139`,  // 0 deep frown
    `M52,139 Q60,136 68,139`,  // 1 slight frown
    `M53,139 L67,139`,          // 2 flat
    `M52,139 Q60,141 68,139`,  // 3 tiny smile
    `M51,139 Q60,143 69,139`,  // 4 smile
    `M50,139 Q60,145 70,139`,  // 5 big smile
    `M49,139 Q60,147 71,139`,  // 6 wide smile
    `M48,139 Q60,149 72,139`,  // 7 huge grin
  ];
  const browsL = [
    `M47,128 L54,124`,
    `M47,127 L55,125`,
    `M47,126 L55,126`,
    `M47,126 L55,126`,
    `M47,126 Q51,123 55,126`,
    `M47,125 Q51,122 55,125`,
    `M47,124 Q51,121 55,124`,
    `M47,123 Q51,120 55,123`,
  ];
  const browsR = [
    `M66,124 L73,128`,
    `M65,125 L73,127`,
    `M65,126 L73,126`,
    `M65,126 L73,126`,
    `M65,126 Q69,123 73,126`,
    `M65,125 Q69,122 73,125`,
    `M65,124 Q69,121 73,124`,
    `M65,123 Q69,120 73,123`,
  ];

  let eyes;
  if (checked === 0) {
    eyes = `<path d="M48,129 L54,135 M54,129 L48,135" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linecap="round"/>` +
           `<path d="M66,129 L72,135 M72,129 L66,135" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linecap="round"/>`;
  } else if (checked === 1) {
    eyes = `<circle cx="51" cy="132" r="2.6" fill="rgba(0,0,0,0.28)"/>` +
           `<circle cx="69" cy="132" r="2.6" fill="rgba(0,0,0,0.28)"/>`;
  } else if (checked <= 5) {
    const er = checked <= 3 ? 2.9 : 3.3;
    eyes = `<circle cx="51" cy="131" r="${er}" fill="rgba(0,0,0,0.3)"/>` +
           `<circle cx="52.8" cy="129.4" r="1.3" fill="white" opacity="0.85"/>` +
           `<circle cx="69" cy="131" r="${er}" fill="rgba(0,0,0,0.3)"/>` +
           `<circle cx="70.8" cy="129.4" r="1.3" fill="white" opacity="0.85"/>`;
  } else if (checked === 6) {
    eyes = `<path d="M47.5,133 Q51,128 54.5,133" fill="rgba(0,0,0,0.2)" stroke="rgba(0,0,0,0.38)" stroke-width="2.2" stroke-linecap="round"/>` +
           `<path d="M65.5,133 Q69,128 72.5,133" fill="rgba(0,0,0,0.2)" stroke="rgba(0,0,0,0.38)" stroke-width="2.2" stroke-linecap="round"/>`;
  } else {
    eyes = `<path d="M47,133 Q51,127 55,133" fill="rgba(0,0,0,0.22)" stroke="rgba(0,0,0,0.4)" stroke-width="2.4" stroke-linecap="round"/>` +
           `<path d="M65,133 Q69,127 73,133" fill="rgba(0,0,0,0.22)" stroke="rgba(0,0,0,0.4)" stroke-width="2.4" stroke-linecap="round"/>` +
           `<circle cx="49" cy="130" r="1.1" fill="white" opacity="0.75"/>` +
           `<circle cx="67" cy="130" r="1.1" fill="white" opacity="0.75"/>`;
  }

  const blushO = checked >= 3 ? Math.min((checked-2)*0.09, 0.44) : 0;
  const blush  = blushO > 0
    ? `<ellipse cx="42" cy="138" rx="7" ry="3.5" fill="rgba(255,95,80,${blushO})"/>` +
      `<ellipse cx="78" cy="138" rx="7" ry="3.5" fill="rgba(255,95,80,${blushO})"/>`
    : '';
  const sparkles = checked === total
    ? `<text x="0" y="18" font-size="14">&#x2728;</text><text x="104" y="14" font-size="14">&#x2728;</text>`
    : '';

  return `<svg width="120" height="155" viewBox="0 0 120 155" xmlns="http://www.w3.org/2000/svg" overflow="visible">
    ${sparkles}
    ${plant}
    <ellipse cx="60" cy="119" rx="20" ry="4" fill="#7a5030" opacity="0.55"/>
    <rect x="33" y="119" width="54" height="32" rx="13" fill="#c07348"/>
    <rect x="27" y="115" width="66" height="8" rx="4" fill="#d4845a"/>
    <ellipse cx="40" cy="123" rx="5" ry="2.5" fill="white" opacity="0.13"/>
    ${blush}
    <path d="${browsL[checked]}" stroke="rgba(0,0,0,0.22)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="${browsR[checked]}" stroke="rgba(0,0,0,0.22)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${eyes}
    <path d="${mouths[checked]}" stroke="rgba(0,0,0,0.32)" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`;
}

function getHabits() {
  try {
    const raw = JSON.parse(localStorage.getItem(HABIT_LS) || '{}');
    if (raw.date !== todayKey()) return { date: todayKey(), done: {} };
    return raw;
  } catch { return { date: todayKey(), done: {} }; }
}

function saveHabits(state) { localStorage.setItem(HABIT_LS, JSON.stringify(state)); }

function getStreak() {
  try { return parseInt(localStorage.getItem(HABIT_STREAK_LS) || '0', 10); } catch { return 0; }
}

function updateStreak(checkedCount) {
  // Called when all 4 done; update streak day tracking
  const key = 'atd_habit_streak_state_v1';
  try {
    const s = JSON.parse(localStorage.getItem(key) || '{}');
    const today = todayKey();
    if (s.lastFull === today) return; // already counted today
    if (checkedCount < HABITS.length) return;
    // Check if yesterday was completed
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    const streak = s.lastFull === yKey ? (s.streak || 0) + 1 : 1;
    localStorage.setItem(key, JSON.stringify({ lastFull: today, streak }));
    localStorage.setItem(HABIT_STREAK_LS, String(streak));
  } catch {}
}

function toggleHabit(id) {
  const state = getHabits();
  state.done[id] = !state.done[id];
  saveHabits(state);
  const checked = Object.values(state.done).filter(Boolean).length;
  updateStreak(checked);
  renderHabits();
  const plantEl = document.getElementById('habitPlant');
  plantEl.classList.remove('bouncing', 'celebrating');
  void plantEl.offsetWidth; // force reflow to restart animation
  if (checked === HABITS.length) {
    plantEl.classList.add('celebrating');
    setTimeout(() => plantEl.classList.remove('celebrating'), 1000);
  } else {
    plantEl.classList.add('bouncing');
    setTimeout(() => plantEl.classList.remove('bouncing'), 450);
  }
}

function renderHabits() {
  const state = getHabits();
  const checked = Object.values(state.done).filter(Boolean).length;

  document.getElementById('habitPlant').innerHTML = plantSVG(checked);
  document.getElementById('habitMsg').textContent = PLANT_MSGS[checked];

  const streak = getStreak();
  const streakEl = document.getElementById('habitStreak');
  streakEl.textContent = streak > 0 ? `🔥 ${streak} day streak` : '';

  document.getElementById('habitList').innerHTML = HABITS.map(h => {
    const done = !!state.done[h.id];
    return `<div class="habit-row ${done ? 'done' : ''}" onclick="toggleHabit('${h.id}')">
      <div class="habit-check ${done ? 'on' : ''}"></div>
      <span class="habit-emoji">${h.emoji}</span>
      <span class="habit-label">${h.label}</span>
    </div>`;
  }).join('');
}

// ── FOOTBALL ──────────────────────────────────
const FOOTBALL_ALL_CLUBS = [
  { name: 'Barcelona',     id: '83',   league: 'esp.1' },
  { name: 'Real Madrid',   id: '86',   league: 'esp.1' },
  { name: 'Atlético',      id: '1068', league: 'esp.1' },
  { name: 'Liverpool',     id: '364',  league: 'eng.1' },
  { name: 'Man City',      id: '382',  league: 'eng.1' },
  { name: 'Arsenal',       id: '359',  league: 'eng.1' },
  { name: 'Chelsea',       id: '363',  league: 'eng.1' },
  { name: 'Man United',    id: '360',  league: 'eng.1' },
  { name: 'Bayern',        id: '132',  league: 'ger.1' },
  { name: 'Dortmund',      id: '124',  league: 'ger.1' },
  { name: 'PSG',           id: '160',  league: 'fra.1' },
  { name: 'Inter Milan',   id: '110',  league: 'ita.1' },
];
const FOOTBALL_LEAGUE_LABELS = { 'esp.1': 'La Liga', 'eng.1': 'Premier League', 'ger.1': 'Bundesliga', 'fra.1': 'Ligue 1', 'ita.1': 'Serie A', 'uefa.champions': 'UCL' };
const FOOTBALL_SELECTED_LS = 'atd_football_clubs';
const FOOTBALL_CACHE_KEY = 'atd_football_v4';
const FOOTBALL_CACHE_TTL = 3 * 60 * 60 * 1000;

function getSelectedClubs() {
  try {
    const ids = JSON.parse(localStorage.getItem(FOOTBALL_SELECTED_LS) || 'null');
    if (ids && ids.length) return FOOTBALL_ALL_CLUBS.filter(c => ids.includes(c.id));
  } catch {}
  return [FOOTBALL_ALL_CLUBS[0], FOOTBALL_ALL_CLUBS[3]]; // default: Barcelona + Liverpool
}

function openClubPicker() {
  renderClubPickerGrid();
  document.getElementById('clubPickerSheet').classList.add('open');
}
function closeClubPicker() {
  document.getElementById('clubPickerSheet').classList.remove('open');
}
function renderClubPickerGrid() {
  const selectedIds = getSelectedClubs().map(c => c.id);
  document.getElementById('clubPickerGrid').innerHTML = FOOTBALL_ALL_CLUBS.map(club => {
    const sel = selectedIds.includes(club.id);
    return `<div class="club-picker-item${sel ? ' selected' : ''}" onclick="toggleClubPick('${club.id}')">
      <img src="https://a.espncdn.com/i/teamlogos/soccer/500/${club.id}.png" onerror="this.style.opacity='0.25'" alt="">
      <span>${esc(club.name)}</span>
      ${sel ? `<div class="club-picker-check"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="2,5.5 4.2,7.5 8,3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ''}
    </div>`;
  }).join('');
}
function toggleClubPick(clubId) {
  let ids = getSelectedClubs().map(c => c.id);
  const idx = ids.indexOf(clubId);
  if (idx !== -1) {
    if (ids.length === 1) return; // keep at least 1
    ids.splice(idx, 1);
  } else {
    if (ids.length >= 3) return; // max 3
    ids.push(clubId);
  }
  localStorage.setItem(FOOTBALL_SELECTED_LS, JSON.stringify(ids));
  localStorage.removeItem(FOOTBALL_CACHE_KEY);
  renderClubPickerGrid();
  loadFootball();
}

async function loadFootball() {
  const el = document.getElementById('footballContent');

  try {
    const cached = JSON.parse(localStorage.getItem(FOOTBALL_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < FOOTBALL_CACHE_TTL) {
      renderFootball(el, cached.data); return;
    }
  } catch(e) {}

  try {
    const now = new Date();

    // Build date range string for scoreboard: today → +45 days
    const pad = n => String(n).padStart(2,'0');
    const fmtDate = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const future = new Date(now); future.setDate(future.getDate() + 45);
    const dateRange = `${fmtDate(now)}-${fmtDate(future)}`;

    const scoreVal = s => {
      if (s == null) return '';
      if (typeof s === 'object') return String(s.displayValue ?? s.value ?? '');
      return String(s);
    };

    // Convert American moneyline odds to implied probability (%), normalized for overround
    const moneylineToProb = odds => {
      const n = parseFloat(odds);
      if (isNaN(n)) return 0;
      return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
    };
    const calcWinPct = (comp, isHome) => {
      const ml = comp.odds?.[0]?.moneyline;
      if (!ml) return null;
      const hOdds = ml.home?.close?.odds ?? ml.home?.open?.odds;
      const aOdds = ml.away?.close?.odds ?? ml.away?.open?.odds;
      const dOdds = ml.draw?.close?.odds ?? ml.draw?.open?.odds;
      const hP = moneylineToProb(hOdds);
      const aP = moneylineToProb(aOdds);
      const dP = dOdds ? moneylineToProb(dOdds) : 0;
      const total = hP + aP + dP;
      if (!total) return null;
      return Math.round(((isHome ? hP : aP) / total) * 100);
    };

    const parseMatch = (ev, league, isLast) => {
      if (!ev) return null;
      const comp = ev.competitions[0];
      const competitors = comp.competitors || [];
      const mine = competitors.find(c => String(c.team?.id) === String(ev._teamId)) || competitors[0];
      const opp  = competitors.find(c => c !== mine);
      const oppName = opp?.team?.shortDisplayName || opp?.team?.displayName || 'Unknown';
      const oppLogoUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${opp?.team?.id}.png`;
      const myScore  = scoreVal(mine?.score);
      const oppScore = scoreVal(opp?.score);
      const score = isLast && myScore !== '' ? `${myScore}–${oppScore}` : null;
      let result = null;
      if (isLast && myScore !== '' && oppScore !== '') {
        const ms = parseInt(myScore), os = parseInt(oppScore);
        result = isNaN(ms) || isNaN(os) ? null : ms > os ? 'W' : ms < os ? 'L' : 'D';
      }
      const date = new Date(ev.date);
      const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const timeStr = !isLast ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
      const competition = FOOTBALL_LEAGUE_LABELS[league] || '';
      const winPct = !isLast ? calcWinPct(comp, mine?.homeAway === 'home') : null;
      return { oppName, oppLogoUrl, score, result, dateStr, timeStr, competition, winPct };
    };

    const results = await Promise.all(getSelectedClubs().map(async team => {
      const leagues = [team.league, 'uefa.champions'];
      // 1. Last game: fetch completed fixtures from /schedule across all leagues
      const scheduleFetches = await Promise.all(leagues.map(async league => {
        try {
          const data = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${team.id}/schedule`,
            { signal: AbortSignal.timeout(8000) }
          ).then(r => r.json());
          return (data.events || [])
            .filter(e => e.competitions?.[0]?.status?.type?.completed)
            .map(ev => ({ ev, league }));
        } catch { return []; }
      }));
      const completedAll = scheduleFetches.flat()
        .sort((a, b) => new Date(b.ev.date) - new Date(a.ev.date));
      const lastMatch = completedAll[0] || null;

      // 2. Next game: search scoreboard over next 45 days across all leagues
      const scoreboardFetches = await Promise.all(leagues.map(async league => {
        try {
          const data = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dateRange}`,
            { signal: AbortSignal.timeout(8000) }
          ).then(r => r.json());
          return (data.events || [])
            .filter(e => {
              const comps = e.competitions?.[0]?.competitors || [];
              return comps.some(c => String(c.team?.id) === String(team.id));
            })
            .map(ev => ({ ev: { ...ev, _teamId: team.id }, league }));
        } catch { return []; }
      }));
      const upcomingAll = scoreboardFetches.flat()
        .sort((a, b) => new Date(a.ev.date) - new Date(b.ev.date));
      const nextMatch = upcomingAll[0] || null;

      return {
        team,
        last: lastMatch ? parseMatch({ ...lastMatch.ev, _teamId: team.id }, lastMatch.league, true) : null,
        next: nextMatch ? parseMatch(nextMatch.ev, nextMatch.league, false) : null,
      };
    }));

    try { localStorage.setItem(FOOTBALL_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: results })); } catch(e) {}
    renderFootball(el, results);
  } catch(e) {
    el.innerHTML = `<div class="football-loading">Couldn't load match data.</div>`;
  }
}

function renderFootball(el, results) {
  el.innerHTML = results.map(({ team, last, next }) => {
    const teamLogoUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;

    const lastHTML = last
      ? `<div class="football-match">
          <span class="football-match-label">Last</span>
          <img class="football-opp-logo" src="${esc(last.oppLogoUrl)}" onerror="this.style.display='none'" alt="">
          <span class="football-match-teams">${esc(last.oppName)}</span>
          ${last.competition ? `<span class="football-competition">${esc(last.competition)}</span>` : ''}
          ${last.result ? `<span class="football-result ${last.result}">${last.result}</span>` : ''}
          ${last.score ? `<span class="football-match-score">${last.score}</span>` : ''}
          <span class="football-match-date">${last.dateStr}</span>
        </div>`
      : `<div class="football-match"><span class="football-match-label">Last</span><span class="football-match-teams" style="color:var(--text3)">No data</span></div>`;

    const nextHTML = next
      ? `<div class="football-match">
          <span class="football-match-label">Next</span>
          <img class="football-opp-logo" src="${esc(next.oppLogoUrl)}" onerror="this.style.display='none'" alt="">
          <span class="football-match-teams">${esc(next.oppName)}</span>
          ${next.competition ? `<span class="football-competition">${esc(next.competition)}</span>` : ''}
          ${next.winPct !== null ? `<span class="football-winpct">${next.winPct}%</span>` : ''}
          <span class="football-match-date">${next.dateStr}${next.timeStr ? ' · ' + next.timeStr : ''}</span>
        </div>`
      : `<div class="football-match"><span class="football-match-label">Next</span><span class="football-match-teams" style="color:var(--text3)">No data</span></div>`;

    return `<div class="football-team">
      <div class="football-team-name">
        <img class="football-team-logo" src="${esc(teamLogoUrl)}" onerror="this.style.display='none'" alt="${esc(team.name)}">
        ${esc(team.name)}
      </div>
      ${lastHTML}
      ${nextHTML}
    </div>`;
  }).join('');
}

// ── PHOTO A DAY ───────────────────────────────
const PHOTO_LS = 'atd_photos_v1';
const PHOTO_DB = 'atd_photos_db_v1';
const PHOTO_STORE = 'photos';
const PHOTO_PROMPTS = [
  'Something that made you smile today',
  'Your current view right now',
  'Something beautiful you almost walked past',
  'What you\'re eating or drinking',
  'A colour that caught your eye',
  'Something old',
  'Something new',
  'Morning light',
  'The sky right now',
  'Your hands doing something',
  'A shadow or reflection',
  'Something that represents today\'s mood',
  'A texture you find interesting',
  'Something green',
  'A moment of stillness',
  'Something that made you curious',
  'Your favourite spot today',
  'Something small but significant',
  'A door or window',
  'Something in motion',
  'A pattern you noticed',
  'What\'s on your desk right now',
  'Something that surprised you',
  'A street detail most people ignore',
  'Something that smells good',
  'An unexpected moment of beauty',
  'Something that represents home',
  'A book, song, or film you\'re into this week',
  'Something you want to remember',
  'The last thing you bought',
];

function getPhotoPrompt() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return PHOTO_PROMPTS[dayOfYear % PHOTO_PROMPTS.length];
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE, { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function migrateLegacyPhotos(db) {
  const raw = localStorage.getItem(PHOTO_LS);
  if (!raw) return;
  try {
    const legacy = JSON.parse(raw);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      Object.entries(legacy).forEach(([date, photo]) => store.put({ date, ...photo }));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    localStorage.removeItem(PHOTO_LS);
  } catch {}
}

async function getPhotos() {
  const db = await openPhotoDb();
  await migrateLegacyPhotos(db);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => {
      const photos = {};
      (req.result || []).forEach(p => { photos[p.date] = { data: p.data, prompt: p.prompt }; });
      resolve(photos);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getPhotoCount() {
  try {
    const photos = await getPhotos();
    return Object.keys(photos).length;
  } catch { return 0; }
}

async function savePhoto(date, photo) {
  const db = await openPhotoDb();
  await migrateLegacyPhotos(db);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put({ date, ...photo });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function clearPhotos() {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function deletePhotoDb() {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(PHOTO_DB);
    req.onsuccess = req.onerror = req.onblocked = resolve;
  });
}

function todayPhotoKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function compressPhoto(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.src = url;
  });
}

async function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const base64 = await compressPhoto(file);
  try {
    await savePhoto(todayPhotoKey(), { data: base64, prompt: getPhotoPrompt() });
  } catch {
    alert('Storage full — older photos may need to be cleared.');
    return;
  }
  renderPhotoTab();
}

async function renderPhotoTab() {
  const photos = await getPhotos();
  const todayKey = todayPhotoKey();
  const todayPhoto = photos[todayKey];

  document.getElementById('photoPrompt').textContent = getPhotoPrompt();

  const uploadArea = document.getElementById('photoUploadArea');
  const retakeWrap = document.getElementById('photoRetakeWrap');

  if (todayPhoto) {
    uploadArea.className = 'photo-upload-area has-photo';
    uploadArea.innerHTML = `<img src="${todayPhoto.data}" alt="Today's photo">`;
    uploadArea.onclick = null;
    retakeWrap.style.display = 'block';
  } else {
    uploadArea.className = 'photo-upload-area';
    uploadArea.innerHTML = `<div class="photo-upload-icon">📷</div><div class="photo-upload-hint">Tap to take a photo or upload one</div>`;
    uploadArea.onclick = () => document.getElementById('photoFileInput').click();
    retakeWrap.style.display = 'none';
  }

  // Gallery — all past photos sorted newest first, excluding today
  const pastKeys = Object.keys(photos).filter(k => k !== todayKey).sort().reverse();
  const gallery = document.getElementById('photoGallery');
  if (!pastKeys.length) {
    gallery.innerHTML = `<div class="photo-empty">No past photos yet — start today!</div>`;
    return;
  }
  gallery.innerHTML = `<div class="photo-grid">${pastKeys.map(k => {
    const p = photos[k];
    const label = new Date(k + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<div class="photo-grid-item">
      <img src="${p.data}" alt="${esc(k)}">
      <div class="photo-grid-item-date">${label}</div>
    </div>`;
  }).join('')}</div>`;
}

// ── VOICE INPUT ───────────────────────────────
let voiceAccumulated = '';

function toggleVoice() {
  if (isRecording) {
    isRecording = false;
    if (recognition) { try { recognition.stop(); } catch(e){} }
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Voice input is not supported in this browser. Try Safari or Chrome.'); return; }

  voiceAccumulated = '';
  isRecording = true;
  document.getElementById('micBtn').classList.add('recording');
  document.getElementById('taskInp').placeholder = 'Listening… tap mic to stop';
  document.getElementById('taskInp').value = '';
  startRecognition();
}

function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) voiceAccumulated += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    document.getElementById('taskInp').value = (voiceAccumulated + interim).trim();
  };

  recognition.onend = () => {
    if (isRecording) {
      // iOS killed it mid-session — restart automatically
      try { startRecognition(); return; } catch(e) {}
    }
    // User tapped stop
    const transcript = (voiceAccumulated).trim() || document.getElementById('taskInp').value.trim();
    document.getElementById('micBtn').classList.remove('recording');
    document.getElementById('taskInp').placeholder = 'Add a task…';
    recognition = null;
    if (transcript) processVoiceResult(transcript);
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech') return;
    isRecording = false;
    document.getElementById('micBtn').classList.remove('recording');
    document.getElementById('taskInp').placeholder = 'Add a task…';
    recognition = null;
  };

  try { recognition.start(); } catch(e) { isRecording = false; }
}

function processVoiceResult(raw) {
  const date     = parseTaskDate(raw);
  const time     = parseTaskTime(raw);
  const priority = parseTaskPriority(raw);
  const text     = cleanTaskText(raw);

  pendingMeta = {};
  if (date)     pendingMeta.date = date;
  if (time)     pendingMeta.time = time;
  if (priority) pendingMeta.priority = priority;

  document.getElementById('taskInp').value = text;

  const tags = [];
  if (date)     tags.push(`<span class="tbadge tbadge-date">${esc(date)}</span>`);
  if (time)     tags.push(`<span class="tbadge tbadge-time">${esc(time)}</span>`);
  if (priority === 'urgent') tags.push(`<span class="tbadge tbadge-urgent">Urgent</span>`);
  if (priority === 'high')   tags.push(`<span class="tbadge tbadge-high">Important</span>`);
  if (priority === 'low')    tags.push(`<span class="tbadge tbadge-low">Low priority</span>`);

  const preview = document.getElementById('voicePreview');
  document.getElementById('voiceHeard').textContent = '"' + raw + '"';
  document.getElementById('voiceTags').innerHTML = tags.join('');
  preview.classList.toggle('show', !!(date || time || priority || raw));
}

function parseTaskDate(text) {
  const t = text.toLowerCase();
  const now = new Date();
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (/\btoday\b/.test(t)) return fmt(now);
  if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate()+1); return fmt(d); }

  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let i = 0; i < days.length; i++) {
    if (new RegExp('\\b' + days[i] + '\\b').test(t)) {
      const d = new Date(now);
      const diff = (i - now.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return fmt(d);
    }
  }

  const m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})/);
  if (m) return m[1].slice(0,3).replace(/^\w/,c=>c.toUpperCase()) + ' ' + m[2];

  return null;
}

function parseTaskTime(text) {
  const m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2] || '00';
  const ampm = (m[3] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (!ampm && h < 7) h += 12; // assume pm for ambiguous times like "at 3"
  return (h % 12 || 12) + ':' + min + ' ' + (h < 12 ? 'AM' : 'PM');
}

function parseTaskPriority(text) {
  const t = text.toLowerCase();
  if (/\b(urgent|asap|critical|very important|right away)\b/.test(t)) return 'urgent';
  if (/\b(important|high priority|priority|don't forget|must)\b/.test(t)) return 'high';
  if (/\b(low priority|whenever|not urgent|when (i )?can|if possible)\b/.test(t)) return 'low';
  return null;
}

function cleanTaskText(text) {
  return text
    .replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
    .replace(/\b(urgent|asap|critical|very important|right away|important|high priority|priority|don't forget|must|low priority|whenever|not urgent|when i can|when can|if possible|it'?s?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '');
}

// ── FINANCE ───────────────────────────────────
const FINNHUB_PROXY_URL = '/api/finnhub';

const MARKET_OVERVIEW = [
  { symbol: '^GSPC',   label: 'S&P 500'  },
  { symbol: '^IXIC',   label: 'Nasdaq'   },
  { symbol: 'BTC-USD', label: 'Bitcoin'  },
  { symbol: 'ETH-USD', label: 'Ethereum' }
];

const TRACKED_STOCKS = [
  { ticker: 'META',  name: 'Meta Platforms'           },
  { ticker: 'COIN',  name: 'Coinbase Global'          },
  { ticker: 'MSFT',  name: 'Microsoft'                },
  { ticker: 'ELF',   name: 'e.l.f. Beauty'            },
  { ticker: 'CAKE',  name: 'Cheesecake Factory'       },
  { ticker: 'AMZN',  name: 'Amazon'                   },
  { ticker: 'IONQ',  name: 'IonQ Inc'                 },
  { ticker: 'SCHG',  name: 'Schwab US Large-Cap Growth'},
  { ticker: 'VT',    name: 'Vanguard Total World'     },
  { ticker: 'QQQM',  name: 'Invesco Nasdaq 100 ETF'   },
  { ticker: 'SOFI',  name: 'SoFi Technologies'        },
  { ticker: 'TSM',   name: 'Taiwan Semiconductor ADR' },
  { ticker: 'GOOGL', name: 'Alphabet Class A'         },
  { ticker: 'VGT',   name: 'Vanguard IT ETF'          },
  { ticker: 'NVDA',  name: 'NVIDIA'                   },
  { ticker: 'PLTR',  name: 'Palantir Technologies'    },
  { ticker: 'VOO',   name: 'Vanguard S&P 500 ETF'     },
  { ticker: 'AMD',   name: 'AMD'                      },
];

const FIN_LS = 'atd_finance_v2';

function getFinCache() { try { return JSON.parse(localStorage.getItem(FIN_LS) || 'null'); } catch { return null; } }
function setFinCache(d) { localStorage.setItem(FIN_LS, JSON.stringify({ ts: Date.now(), quotes: d })); }

async function fetchFinnhubBatch(symbols) {
  const r = await fetch(`${FINNHUB_PROXY_URL}?symbols=${encodeURIComponent(symbols.join(','))}`, { signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'Finnhub API error');
  return d.quotes || {};
}

async function fetchAllFinancePrices() {
  const stockSymbols = ['^GSPC', '^IXIC', ...TRACKED_STOCKS.map(s => s.ticker)];

  const [fhResult, cgRes] = await Promise.allSettled([
    fetchFinnhubBatch(stockSymbols),
    fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&order=market_cap_desc&per_page=2&page=1&sparkline=false', { signal: AbortSignal.timeout(10000) }).then(r => r.json())
  ]);

  const quotes = {};

  if (fhResult.status === 'fulfilled') {
    Object.assign(quotes, fhResult.value);
    TRACKED_STOCKS.forEach(s => { if (quotes[s.ticker]) quotes[s.ticker].name = s.name; });
  }

  if (cgRes.status === 'fulfilled' && Array.isArray(cgRes.value)) {
    cgRes.value.forEach(c => {
      const sym = c.id === 'bitcoin' ? 'BTC-USD' : 'ETH-USD';
      const price = c.current_price, chgAbs = c.price_change_24h;
      quotes[sym] = { price, changeAbs: chgAbs, changePct: c.price_change_percentage_24h, open: price - chgAbs, high: c.high_24h, low: c.low_24h, prevClose: price - chgAbs, wkHigh: c.ath, wkLow: c.atl, name: c.name };
    });
  }

  return quotes;
}

async function loadFinance(force) {
  const el = document.getElementById('financeContent');
  if (!el) return;

  const cache = getFinCache();
  if (cache && !force) {
    saveWeeklySnapshot(cache.quotes);
    renderFinance(cache.quotes);
    if ((Date.now() - cache.ts) / 60000 < 15) return;
  } else {
    el.innerHTML = '<div class="fin-loading">Loading market data…</div>';
  }

  try {
    const quotes = await fetchAllFinancePrices();
    if (Object.keys(quotes).length > 0) {
      setFinCache(quotes);
      saveWeeklySnapshot(quotes);
      renderFinance(quotes);
    } else {
      el.innerHTML = '<div class="fin-loading">Could not load prices — tap ↻ to retry.</div>';
    }
  } catch {
    el.innerHTML = '<div class="fin-loading">Could not load prices — tap ↻ to retry.</div>';
  }
}

function fmtP(price, symbol) {
  if (price == null) return '–';
  if (symbol === '^GSPC' || symbol === '^IXIC') return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (symbol === 'BTC-USD' || symbol === 'ETH-USD') return '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stockNote(q) {
  if (!q || q.changePct == null) return '';
  const pct = Math.abs(q.changePct);
  const up = q.changePct >= 0;
  const aboveOpen = q.open != null && q.price > q.open;
  if (q.wkHigh && q.price >= q.wkHigh * 0.97) return 'Trading near its 52-week high';
  if (q.wkLow && q.price <= q.wkLow * 1.05) return 'Trading near its 52-week low';
  if (pct >= 5) return up ? `Surging ${pct.toFixed(1)}% — strong buying today` : `Dropping ${pct.toFixed(1)}% — heavy selling today`;
  if (pct >= 2) return up ? `Up ${pct.toFixed(1)}% — solid gain today` : `Down ${pct.toFixed(1)}% — notable decline today`;
  if (pct >= 0.5) return up ? `Modest gain, trading above open` : `Slight decline, trading below open`;
  return aboveOpen ? 'Edging higher from the open' : 'Slightly off the open';
}

// ── WEEKLY SNAPSHOT ───────────────────────────
const WEEKLY_LS = 'atd_weekly_v1';

function getThisMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function saveWeeklySnapshot(quotes) {
  const monday = getThisMonday();
  let snap = {};
  try { snap = JSON.parse(localStorage.getItem(WEEKLY_LS) || '{}'); } catch {}
  if (snap.monday === monday) return; // already saved this week
  const prices = {};
  [...TRACKED_STOCKS.map(s => s.ticker), '^GSPC', 'BTC-USD'].forEach(sym => {
    if (quotes[sym]) prices[sym] = quotes[sym].price;
  });
  localStorage.setItem(WEEKLY_LS, JSON.stringify({ monday, prices }));
}

function getWeeklySummaryHTML(quotes) {
  let snap = {};
  try { snap = JSON.parse(localStorage.getItem(WEEKLY_LS) || '{}'); } catch {}
  const monday = getThisMonday();
  if (!snap.monday || snap.monday !== monday || !snap.prices) return '';

  const rows = [
    { label: 'S&P 500', sym: '^GSPC' },
    { label: 'Bitcoin', sym: 'BTC-USD' },
    ...TRACKED_STOCKS.map(s => ({ label: s.ticker, sym: s.ticker }))
  ].filter(r => quotes[r.sym] && snap.prices[r.sym]);

  if (!rows.length) return '';

  const rowsHTML = rows.map(r => {
    const now = quotes[r.sym].price;
    const start = snap.prices[r.sym];
    const pct = ((now - start) / start) * 100;
    const up = pct >= 0;
    const sign = up ? '+' : '';
    return `<div class="fin-weekly-row">
      <div class="fin-weekly-label">${esc(r.label)}</div>
      <div class="fin-weekly-val ${up ? 'up' : 'down'}">${sign}${pct.toFixed(2)}% this week</div>
    </div>`;
  }).join('');

  return `<div class="fin-weekly">
    <div class="fin-weekly-title">Week to date (since Mon)</div>
    ${rowsHTML}
  </div>`;
}

function isMarketOpen() {
  const now = new Date();
  // Convert to US Eastern time
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function marketStatusHTML() {
  const open = isMarketOpen();
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const h = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  let label;
  if (open) {
    const closeIn = 16 * 60 - mins;
    label = `Open · closes in ${Math.floor(closeIn/60)}h ${closeIn%60}m`;
  } else if (day === 0 || day === 6) {
    label = 'Closed · opens Monday 9:30 AM ET';
  } else if (mins < 9 * 60 + 30) {
    const openIn = 9 * 60 + 30 - mins;
    label = `Closed · opens in ${Math.floor(openIn/60)}h ${openIn%60}m`;
  } else {
    label = 'Closed · opens tomorrow 9:30 AM ET';
  }
  return `<div class="fin-market-status"><div class="fin-market-status-dot ${open?'open':'closed'}"></div>${label}</div>`;
}

function renderFinance(quotes) {
  const el = document.getElementById('financeContent');
  if (!el) return;

  // ── Market overview ──
  let html = marketStatusHTML() + '<div class="fin-section-label">Markets</div><div class="fin-market-grid">';
  MARKET_OVERVIEW.forEach(m => {
    const q = quotes[m.symbol];
    const up = q ? q.changePct >= 0 : null;
    const cls = up === null ? '' : up ? 'up-card' : 'down-card';
    const priceStr = q ? fmtP(q.price, m.symbol) : '–';
    const isIndex = m.symbol === '^GSPC' || m.symbol === '^IXIC';
    const isCrypto = m.symbol === 'BTC-USD' || m.symbol === 'ETH-USD';
    const chgAbsStr = q ? (isIndex ? `${up?'+':''}${q.changeAbs.toFixed(2)}` : `${up?'+':''}$${Math.abs(q.changeAbs).toFixed(isCrypto?0:2)}`) : '';
    const chgPctStr = q ? `(${up ? '+' : ''}${q.changePct.toFixed(2)}%)` : '–';
    const openStr  = q && q.open ? `Open ${fmtP(q.open, m.symbol)}` : '';
    html += `<div class="fin-mcard ${cls}">
      <div class="fin-mcard-label">${esc(m.label)}</div>
      <div class="fin-mcard-price">${esc(priceStr)}</div>
      <div class="fin-mcard-chg ${up === null ? '' : up ? 'up' : 'down'}">${chgAbsStr} ${chgPctStr}</div>
      <div class="fin-mcard-open">${esc(openStr)}</div>
    </div>`;
  });
  html += '</div>';

  // ── Stock list ──
  html += '<div class="fin-section-label">Watchlist</div><div class="fin-list">';
  TRACKED_STOCKS.forEach(s => {
    const q = quotes[s.ticker];
    const up = q ? q.changePct >= 0 : null;
    const priceStr = q ? '$' + q.price.toFixed(2) : '–';
    const chgAbsStr = q ? `${up ? '+' : ''}$${Math.abs(q.changeAbs).toFixed(2)}` : '–';
    const chgPctStr = q ? `${up ? '+' : ''}${q.changePct.toFixed(2)}%` : '';
    const openStr   = q && q.open   ? '$' + q.open.toFixed(2) : '–';
    const highStr   = q && q.high   ? '$' + q.high.toFixed(2) : '–';
    const lowStr    = q && q.low    ? '$' + q.low.toFixed(2)  : '–';
    const wkHighStr = q && q.wkHigh ? '$' + q.wkHigh.toFixed(2) : '–';
    const wkLowStr  = q && q.wkLow  ? '$' + q.wkLow.toFixed(2)  : '–';
    const note = stockNote(q);

    // 52-week bar position (0–100%)
    let dotPct = 50;
    if (q && q.wkHigh && q.wkLow && q.wkHigh > q.wkLow) {
      dotPct = Math.min(100, Math.max(0, ((q.price - q.wkLow) / (q.wkHigh - q.wkLow)) * 100));
    }

    html += `<div class="fin-card">
      <div class="fin-card-top">
        <div>
          <div class="fin-ticker">${esc(s.ticker)}</div>
          <div class="fin-company">${esc(s.name)}</div>
        </div>
        <div class="fin-price-block">
          <div class="fin-price">${esc(priceStr)}</div>
          <div class="fin-chg-abs ${up === null ? '' : up ? 'up' : 'down'}">${chgAbsStr}</div>
          <div class="fin-chg-pct ${up === null ? '' : up ? 'up' : 'down'}">${chgPctStr}</div>
        </div>
      </div>
      <div class="fin-stats">
        <div><div class="fin-stat-lbl">Open</div><div class="fin-stat-val">${esc(openStr)}</div></div>
        <div><div class="fin-stat-lbl">High</div><div class="fin-stat-val up">${esc(highStr)}</div></div>
        <div><div class="fin-stat-lbl">Low</div><div class="fin-stat-val down">${esc(lowStr)}</div></div>
      </div>
      ${q && q.wkHigh && q.wkLow ? `<div class="fin-52w-row">
        <div class="fin-52w-labels"><span>${esc(wkLowStr)}</span><span style="color:var(--text3);font-size:9px">52-WEEK RANGE</span><span>${esc(wkHighStr)}</span></div>
        <div class="fin-52w-bar"><div class="fin-52w-fill" style="width:${dotPct}%"></div><div class="fin-52w-dot" style="left:${dotPct}%"></div></div>
      </div>` : ''}
      ${note ? `<div class="fin-note">${esc(note)}</div>` : ''}
    </div>`;
  });
  html += '</div>';

  const fc = getFinCache();
  const fcTs = fc ? new Date(fc.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  const fcAge = fc ? Math.round((Date.now()-fc.ts)/60000) : 0;
  const fcAgeStr = fcAge < 1 ? '' : fcAge < 60 ? ` · ${fcAge}m ago` : ` · ${Math.floor(fcAge/60)}h ago`;
  html += `<div class="fin-update-time">Fetched ${fcTs}${fcAgeStr}</div>`;
  el.innerHTML = html;

  // Inject weekly summary after watchlist
  const weekly = getWeeklySummaryHTML(quotes);
  if (weekly) {
    const updateTime = el.querySelector('.fin-update-time');
    updateTime.insertAdjacentHTML('beforebegin', weekly);
  }

  renderMarketPulse(quotes);
}

function renderMarketPulse(quotes) {
  // Pick top 3 movers from watchlist by absolute % change
  const movers = TRACKED_STOCKS
    .map(s => ({ ...s, q: quotes[s.ticker] }))
    .filter(s => s.q && s.q.changePct != null)
    .sort((a, b) => Math.abs(b.q.changePct) - Math.abs(a.q.changePct))
    .slice(0, 3);

  if (!movers.length) return;

  const existing = document.getElementById('marketPulseCard');
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.id = 'marketPulseCard';
  card.className = 'pulse-card';

  const moversHTML = movers.map(s => {
    const up = s.q.changePct >= 0;
    const color = up ? 'var(--green)' : 'var(--red)';
    const sign = up ? '+' : '';
    return `<div class="pulse-mover">
      <div class="pulse-mover-left">
        <div class="pulse-mover-dot" style="background:${color}"></div>
        <div>
          <div class="pulse-mover-name">${esc(s.ticker)} <span style="font-size:11px;color:var(--text3);font-weight:500">${esc(s.name)}</span></div>
        </div>
      </div>
      <div class="pulse-mover-pct" style="color:${color}">${sign}${s.q.changePct.toFixed(2)}%</div>
    </div>`;
  }).join('');

  // Cache key: today's date + top mover tickers (refreshes if movers change)
  const pulseKey = todayKey() + ':' + movers.map(s => s.ticker).join(',');
  window._pulseMovers = movers;
  window._pulseKey = pulseKey;

  // Check cache
  const cached = getTodayData().marketPulse;

  const explanationHTML = (cached && cached.key === pulseKey)
    ? '<div class="pulse-explanation">' + cached.text.split('\n').filter(l => l.trim()).map(l => `<p>${esc(l)}</p>`).join('') + '</div>'
    : '';
  const btnLabel = cached && cached.key === pulseKey ? '↻ Refresh explanation' : '✦ Explain with AI';

  card.innerHTML = `
    <div class="card-title">Market Pulse</div>
    <div class="pulse-movers">${moversHTML}</div>
    <div id="pulseExplanation">${explanationHTML}</div>
    <button class="pulse-btn" id="pulseBtn" onclick="generateMarketPulse()">${btnLabel}</button>
  `;

  // Insert before the Markets label (first child of financeContent)
  const fc = document.getElementById('financeContent');
  fc.insertBefore(card, fc.firstChild);
}

async function generateMarketPulse() {
  const movers = window._pulseMovers;
  if (!movers?.length) return;

  const btn = document.getElementById('pulseBtn');
  const expEl = document.getElementById('pulseExplanation');
  btn.disabled = true;
  expEl.innerHTML = '<div class="pulse-spinner">Asking AI…</div>';

  const moverLines = movers.map(s => {
    const dir = s.q.changePct >= 0 ? 'up' : 'down';
    return `${s.ticker} (${s.name}): ${dir} ${Math.abs(s.q.changePct).toFixed(2)}% today, price $${s.q.price.toFixed(2)}, open $${s.q.open?.toFixed(2) ?? '?'}`;
  }).join('\n');

  const prompt = `I hold these stocks in my personal portfolio and they are today's biggest movers:\n\n${moverLines}\n\nGive me a very short, plain-English explanation (2-3 sentences per stock) of why each is likely moving today. Be direct and specific — mention macro factors, sector news, or company events if relevant. No disclaimers, no financial advice boilerplate.`;

  try {
    const text = await callGemini(prompt, 800);
    setTodayData({ marketPulse: { key: window._pulseKey, text } });
    expEl.innerHTML = '<div class="pulse-explanation">' + text.split('\n').filter(l => l.trim()).map(l => `<p>${esc(l)}</p>`).join('') + '</div>';
    btn.textContent = '↻ Refresh explanation';
  } catch (e) {
    expEl.innerHTML = `<div class="pulse-spinner" style="color:var(--red);line-height:1.45">Failed — ${esc(e.message || 'tap to retry')}.</div>`;
    btn.textContent = '✦ Explain with AI';
  }
  btn.disabled = false;
}

// ── LEARN ────────────────────────────────────
const LEARN_LS = 'atd_learn_v1';
const CURRICULUM = [
  {
    id: 'hungarian', title: 'Hungarian History', icon: '🇭🇺', color: '#ff453a',
    chapters: [
      { title: 'Origins of the Magyars', lessons: [
        { title: 'Finno-Ugric Roots', body: ['The Hungarian language belongs to the Finno-Ugric family, making it a distant relative of Finnish and Estonian. This linguistic kinship traces back to ancient peoples who lived around the Ural Mountains some 5,000–6,000 years ago, long before modern Hungary existed.', 'The Magyar tribes gradually separated from their Finno-Ugric cousins and moved westward across the Eurasian steppe. Over centuries they absorbed influences from Turkic, Iranian, and Slavic neighbours while retaining the core grammar that still defines Hungarian today — a language famously unlike any other in Central Europe.'], quiz: { q: 'Which language family does Hungarian belong to?', opts: ['Slavic','Finno-Ugric','Germanic','Turkic'], correct: 1 } },
        { title: 'Life on the Eurasian Steppe', body: ['Before settling in Europe, the Magyar tribes were semi-nomadic horsemen roaming the grasslands north of the Black Sea. They were skilled cavalry fighters and herders, moving seasonally with their livestock and raiding neighbouring settlements when resources were scarce.', 'Their society was organised into seven clans (törzsek) bound by blood oaths. They practised shamanism and held a cosmology centred on the sky god Isten. This mobile tribal lifestyle would be radically transformed when they entered the Carpathian Basin in 895 AD.'], quiz: { q: 'How many clans formed the original Magyar tribal federation?', opts: ['Three','Five','Seven','Ten'], correct: 2 } },
        { title: 'The Conquest of 895', body: ['Led by Prince Árpád, the seven Magyar tribes crossed the Carpathian Mountains in 895 AD in what Hungarians call the "Honfoglalás" (land-taking). The Carpathian Basin — modern Hungary — was a fertile, largely depopulated plain ideal for semi-nomadic life.', 'The conquest was swift. The Magyars defeated existing Slavic and Avar populations within years. For the next five decades they launched devastating raids deep into Western Europe — reaching Spain and Italy — before being stopped at the Battle of Lechfeld in 955.'], quiz: { q: 'What is the Hungarian term for the 895 conquest?', opts: ['Honfoglalás','Árpádkor','Mohács','Trianon'], correct: 0 } },
      ]},
      { title: 'The Christian Kingdom', lessons: [
        { title: 'Stephen I — The First King', body: ['Prince Géza\'s son Vajk was baptised as Stephen and crowned King of Hungary on Christmas Day 1000 AD, with a crown sent by Pope Sylvester II. By accepting Christianity and Papal recognition, Stephen transformed Hungary from a pagan tribal confederacy into a European kingdom.', 'Stephen reorganised the country into counties administered by royal officials, founded bishoprics and monasteries, and issued laws modelled on Frankish practice. His achievements were so foundational that he was canonised in 1083 and remains Hungary\'s patron saint.'], quiz: { q: 'On what date was Stephen I crowned King of Hungary?', opts: ['25 December 1000','1 January 896','15 June 1215','29 August 1526'], correct: 0 } },
        { title: 'The Golden Bull of 1222', body: ['Under King Andrew II, the Hungarian nobility forced the king to issue the Golden Bull (Aranybulla) in 1222. Often compared to Magna Carta (1215), this document guaranteed noble privileges — including freedom from arbitrary imprisonment and taxation — and allowed resistance to an unlawful king without committing treason.', 'The Golden Bull marked the beginning of Hungary\'s tradition of constitutionalism. It established a legal framework that constrained royal power and protected noble rights for centuries, shaping the country\'s political culture long before modern democracy emerged.'], quiz: { q: 'The Golden Bull of 1222 is often compared to which English document?', opts: ['Bill of Rights','Magna Carta','Habeas Corpus Act','Act of Settlement'], correct: 1 } },
        { title: 'Matthias Corvinus', body: ['Matthias Corvinus (1458–1490) is considered Hungary\'s greatest medieval king. He built a professional "Black Army," reformed the administration, and made Hungary a centre of Renaissance culture. His court in Buda rivalled those of Florence and Rome.', 'Matthias established the famous Bibliotheca Corviniana, one of Europe\'s greatest Renaissance libraries. He is celebrated in folklore as "Matthias the Just" — a king who disguised himself to hear the problems of ordinary people. His death in 1490 left Hungary without an heir, opening the door to future disaster.'], quiz: { q: 'What was the Renaissance library built by Matthias Corvinus called?', opts: ['Bibliotheca Corvina','Bibliotheca Corviniana','Corvina Hungarica','Buda Scriptorium'], correct: 1 } },
      ]},
      { title: 'Ottoman Occupation', lessons: [
        { title: 'The Battle of Mohács (1526)', body: ['The Battle of Mohács on 29 August 1526 was one of the most catastrophic defeats in Hungarian history. A Hungarian-Bohemian army faced the vastly superior Ottoman forces of Sultan Suleiman the Magnificent. The battle lasted under two hours; the Hungarians were annihilated and King Louis II drowned fleeing.', 'Mohács marked the end of medieval Hungary. The country was split into three: the Ottoman-controlled central plain, Habsburg-ruled "Royal Hungary" in the north-west, and the semi-autonomous Principality of Transylvania in the east — a fragmentation lasting over 150 years.'], quiz: { q: 'What happened to King Louis II at the Battle of Mohács?', opts: ['He was captured','He drowned fleeing','He was killed in battle','He escaped to Vienna'], correct: 1 } },
        { title: 'Divided Hungary (1541–1686)', body: ['For 150 years Hungary existed as three distinct territories. The Ottomans controlled the fertile central plain including Buda from 1541, transforming it with mosques and baths. Habsburg-controlled Royal Hungary preserved Hungarian institutions. Transylvania maintained relative autonomy and became a refuge for Hungarian culture and Protestantism.', 'The long occupation had devastating demographic consequences. Repeated wars, famines and plague depopulated large swathes of the Hungarian Plain. Areas that had been ethnically Hungarian were resettled by Serbs, Romanians, and Germans — reshaping the ethnic composition that would fuel conflicts centuries later.'], quiz: { q: 'Which city did the Ottomans capture in 1541, making it their Hungarian capital?', opts: ['Pozsony','Eger','Buda','Debrecen'], correct: 2 } },
        { title: 'Liberation & Habsburg Rule', body: ['The Great Turkish War (1683–1699) drove the Ottomans out of Hungary. Buda was liberated in 1686 after 145 years of Ottoman rule. However, the Habsburgs treated Hungary as conquered territory, imposing heavy taxation and attempting to suppress Protestantism.', 'This sparked the Rákóczi War of Independence (1703–1711). Though it ultimately failed, it established the Hungarian resistance tradition and eventually forced the Habsburgs into a compromise preserving Hungary\'s legal autonomy — a pattern that would recur in 1867.'], quiz: { q: 'In what year was Buda liberated from Ottoman rule?', opts: ['1683','1686','1699','1711'], correct: 1 } },
      ]},
      { title: 'Reform & Revolution', lessons: [
        { title: 'The Age of Reform', body: ['The early 19th century was Hungary\'s "Reform Era," dominated by Count István Széchenyi. He donated a year\'s income to found the Hungarian Academy of Sciences, promoted the Chain Bridge (first permanent Danube crossing), and championed railways and modern agriculture.', 'Széchenyi advocated gradual legal reform within the Habsburg framework. His great rival, Lajos Kossuth, demanded full parliamentary government and abolition of noble privileges. This tension between reform and revolution defined the era and culminated explosively in 1848.'], quiz: { q: 'Which institution did Széchenyi found by donating a year\'s income?', opts: ['Budapest University','The Parliament','The Hungarian Academy of Sciences','The National Museum'], correct: 2 } },
        { title: '1848 — Revolution!', body: ['On 15 March 1848, poet Sándor Petőfi read his "National Song" to a crowd in Pest and the revolution began. A Hungarian government formed under Count Batthyány enacted sweeping reforms within weeks: abolishing serfdom, ending noble tax exemptions, establishing a free press.', 'The Habsburgs counter-attacked with Austrian and Croatian armies. Hungary declared independence in April 1849, but Tsar Nicholas I sent 200,000 Russian troops to help crush it. Kossuth fled into exile; 13 Hungarian generals were executed at Arad on 6 October 1849 — still commemorated annually.'], quiz: { q: 'Which poet recited the "National Song" to launch the 1848 revolution?', opts: ['János Arany','Sándor Petőfi','Mihály Vörösmarty','Imre Madách'], correct: 1 } },
        { title: 'The Compromise of 1867', body: ['After Austria\'s defeat by Prussia in 1866, Emperor Franz Joseph needed Hungarian support. The Austro-Hungarian Compromise (Ausgleich) of 1867, negotiated by Ferenc Deák, gave Hungary full internal autonomy with its own parliament and government — sharing only foreign policy and defence with Austria.', 'The "Dual Monarchy" era (1867–1918) was Hungary\'s golden age. Budapest was transformed into a grand European capital — the Parliament, Opera House, and Heroes\' Square were built in this period. The economy boomed and Hungary hosted its Millennial Exhibition in 1896.'], quiz: { q: 'Which statesman is most credited with negotiating the 1867 Compromise?', opts: ['Lajos Kossuth','István Tisza','Ferenc Deák','Gyula Andrássy'], correct: 2 } },
      ]},
      { title: 'The 20th Century', lessons: [
        { title: 'Trianon — The Trauma of 1920', body: ['Hungary entered WWI on the side of Austria-Germany and suffered defeat. The Treaty of Trianon (4 June 1920) was devastating: Hungary lost 72% of its territory and 64% of its population. Millions of ethnic Hungarians suddenly found themselves in Romania, Czechoslovakia, and Yugoslavia.', 'Trianon became the defining trauma of 20th-century Hungarian identity. "Nem, nem, soha!" ("No, no, never!") became a national rallying cry. The obsession with revising Trianon pulled Hungary toward Nazi Germany in WWII — with catastrophic consequences. June 4 is still observed as National Cohesion Day.'], quiz: { q: 'What percentage of its territory did Hungary lose under the Treaty of Trianon?', opts: ['42%','58%','72%','85%'], correct: 2 } },
        { title: '1956 — The Revolution', body: ['On 23 October 1956, Hungarians rose up against Soviet-backed communist rule. Protesters tore down Stalin\'s statue in Budapest. Reform communist Imre Nagy became prime minister and announced Hungary\'s withdrawal from the Warsaw Pact.', 'The Soviet Union responded with a massive military invasion on 4 November 1956. Some 2,500 Hungarians died fighting tanks with rifles; 200,000 fled to the West as refugees. Nagy was later executed. Though crushed, 1956 made Hungary a symbol of anti-communist resistance throughout the Cold War.'], quiz: { q: 'On what date did the 1956 Hungarian Revolution begin?', opts: ['4 November 1956','23 October 1956','15 March 1956','1 January 1956'], correct: 1 } },
        { title: 'From Communism to Democracy', body: ['After 1956, Hungary developed "goulash communism" under János Kádár — a softer socialism with limited market reforms and more personal freedoms than other Eastern Bloc countries. By the 1980s, economic stagnation and Gorbachev\'s reforms created space for change.', 'In May 1989, Hungary opened its border with Austria — allowing East Germans to flee West, a key domino in the Berlin Wall\'s fall. On 23 October 1989 — the 1956 anniversary — Hungary peacefully proclaimed itself a republic. The first free elections were held in 1990.'], quiz: { q: 'What did Hungary do in May 1989 that helped topple the Iron Curtain?', opts: ['It declared neutrality','It opened its border with Austria','It expelled Soviet troops','It joined NATO early'], correct: 1 } },
      ]},
    ]
  },
  {
    id: 'music', title: 'Classical Music & Piano', icon: '🎹', color: '#bf5af2',
    chapters: [
      { title: 'What is Classical Music?', lessons: [
        { title: 'Defining Classical Music', body: ['Classical music broadly refers to Western art music composed from the Medieval period to the present. More specifically, "Classical" can mean the Classical era (roughly 1750–1820). The music is written in musical notation and performed by trained musicians following the composer\'s score — unlike folk or pop, which are largely oral traditions.', 'Classical music encompasses enormous variety — from intimate solo piano pieces to thundering symphonies with 100 musicians. What unites it is the tradition of precise notation, formal structures, and a canon of masterworks passed down through conservatories and concert halls over centuries.'], quiz: { q: 'What approximate period does the "Classical era" specifically refer to?', opts: ['1600–1700','1750–1820','1820–1900','1900–1950'], correct: 1 } },
        { title: 'Why Piano?', body: ['Piano is often called the ideal first instrument because all of music theory can be visualised on its keyboard. The piano\'s range spans the full orchestra; you can play melody, harmony, and bass simultaneously. And the piano repertoire — from Bach to Chopin to Debussy — is the richest in all of music.', 'Studying classical piano develops discipline, ear training, pattern recognition, and emotional intelligence. Research consistently shows music education improves cognitive function — particularly spatial reasoning, language processing, and working memory. Even as a listener, understanding structure transforms passive hearing into active, deeply satisfying engagement.'], quiz: { q: 'Why is piano often considered the ideal first instrument?', opts: ['It\'s the easiest','It\'s the most popular','All music theory is visible on its keyboard','It\'s the loudest'], correct: 2 } },
        { title: 'How Music Is Structured', body: ['Music is built from rhythm (when notes happen), melody (the tune), harmony (chords — notes played together), and dynamics (loud/soft). Form describes how these elements are organised over time. A sonata has three or four movements; a fugue has a specific structure where melodic lines chase each other.', 'Understanding even basic form dramatically enhances listening. When you recognise the exposition (introduction of themes), development (their transformation), and recapitulation (their return) in a sonata movement, the music tells a story. This architectural understanding is what separates an engaged listener from someone merely enduring background noise.'], quiz: { q: 'In music, what does "dynamics" refer to?', opts: ['The speed','Loud and soft variations','The key signature','The time signature'], correct: 1 } },
      ]},
      { title: 'The Baroque Era (1600–1750)', lessons: [
        { title: 'Johann Sebastian Bach', body: ['Johann Sebastian Bach (1685–1750) is arguably the greatest composer in Western musical history. Working in Germany as a church musician, he composed over 1,100 works — including the Brandenburg Concertos, St Matthew Passion, the Well-Tempered Clavier, and the Goldberg Variations. His music combines intellectual rigour with profound emotional depth.', 'Bach represents the pinnacle of Baroque polyphony — weaving multiple independent melodic lines into a coherent whole. His fugues are masterclasses in logic and beauty. He was not especially famous in his lifetime; his music was largely rediscovered by Felix Mendelssohn in 1829, after which it became the foundation of the entire classical canon.'], quiz: { q: 'Who rediscovered Bach\'s music and brought it back to public attention in 1829?', opts: ['Beethoven','Mozart','Mendelssohn','Chopin'], correct: 2 } },
        { title: 'The Well-Tempered Clavier', body: ['The Well-Tempered Clavier (1722, 1742) is Bach\'s defining keyboard work — two collections of preludes and fugues in all 24 major and minor keys. By demonstrating a keyboard could play equally well in any key, Bach helped standardise equal temperament — the tuning system all modern pianos use.', 'Each prelude-fugue pair has a distinctive character. The C major prelude (BWV 846) — perhaps the most recognised piano piece in all music — is pure flowing arpeggios of deceptive simplicity. The subsequent fugue is austere and complex. All 48 pieces form the most important self-teaching course in Baroque counterpoint.'], quiz: { q: 'What tuning system did the Well-Tempered Clavier help standardise?', opts: ['Just intonation','Pythagorean tuning','Equal temperament','Mean-tone temperament'], correct: 2 } },
        { title: 'The Baroque Sound', body: ['Baroque music (1600–1750) is characterised by elaborate ornamentation (trills, mordents), terraced dynamics (sudden shifts rather than gradual swells), and a rhythmically precise, energetic character. On piano, Baroque music requires clarity of individual voices — the ornamentation is structural, not decorative excess.', 'Key Baroque figures beyond Bach include Handel (Messiah, Water Music), Vivaldi (The Four Seasons), and Domenico Scarlatti, who wrote 555 single-movement keyboard sonatas of astonishing variety. When approaching Baroque piano music, transparency of individual lines matters more than expressive timing flexibility.'], quiz: { q: 'Which famous choral work by Handel is performed every Christmas?', opts: ['The Creation','Elijah','Messiah','Israel in Egypt'], correct: 2 } },
      ]},
      { title: 'Classical & Early Romantic', lessons: [
        { title: 'Haydn & Mozart', body: ['The Classical era moved toward clarity, balance, and formal elegance. Joseph Haydn (1732–1809) is the "Father of the Symphony" — he invented the form as we know it, composing 104 symphonies. Wolfgang Amadeus Mozart (1756–1791) composed over 600 works in 35 years — symphonies, operas, concertos, and piano sonatas of matchless perfection.', 'Mozart\'s music has a luminous clarity that conceals enormous craft. What sounds effortless was achieved through intensive compositional discipline. His piano sonatas — from the simple K. 545 to the turbulent A minor K. 310 — are essential repertoire teaching articulation, voice balance, and Classical phrasing.'], quiz: { q: 'How many symphonies did Haydn compose?', opts: ['41','9','104','32'], correct: 2 } },
        { title: 'Beethoven — The Bridge', body: ['Ludwig van Beethoven (1770–1827) stands at the hinge of Classical and Romantic eras. His early works are firmly Classical; his middle "Heroic" period — the Eroica Symphony, Fifth Symphony, "Waldstein" and "Appassionata" sonatas — expands the form with unprecedented emotional intensity.', 'Beethoven\'s late period is visionary: the last five piano sonatas (Op. 101–111) and string quartets look toward the 20th century in their harmonic daring. He composed most of his greatest works while profoundly deaf — a biographical fact that adds extraordinary weight to music that already stands as civilisation\'s highest achievement.'], quiz: { q: 'What term describes Beethoven\'s heroic middle period?', opts: ['Baroque','Impressionist','Heroic','Late Romantic'], correct: 2 } },
        { title: 'Frédéric Chopin', body: ['Frédéric Chopin (1810–1849) is the poet of the piano. Born in Poland, living in Paris, he composed almost exclusively for solo piano — nocturnes, études, preludes, mazurkas, polonaises, and ballades that form the core of the Romantic piano repertoire.', 'Chopin invented a new piano technique exploiting the instrument\'s unique sustain, with the left hand providing harmonic colour while the right sings like an operatic voice. His use of rubato (expressive flexibility in timing) is essential — his music cannot be played metronomically. The 24 Études Op. 10 and 25 are both concert pieces and the finest piano technical method ever devised.'], quiz: { q: 'In Chopin\'s piano style, what does "rubato" mean?', opts: ['Playing very quietly','Expressive flexibility in timing','Repeating the melody','Loud dramatic playing'], correct: 1 } },
      ]},
      { title: 'The Great Romantics', lessons: [
        { title: 'Franz Liszt', body: ['Franz Liszt (1811–1886) was the most technically brilliant pianist of the 19th century — possibly of all time. His Transcendental Études and Hungarian Rhapsodies pushed the piano\'s limits. Liszt essentially invented the modern piano recital format and performed with showmanship that drove audiences to hysteria.', 'But Liszt was more than a virtuoso. His late works — composed after he took minor holy orders — are austere, visionary pieces of spiritual depth. Harmonically ambiguous and prophetic, they point toward Debussy and Schoenberg. The Années de Pèlerinage (Years of Pilgrimage) is perhaps his greatest achievement.'], quiz: { q: 'What concert format did Franz Liszt essentially invent?', opts: ['The symphony','The chamber concert','The solo piano recital','The opera'], correct: 2 } },
        { title: 'Brahms & Schumann', body: ['Robert Schumann (1810–1856) gave Romantic piano music its most intimate voice. His piano collections — Kinderszenen (Scenes from Childhood), Kreisleriana, Carnaval — are character pieces of extraordinary poetic imagination. Schumann suffered severe mental illness and spent his last years in an asylum, making his music doubly poignant.', 'Johannes Brahms (1833–1897) was the great Classical-Romantic. His two piano concertos are monuments of the repertoire. The late Intermezzi Op. 116–119 are autumnal, introspective masterpieces. Brahms and Schumann were close friends — complicated by Brahms\'s lifelong love for Clara Schumann — one of music\'s great human dramas.'], quiz: { q: 'Which Schumann piano collection is subtitled "Scenes from Childhood"?', opts: ['Kreisleriana','Carnaval','Kinderszenen','Waldszenen'], correct: 2 } },
        { title: 'Debussy & Bartók', body: ['Claude Debussy (1862–1918) liberated music from German Romanticism. Influenced by Impressionist painters and Symbolist poets, he created piano music of shimmering colour and ambiguity — Clair de Lune, Préludes, Images. Debussy broke traditional harmonic rules: instead of tension-resolution, his music floats in atmosphere and sensation.', 'Béla Bartók (1881–1945) is the greatest Hungarian composer. He collected thousands of Hungarian, Romanian, and Bulgarian folk songs and wove them into a completely original language merging modernist harmony with ancient melody. His Mikrokosmos (6 volumes) and Piano Concertos are demanding but revelatory works.'], quiz: { q: 'Which famous Debussy piece is from the Suite bergamasque?', opts: ['Gymnopédies','Clair de Lune','Arabesque','La Campanella'], correct: 1 } },
      ]},
      { title: 'Learning to Listen & Play', lessons: [
        { title: 'An Ideal Listening Journey', body: ['The ideal entry sequence for a new listener: start with Mozart Piano Sonata No. 16 (K. 545) for pure Classical elegance. Then Beethoven\'s "Moonlight" Sonata Op. 27 No. 2 for emotional depth. Move to Chopin\'s Nocturne Op. 9 No. 2 for Romantic lyricism. Then Bach\'s Prelude in C (WTC Book I) for Baroque clarity. Finally, Debussy\'s Clair de Lune for Impressionism.', 'As you listen, pay attention to when themes return and transform, when the music is in tension versus resolution, and how the composer uses silence. Active listening — following the score if possible — turns passive enjoyment into genuine musical understanding. Great recordings: Glenn Gould (Bach), Murray Perahia (Mozart), Maurizio Pollini (Beethoven/Chopin).'], quiz: { q: 'Which Beethoven sonata is nicknamed "Moonlight"?', opts: ['Op. 13 "Pathétique"','Op. 27 No. 2','Op. 57 "Appassionata"','Op. 81a "Les Adieux"'], correct: 1 } },
        { title: 'Starting to Play Piano', body: ['For aspiring players: start with scales and simple five-finger exercises. Learn sight-reading from day one — don\'t rely on YouTube tabs. A teacher for at least the first six months is invaluable for posture and technique. Bad habits formed early are very hard to break.', 'The most important practice habit: slow, hands-separate learning. Every piano master — Horowitz, Pollini, Argerich — learned pieces hands separately before combining them. Practice a difficult passage at 50% speed until it\'s perfect, then gradually increase tempo. Ten minutes of focused, slow practice beats an hour of playing through mistakes at full speed.'], quiz: { q: 'What is the most recommended practice technique for learning a new piano piece?', opts: ['Always play at full speed','Slow, hands-separate practice','Listen to recordings first','Memorise by repetition'], correct: 1 } },
        { title: 'Building Your Musical Ear', body: ['Ear training (aural training) is the practice of recognising musical elements by sound alone — intervals, chords, scales, rhythms. It is as important as reading music or technique, yet often neglected. Apps like Teoria, EarMaster, or Functional Ear Trainer provide structured ear training exercises.', 'The goal of ear training is "audiation" — the ability to hear music in your inner ear without a physical instrument. A musician who can audiate can learn a piece by reading the score, compose music away from the piano, and identify and correct their own mistakes without needing to hear them played back. This inner hearing separates amateurs from professionals.'], quiz: { q: 'What is the term for hearing music in your inner ear without a physical instrument?', opts: ['Pitch recognition','Audiation','Absolute pitch','Sight-singing'], correct: 1 } },
      ]},
    ]
  },
  {
    id: 'ai', title: 'Artificial Intelligence', icon: '🤖', color: '#0A84FF',
    chapters: [
      { title: 'Foundations of AI', lessons: [
        { title: 'What is AI?', body: ['Artificial intelligence is the field of computer science dedicated to creating systems that perform tasks which, if done by a human, would require intelligence. This includes recognising speech, understanding language, identifying images, playing games, making decisions, and generating creative content.', 'AI is not magic — it\'s mathematics and statistics applied at massive scale. Most modern AI systems are trained on vast datasets, learning patterns through repeated exposure rather than following explicit rules. This "learning from data" paradigm (machine learning) has produced systems that outperform humans at chess, medical diagnosis, protein structure prediction, and many other tasks.'], quiz: { q: 'What is the main paradigm behind most modern AI systems?', opts: ['Rule-based programming','Machine learning from data','Symbolic logic','Hard-coded instructions'], correct: 1 } },
        { title: 'A Brief History of AI', body: ['The field of AI was formally founded at the Dartmouth Conference in 1956, where John McCarthy coined the term "artificial intelligence." Early AI focused on symbolic reasoning and rule-based systems. The 1980s saw the rise of "expert systems" encoding human expertise as rules. Several "AI winters" followed when progress stalled and funding dried up.', 'The modern era began around 2012 when deep learning achieved breakthrough results in image recognition. Since then, progress has been exponential: GPT-1 in 2018, GPT-3 in 2020, ChatGPT in 2022, Claude and GPT-4 in 2023. The gap between AI and human performance has narrowed dramatically across nearly every domain.'], quiz: { q: 'In what year was the term "artificial intelligence" coined at the Dartmouth Conference?', opts: ['1945','1950','1956','1969'], correct: 2 } },
        { title: 'Types of AI', body: ['Narrow AI (Weak AI) performs one specific task: a chess engine plays chess, a recommendation system suggests movies, a language model generates text. All AI systems that exist today are narrow AI. They can be superhuman at their specific task but cannot transfer that ability to anything else.', 'Artificial General Intelligence (AGI) would have human-like flexible intelligence — able to learn and apply skills across domains. No one has built AGI. Artificial Superintelligence (ASI) would exceed human intelligence across all domains. Whether AGI or ASI are achievable, and what risks they pose, are among the most important open questions in technology.'], quiz: { q: 'Which type of AI can currently outperform humans at chess?', opts: ['Narrow AI','Artificial General Intelligence','Artificial Superintelligence','Strong AI'], correct: 0 } },
      ]},
      { title: 'Machine Learning', lessons: [
        { title: 'How Machines Learn', body: ['Machine learning is the practice of training a computer system to improve at a task through exposure to data, rather than by programming explicit rules. A spam filter is an example: instead of listing spam rules, you show the system millions of labelled emails and it learns the patterns itself.', 'The core supervised ML workflow: collect labelled data → choose a model → train (adjust parameters to minimise prediction errors) → evaluate on held-out test data → deploy. The "parameters" (weights) are numbers defining how the model transforms inputs to outputs; training finds their optimal values.'], quiz: { q: 'In supervised machine learning, what are the data "labels"?', opts: ['The input features','The correct answers/categories','The model parameters','The training algorithms'], correct: 1 } },
        { title: 'Classical Algorithms', body: ['Classical ML algorithms include Linear Regression (predicting a continuous value), Logistic Regression (binary classification), Decision Trees (branching rules), Random Forests (ensembles of trees), and Support Vector Machines (finding the best boundary between classes). These are interpretable, efficient, and work well with small datasets.', 'k-Nearest Neighbours classifies a new point by majority vote of its k closest training examples. k-Means Clustering groups unlabelled data into k clusters. Principal Component Analysis reduces high-dimensional data to its most informative dimensions. These foundational algorithms remain widely used where interpretability or speed makes deep learning impractical.'], quiz: { q: 'What does a Decision Tree do?', opts: ['Clusters data into groups','Makes predictions using branching rules','Finds boundaries between classes','Reduces data dimensions'], correct: 1 } },
        { title: 'Overfitting & Generalisation', body: ['Overfitting occurs when a model learns the training data too well — including its noise — and fails to generalise to new data. A model that memorises rather than learns will score perfectly on training data but poorly on real-world inputs. It is machine learning\'s most fundamental challenge.', 'Solutions include: collecting more data, regularisation (penalising complexity), dropout (randomly disabling neurons during training), and early stopping. The bias-variance tradeoff captures this: simple models underfit (high bias), complex models overfit (high variance). The goal is always the sweet spot between them.'], quiz: { q: 'What is "overfitting" in machine learning?', opts: ['Training for too few epochs','Using too little data','Learning training data too well, failing to generalise','Using too many features'], correct: 2 } },
      ]},
      { title: 'Neural Networks & Deep Learning', lessons: [
        { title: 'What is a Neural Network?', body: ['A neural network is a computational model loosely inspired by the brain. It consists of layers of units called neurons. An input layer receives data (e.g., pixel values). Hidden layers transform the data through weighted connections. An output layer produces the final prediction (e.g., "cat" or "dog").', 'Each neuron computes a weighted sum of its inputs, passes it through an activation function (such as ReLU: max(0, x)), and sends the result forward. The weights are parameters learned during training. Stacking many layers creates a "deep" neural network. Depth allows progressively abstract feature learning.'], quiz: { q: 'What determines whether a neuron "fires" in a neural network?', opts: ['Loss function','Activation function','Weight matrix','Gradient function'], correct: 1 } },
        { title: 'Training Neural Networks', body: ['Neural networks learn by minimising a loss function — a measure of how wrong predictions are. The algorithm is gradient descent: compute the gradient (direction of steepest increase) of the loss with respect to each weight, then move weights in the opposite direction. Repeat millions of times.', 'Backpropagation efficiently computes these gradients by propagating error backwards through the network layers. In practice, we use mini-batch stochastic gradient descent — computing gradients on small random subsets of training data at each step, making training feasible at massive scale.'], quiz: { q: 'What algorithm efficiently computes gradients through a neural network?', opts: ['Forward propagation','Gradient descent','Backpropagation','Dropout'], correct: 2 } },
        { title: 'CNNs & Computer Vision', body: ['Convolutional Neural Networks (CNNs) dominate image processing. Instead of connecting every neuron to every other — which would require billions of parameters — CNNs use small filters that slide across the image detecting local patterns: edges, textures, and shapes. Deeper layers detect progressively complex features.', 'CNNs achieved a breakthrough in 2012 when AlexNet won the ImageNet competition by a huge margin, triggering the deep learning revolution. Modern CNNs power face recognition, medical image diagnosis, and self-driving car vision. Architectures like ResNet and EfficientNet have improved image classification accuracy to above-human levels.'], quiz: { q: 'What neural network architecture primarily handles image recognition?', opts: ['Recurrent Neural Networks','Transformers','Convolutional Neural Networks','Autoencoders'], correct: 2 } },
      ]},
      { title: 'Large Language Models', lessons: [
        { title: 'The Transformer Architecture', body: ['The Transformer, introduced in Google\'s 2017 paper "Attention Is All You Need," is the foundation of all modern large language models. Its key innovation is the attention mechanism, which allows every part of a sequence to attend to every other part simultaneously — vastly more efficient than older sequential RNNs.', 'Self-attention computes three vectors for each token: Query (what am I looking for?), Key (what do I contain?), Value (what do I contribute?). The attention score between two tokens measures their relevance to each other. This allows the model to capture long-range dependencies across entire documents.'], quiz: { q: 'What 2017 paper introduced the Transformer architecture?', opts: ['Deep Residual Learning','Attention Is All You Need','ImageNet Classification with Deep CNNs','Playing Atari with DRL'], correct: 1 } },
        { title: 'How GPT & Claude Work', body: ['GPT models are trained in two stages. First, pre-training: the model predicts the next word in billions of text documents, implicitly learning language, facts, and reasoning. Second, fine-tuning with RLHF (Reinforcement Learning from Human Feedback): human raters compare outputs and the model learns to produce responses humans prefer.', 'Claude, built by Anthropic, uses Constitutional AI (CAI). Instead of only human feedback, Claude is trained with a set of principles and AI-generated feedback aligned with those principles. Both GPT and Claude are autoregressive: they generate text one token at a time, each token conditioned on all previous tokens.'], quiz: { q: 'What does RLHF stand for?', opts: ['Recurrent Learning from Human Functions','Reinforcement Learning from Human Feedback','Recursive Language from Historical Facts','Robust Language Filtering and Handling'], correct: 1 } },
        { title: 'Prompt Engineering', body: ['Prompt engineering is the art of designing inputs to language models to elicit better outputs. Small changes in phrasing can dramatically affect quality. Key techniques: chain-of-thought (asking the model to "think step by step"), few-shot prompting (providing examples), role prompting ("you are an expert in..."), and specifying output format.', 'A vague prompt like "summarise this" produces a vague output. A specific prompt — "summarise the key contributions of this paper in 3 bullet points for a computer science graduate" — produces a targeted, useful result. The model\'s capability is fixed; the quality of your prompt determines how much of that capability you access.'], quiz: { q: 'What is "few-shot prompting"?', opts: ['Asking the model to be brief','Providing examples in the prompt','Using a small model','Limiting token output'], correct: 1 } },
      ]},
      { title: 'AI in the World', lessons: [
        { title: 'AI Ethics & Bias', body: ['AI systems learn from human-generated data, and humans are biased. A facial recognition system trained predominantly on white male faces performs worse on darker-skinned and female faces — a well-documented real-world problem. Hiring algorithms trained on historical data perpetuate historical discrimination.', 'Beyond bias, AI raises questions of accountability: when an AI system makes a decision (granting a loan, diagnosing a disease), who is responsible for errors? Explainability — making AI decisions interpretable — is both a technical challenge and a legal requirement. The EU AI Act (2024) is the world\'s first comprehensive AI regulation.'], quiz: { q: 'What is the primary source of bias in AI systems?', opts: ['Bugs in the code','Human-generated training data','Computational errors','Model architecture choices'], correct: 1 } },
        { title: 'AI Safety & Alignment', body: ['AI alignment is the problem of ensuring AI systems do what humans actually want — not just what they\'re told. A classic example: an AI trained to maximise "time on platform" might serve outrage-inducing content, not because it\'s malicious but because that maximises its objective.', 'Anthropic, DeepMind, and OpenAI all have dedicated safety research teams. Key areas include interpretability (understanding what happens inside neural networks), robustness (consistent behaviour under adversarial inputs), and scalable oversight (ensuring humans can supervise increasingly capable AI). Whether superintelligent AI poses existential risk is one of the most consequential scientific debates of our time.'], quiz: { q: 'What is the core goal of AI "alignment" research?', opts: ['Making AI faster','Making AI cheaper','Ensuring AI does what humans actually want','Making AI more accurate'], correct: 2 } },
        { title: 'The Future of AI', body: ['The pace of AI progress has surprised even experts. In 2020, few predicted that by 2024 AI systems would generate photorealistic images, write publishable code, pass bar exams, and discover novel scientific results. Current trends: multimodal models combining text, image, audio, and video; AI agents taking actions in the world; and models with ever-longer context windows.', 'Whether AGI arrives in years or decades is genuinely uncertain. What is certain is that AI is already transforming knowledge work, creative fields, scientific research, and education. The most important skill in the AI era is deep domain expertise — AI amplifies deep knowledge while displacing shallow, procedural tasks.'], quiz: { q: 'What is a key trend in modern AI development?', opts: ['Moving to smaller, simpler models','Multimodal models combining different data types','Reducing computational costs','Removing neural networks entirely'], correct: 1 } },
      ]},
    ]
  },
  {
    id: 'swiss', title: 'Swiss History & Politics', icon: '🇨🇭', color: '#30d158',
    chapters: [
      { title: 'Ancient & Medieval Switzerland', lessons: [
        { title: 'The Helvetii & Roman Rule', body: ['The ancestors of the Swiss were the Helvetii, a Celtic tribal confederation occupying the Swiss plateau from around 400 BC. In 58 BC, Julius Caesar defeated the Helvetii at the Battle of Bibracte as they attempted a mass migration — an episode Caesar described in the opening of his Gallic Wars.', 'Under Roman rule (1st century BC–5th century AD), the Swiss plateau was fully integrated into the Empire. Roman towns were established at Augusta Raurica (near Basel), Vindonissa, and Aventicum. Latin became the administrative language, Christianity spread in the 4th century, and Roman roads transformed the landscape.'], quiz: { q: 'Who defeated the Helvetii in 58 BC?', opts: ['Augustus','Pompey','Julius Caesar','Trajan'], correct: 2 } },
        { title: 'The Federal Charter of 1291', body: ['On 1 August 1291, the forest cantons of Uri, Schwyz, and Unterwalden signed the Federal Charter — a mutual defence pact committing them to aid each other against external threats. This document, rediscovered in 1891, was declared the founding act of the Swiss Confederation. 1 August became Switzerland\'s National Day.', 'The legendary story of William Tell — the marksman forced to shoot an apple off his son\'s head by a Habsburg bailiff — encapsulates this early Confederation\'s spirit: ordinary people in the mountains refusing tyranny. Whether historically accurate or not, the legend remains one of Switzerland\'s most powerful national myths.'], quiz: { q: 'What date is celebrated as Switzerland\'s National Day?', opts: ['1 August','14 July','17 September','25 December'], correct: 0 } },
        { title: 'The Confederacy Grows', body: ['The original three cantons were joined by Lucerne (1332), Zürich (1351), Glarus and Zug (1352), and Bern (1353), forming the Eight Cantons. Swiss infantry became the most feared military force in Europe — their pikemen defeated armoured Burgundian knights at Murten and Grandson (1476) against Charles the Bold.', 'Swiss mercenaries were in enormous demand across Europe; the Pope\'s Swiss Guard (established 1506 and still serving today) is the living legacy of this tradition. The Confederation officially gained independence from the Holy Roman Empire in the Peace of Westphalia in 1648.'], quiz: { q: 'When did Switzerland formally gain independence from the Holy Roman Empire?', opts: ['1291','1386','1499','1648'], correct: 3 } },
      ]},
      { title: 'Reformation & Early Modernity', lessons: [
        { title: 'Zwingli & the Swiss Reformation', body: ['The Protestant Reformation came to Switzerland through Huldrych Zwingli (1484–1531) in Zürich, independent of Luther\'s movement in Germany. Zwingli was more radical than Luther — he rejected religious images, relics, and the Mass itself, turning Swiss Reformed worship into austere scripture-centred services. Zürich\'s churches were whitewashed.', 'The Reformation split Switzerland along religious lines that persisted for centuries. Bern, Basel, and Zürich became Protestant; the forest cantons remained Catholic. This split produced war: Zwingli died at the Battle of Kappel (1531) fighting alongside Zürich\'s troops. John Calvin subsequently transformed Geneva into the "Protestant Rome."'], quiz: { q: 'Which reformer brought Protestantism to Zürich?', opts: ['Martin Luther','John Calvin','Huldrych Zwingli','Erasmus'], correct: 2 } },
        { title: 'Neutrality Emerges', body: ['Swiss neutrality was not a founding principle but an evolving practice. After the defeat at Marignano (1515) — where French forces crushed a Swiss army in Italy — the Confederation recognised the limits of military expansion and retreated toward non-aggression. The Thirty Years\' War (1618–1648) confirmed this: Switzerland sat out one of Europe\'s most destructive conflicts.', 'The Peace of Westphalia (1648) formally recognised Swiss independence and effectively acknowledged Swiss neutrality in European power politics. The 18th century saw Switzerland as a peaceful hub — exporting mercenary soldiers (paradoxically), watches, textiles, and Enlightenment ideas. Voltaire lived near Geneva; Rousseau was born there.'], quiz: { q: 'After which defeat did Switzerland move toward a policy of neutrality?', opts: ['Battle of Morgarten','Battle of Marignano','Battle of Kappel','Battle of Grandson'], correct: 1 } },
        { title: 'Napoleon & the Helvetic Republic', body: ['Napoleon invaded Switzerland in 1798, abolished the old Confederation, and imposed the Helvetic Republic — a centralised, French-style unitary state. It was a disaster. Swiss identity was deeply bound to cantonal autonomy; the new system provoked immediate revolts and civil war.', 'After Napoleon\'s defeat (1815), the Congress of Vienna guaranteed Swiss neutrality internationally — a guarantee that has held ever since. The Great Powers preferred a neutral buffer zone to any single power controlling the Alpine passes. Switzerland\'s permanent neutrality was recognised as a pillar of European stability.'], quiz: { q: 'Who imposed the Helvetic Republic on Switzerland in 1798?', opts: ['Kaiser Wilhelm II','Napoleon Bonaparte','Metternich','The Austrian Emperor'], correct: 1 } },
      ]},
      { title: 'The Modern Federal State', lessons: [
        { title: 'The Constitution of 1848', body: ['Switzerland\'s modern political system was born in the Federal Constitution of 1848 — enacted the same year revolution swept Europe, but achieved peacefully (after a brief civil war, the Sonderbund War of 1847, between Catholic and Protestant cantons). The constitution created a federal state balancing central authority with cantonal autonomy.', 'The 1848 constitution was revolutionary: it guaranteed civil liberties, abolished internal customs barriers (creating a single market), established a common currency, and unified the postal and military systems. The capital was placed in Bern as a compromise. Switzerland became a model of peaceful reform while the rest of Europe burned.'], quiz: { q: 'What was Switzerland\'s brief civil war before the 1848 constitution called?', opts: ['The Reformation War','The Sonderbund War','The Alpine Conflict','The Canton Wars'], correct: 1 } },
        { title: 'Neutrality in WWI & WWII', body: ['Switzerland\'s position in WWI was enormously delicate: surrounded by belligerents, with French-speaking Swiss sympathising with France and German-speaking Swiss with cultural ties to Germany. The Swiss army mobilised 220,000 men, maintaining neutrality through constant negotiation. Food shortages caused serious hardship.', 'In WWII, after France\'s fall in 1940, Switzerland was encircled by Axis powers. General Henri Guisan galvanised the nation, and the Swiss prepared the "Réduit" — a fortified Alpine stronghold where the army would fight to the last if invaded. Economic utility (Swiss banking and precision industry) ultimately made invasion more costly than accommodation.'], quiz: { q: 'What was the Swiss "Réduit" in WWII?', opts: ['A diplomatic agreement','A trade deal with Germany','A fortified Alpine defensive position','A neutral zone for prisoners'], correct: 2 } },
        { title: 'The Red Cross & Geneva', body: ['Geneva is home to the International Red Cross — founded by Swiss businessman Henry Dunant after witnessing the carnage of the Battle of Solferino (1859). Dunant organised care for wounded soldiers, then campaigned for an international treaty protecting war casualties. The result was the First Geneva Convention (1864), signed by 12 nations.', 'The Red Cross and the Geneva Conventions made Geneva the world capital of international diplomacy. The UN European headquarters, WHO, WTO, UNHCR, and dozens of other international organisations are based there. Switzerland\'s role as permanent neutral ground for diplomacy has been one of its most valuable contributions to world order.'], quiz: { q: 'Who founded the International Red Cross?', opts: ['Florence Nightingale','Henri Dunant','Clara Barton','Albert Schweitzer'], correct: 1 } },
      ]},
      { title: 'The Swiss Political System', lessons: [
        { title: 'The Federal Council', body: ['Switzerland\'s executive is uniquely collective: the Federal Council consists of seven equal members, each heading a department, making decisions by consensus. There is no single head of government — the Presidency rotates annually among the seven, a largely ceremonial role. No individual can dominate Swiss politics by design.', 'The seven seats are distributed by the "magic formula" — a convention ensuring representation across major parties and linguistic regions. Coalition building is baked in. The result is extraordinary political stability: Switzerland has not had a government crisis in the modern era, and policy changes very gradually by European standards.'], quiz: { q: 'How often does the Swiss Presidency rotate?', opts: ['Every 4 years','Every 2 years','Annually','Every term'], correct: 2 } },
        { title: 'Parliament & the Cantons', body: ['The Swiss Parliament is bicameral. The National Council (200 seats, proportional representation) represents the population. The Council of States (46 seats, 2 per full canton) represents the cantons — analogous to the US Senate. Both chambers must agree on all legislation.', 'Switzerland has 26 cantons, each with its own constitution, parliament, and government. Cantons have substantial autonomy — determining their own tax rates, school systems, and many social policies. Tax competition between cantons is fierce; Zug attracts global companies with low taxes while Geneva hosts international organisations.'], quiz: { q: 'How many seats does the Swiss National Council have?', opts: ['46','100','200','246'], correct: 2 } },
        { title: 'Four Languages, One Nation', body: ['Switzerland has four national languages: German (~63% of the population), French (~23%, in the "Röstigraben" — the cultural divide along the Alps\' western edge), Italian (~8%, in Ticino), and Romansh (~0.5%, in Graubünden). All four are official at the federal level.', 'This multilingualism is not merely symbolic — it reflects genuinely distinct cultural communities with different political instincts. German-speaking Swiss tend to be more Eurosceptic and attached to direct democracy. French-speaking Swiss tend to be more pro-European and socially liberal. These differences regularly appear in referendum results, making Swiss politics a fascinating laboratory for managing diversity within unity.'], quiz: { q: 'What percentage of Switzerland\'s population speaks German?', opts: ['~23%','~8%','~63%','~50%'], correct: 2 } },
      ]},
      { title: 'Direct Democracy & Today', lessons: [
        { title: 'Referendums & Initiatives', body: ['Switzerland is the world\'s leading practitioner of direct democracy. Citizens can trigger a popular referendum on any federal law by collecting 50,000 signatures within 90 days. They can launch a popular initiative — proposing a constitutional amendment — by collecting 100,000 signatures within 18 months. Switzerland holds 3–4 national votes per year.', 'This system has produced landmark decisions: banning minarets (2009), rejecting a minimum wage increase, approving same-sex marriage (2021). Voter fatigue is real — turnout is typically 40–50% — but the system forces politicians to craft legislation that can survive popular challenge.'], quiz: { q: 'How many signatures are needed to trigger a popular referendum on a Swiss federal law?', opts: ['10,000','50,000','100,000','500,000'], correct: 1 } },
        { title: 'Switzerland & the EU', body: ['Switzerland is surrounded by EU member states but is not a member. Instead, it has negotiated over 120 bilateral agreements giving access to EU markets and the Schengen travel zone in exchange for adopting EU regulations in specific areas — without voting rights on those regulations. This "bilaterals" model is unique in Europe.', 'The relationship is increasingly strained. The EU wants a single "framework agreement" replacing the patchwork bilaterals; Switzerland rejected such an agreement in 2021. Switzerland\'s financial sector, pharmaceutical industry, and research universities (ETH Zürich is consistently ranked among Europe\'s best) depend heavily on EU access.'], quiz: { q: 'What is Switzerland\'s unique relationship model with the EU called?', opts: ['Full membership','Associate membership','Bilaterals','EEA membership'], correct: 2 } },
        { title: 'Switzerland Today', body: ['Swiss banking secrecy, enshrined in the Banking Act of 1934, made Switzerland a magnet for foreign capital. The 2008 financial crisis and US pressure forced major changes; subsequent OECD pressure has largely ended banking secrecy for foreign clients. The era of anonymous Swiss banking is over.', 'Modern Switzerland faces challenges: housing costs in Zürich and Geneva are among Europe\'s highest; immigration (foreign-born residents represent ~27% of the population) generates political tension; the collapse of Credit Suisse in 2023 was a reputational blow. Yet Switzerland remains among the world\'s wealthiest, most innovative, and most stable nations — a remarkable achievement for a mountainous country of 8.7 million with no natural resources.'], quiz: { q: 'What major Swiss banking event occurred in 2023?', opts: ['UBS went bankrupt','Switzerland joined the EU','Credit Suisse collapsed and was merged with UBS','Banking secrecy was abolished'], correct: 2 } },
      ]},
    ]
  },
];

// ── LEARN STORAGE ─────────────────────────────
function getLearnData() { try { return JSON.parse(localStorage.getItem(LEARN_LS) || '{}'); } catch { return {}; } }
function setLearnData(patch) { localStorage.setItem(LEARN_LS, JSON.stringify({ ...getLearnData(), ...patch })); }

function markLesson(sid, ci, li) {
  const d = getLearnData();
  const key = `${sid}.${ci}.${li}`;
  const done = new Set(d.done || []);
  if (done.has(key)) return 'already_done';
  done.add(key);
  let xp = (d.xp || 0) + 10;
  const todayStr = todayKey();
  let streak = d.streak || { date: todayStr, count: 0 };
  if (streak.date !== todayStr) {
    const yest = new Date(); yest.setDate(yest.getDate()-1);
    const yStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
    streak = { date: todayStr, count: streak.date === yStr ? streak.count + 1 : 1 };
  }
  setLearnData({ done: [...done], xp, streak });
  const subj = CURRICULUM.find(s => s.id === sid);
  if (subj && subj.chapters[ci].lessons.every((_, i) => done.has(`${sid}.${ci}.${i}`))) {
    setLearnData({ xp: getLearnData().xp + 25 });
    return 'chapter_complete';
  }
  return 'lesson_complete';
}

function isLessonDone(sid, ci, li) { return new Set(getLearnData().done || []).has(`${sid}.${ci}.${li}`); }
function isChapterDone(sid, ci) { const s = CURRICULUM.find(x => x.id === sid); return s ? s.chapters[ci].lessons.every((_, i) => isLessonDone(sid, ci, i)) : false; }
function isChapterUnlocked(sid, ci) { return ci === 0 || isChapterDone(sid, ci - 1); }
function subjectProgress(sid) {
  const s = CURRICULUM.find(x => x.id === sid); if (!s) return { done: 0, total: 0, pct: 0 };
  let done = 0, total = 0;
  s.chapters.forEach((ch, ci) => ch.lessons.forEach((_, li) => { total++; if (isLessonDone(sid, ci, li)) done++; }));
  return { done, total, pct: total ? Math.round(done/total*100) : 0 };
}

// ── LEARN NAV STATE ───────────────────────────
let learnView = 'subjects'; // 'subjects' | 'chapters' | 'lesson'
let learnSid = null, learnCi = null, learnLi = null;
let learnQuizState = null; // null | 'correct' | 'wrong'
let learnChapComplete = false;
let _learnSelOpt = null;

function loadLearn() { renderLearn(); }

function renderLearn() {
  const root = document.getElementById('learnRoot');
  if (!root) return;
  if (learnView === 'subjects') root.innerHTML = buildLearnSubjectsHTML();
  else if (learnView === 'chapters') root.innerHTML = buildLearnChaptersHTML();
  else root.innerHTML = buildLearnLessonHTML();
}

function buildLearnSubjectsHTML() {
  const d = getLearnData(), xp = d.xp || 0, level = Math.floor(xp/100)+1, streak = d.streak?.count||0;
  let html = `<div class="learn-header">
    <div>
      <div style="font-size:22px;font-weight:700">Learn</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">Continue where you left off</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      ${streak>1?`<div style="background:rgba(255,159,10,0.15);border:0.5px solid rgba(255,159,10,0.3);border-radius:20px;padding:5px 10px;font-size:12px;font-weight:700;color:var(--orange)">🔥 ${streak}</div>`:''}
      <div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:20px;padding:6px 14px;text-align:center">
        <div style="font-size:14px;font-weight:800;color:var(--orange)">${xp} XP</div>
        <div style="font-size:10px;color:var(--text3)">Level ${level}</div>
      </div>
    </div>
  </div><div class="learn-subjects">`;
  CURRICULUM.forEach(s => {
    const p = subjectProgress(s.id);
    html += `<div class="subject-card" style="background:linear-gradient(135deg,${s.color}18,${s.color}08);border-color:${s.color}28" onclick="learnOpenSubject('${s.id}')">
      <div class="subject-card-top">
        <div><div style="font-size:32px;margin-bottom:8px">${s.icon}</div><div class="subject-title">${esc(s.title)}</div><div class="subject-meta">${s.chapters.length} chapters · ${p.total} lessons</div></div>
        <div style="text-align:right"><div style="font-size:28px;font-weight:800;color:${s.color}">${p.pct}%</div><div style="font-size:11px;color:var(--text3)">${p.done}/${p.total} done</div></div>
      </div>
      <div class="subject-progress-bar"><div class="subject-progress-fill" style="width:${p.pct}%;background:${s.color}"></div></div>
    </div>`;
  });
  return html + '</div>';
}

function buildLearnChaptersHTML() {
  const s = CURRICULUM.find(x => x.id === learnSid); if (!s) return '';
  const p = subjectProgress(learnSid);
  let html = `<div class="learn-back" onclick="learnBack()"><span style="font-size:20px;color:var(--accent)">‹</span><span style="font-size:15px;font-weight:600;color:var(--accent)">All subjects</span></div>
  <div style="padding:0 16px 16px">
    <div style="font-size:22px;font-weight:800">${s.icon} ${esc(s.title)}</div>
    <div style="font-size:12px;color:var(--text3);margin-top:4px">${p.done}/${p.total} lessons · ${p.pct}% complete</div>
    <div class="subject-progress-bar" style="margin-top:10px"><div class="subject-progress-fill" style="width:${p.pct}%;background:${s.color}"></div></div>
  </div><div class="chapters-section">`;
  s.chapters.forEach((ch, ci) => {
    const unlocked = isChapterUnlocked(learnSid, ci), done = isChapterDone(learnSid, ci);
    const dots = ch.lessons.map((_, li) => `<div class="chapter-dot ${isLessonDone(learnSid,ci,li)?'done':''}"></div>`).join('');
    html += `<div class="chapter-card ${!unlocked?'locked':''}" onclick="${unlocked?`learnOpenChapter(${ci})`:''}">
      <div class="chapter-card-top">
        <span class="chapter-num">Chapter ${ci+1}</span>
        ${done?'<span class="chapter-done-badge">✓ Complete</span>':!unlocked?'<span style="font-size:14px">🔒</span>':''}
      </div>
      <div class="chapter-title">${esc(ch.title)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:5px">${dots}</div>
        <div style="font-size:12px;color:var(--text3)">${ch.lessons.length} lessons</div>
      </div>
    </div>`;
  });
  return html + '</div>';
}

function buildLearnLessonHTML() {
  const s = CURRICULUM.find(x => x.id === learnSid);
  const ch = s?.chapters[learnCi], lesson = ch?.lessons[learnLi]; if (!lesson) return '';
  const done = isLessonDone(learnSid, learnCi, learnLi);
  const nextLesson = ch.lessons[learnLi+1], nextChap = s.chapters[learnCi+1];
  let html = `<div class="learn-back" onclick="learnBack()"><span style="font-size:20px;color:var(--accent)">‹</span><span style="font-size:15px;font-weight:600;color:var(--accent)">${esc(ch.title)}</span></div>
  <div class="lesson-section">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:8px">Lesson ${learnLi+1} of ${ch.lessons.length}</div>
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.4px;line-height:1.2;margin-bottom:18px">${esc(lesson.title)}</div>
    <div class="lesson-body">${lesson.body.map(p=>`<p>${esc(p)}</p>`).join('')}</div>`;

  if (learnChapComplete) {
    html += `<div class="chap-complete">
      <div class="chap-complete-icon">🏆</div>
      <div class="chap-complete-title">Chapter Complete!</div>
      <div class="chap-complete-sub">${esc(ch.title)}</div>
      <div class="chap-complete-xp">+35 XP</div>
      ${nextChap?`<button class="quiz-next-btn" onclick="learnOpenChapter(${learnCi+1})">Next: ${esc(nextChap.title)} →</button>`:`<button class="quiz-next-btn" onclick="learnBack()">Back to ${esc(s.title)}</button>`}
    </div>`;
  } else if (learnQuizState === 'correct') {
    html += `<div class="quiz-card"><div class="quiz-result">
      <div class="quiz-result-icon">✅</div>
      <div class="quiz-result-text" style="color:var(--green)">Correct! +10 XP</div>
      ${nextLesson?`<button class="quiz-next-btn" onclick="learnNextLesson()">Next: ${esc(nextLesson.title)} →</button>`:`<button class="quiz-next-btn" onclick="learnNextLesson()">Finish Chapter →</button>`}
    </div></div>`;
  } else if (learnQuizState === 'wrong') {
    html += `<div class="quiz-card"><div class="quiz-label">Quick check</div><div class="quiz-q">${esc(lesson.quiz.q)}</div><div class="quiz-opts">`;
    lesson.quiz.opts.forEach((opt,i) => { const cls = i===lesson.quiz.correct?'correct':i===_learnSelOpt?'wrong':''; html += `<button class="quiz-opt ${cls}" disabled>${esc(opt)}</button>`; });
    html += `</div><div class="quiz-result" style="padding-top:12px"><div class="quiz-result-icon">❌</div><div class="quiz-result-text" style="color:var(--red)">Not quite — try again!</div><button class="quiz-retry-btn" onclick="learnRetry()">Try again</button></div></div>`;
  } else if (done) {
    html += `<div class="quiz-card"><div class="quiz-result"><div class="quiz-result-icon">✅</div><div class="quiz-result-text" style="color:var(--text2)">Already completed</div>${nextLesson?`<button class="quiz-next-btn" onclick="learnNextLesson()">Next: ${esc(nextLesson.title)} →</button>`:''}</div></div>`;
  } else {
    html += `<div class="quiz-card"><div class="quiz-label">Quick check</div><div class="quiz-q">${esc(lesson.quiz.q)}</div><div class="quiz-opts">`;
    lesson.quiz.opts.forEach((opt,i) => { html += `<button class="quiz-opt" onclick="learnSelectOpt(${i})">${esc(opt)}</button>`; });
    html += '</div></div>';
  }
  return html + '</div>';
}

function learnOpenSubject(sid) { learnSid=sid; learnView='chapters'; learnCi=null; learnLi=null; renderLearn(); document.getElementById('content').scrollTop=0; }

function learnOpenChapter(ci) {
  learnCi=ci; learnQuizState=null; learnChapComplete=false;
  const ch = CURRICULUM.find(s=>s.id===learnSid)?.chapters[ci];
  let first=0; if (ch) { for(let i=0;i<ch.lessons.length;i++){if(!isLessonDone(learnSid,ci,i)){first=i;break;} first=ch.lessons.length-1;} }
  learnLi=first; learnView='lesson'; renderLearn(); document.getElementById('content').scrollTop=0;
}

function learnSelectOpt(i) {
  const lesson = CURRICULUM.find(s=>s.id===learnSid)?.chapters[learnCi]?.lessons[learnLi]; if (!lesson) return;
  _learnSelOpt=i;
  if (i===lesson.quiz.correct) {
    const result = markLesson(learnSid, learnCi, learnLi);
    learnChapComplete = result==='chapter_complete';
    learnQuizState='correct';
    showXPPop(learnChapComplete?'+35 XP':'+ 10 XP');
  } else { learnQuizState='wrong'; }
  renderLearn();
}

function learnRetry() { learnQuizState=null; _learnSelOpt=null; renderLearn(); }

function learnNextLesson() {
  const s = CURRICULUM.find(x=>x.id===learnSid), ch = s?.chapters[learnCi];
  if (learnChapComplete) { learnView='chapters'; learnCi=null; learnLi=null; }
  else if (ch && learnLi < ch.lessons.length-1) { learnLi++; learnQuizState=null; learnChapComplete=false; }
  else { learnView='chapters'; }
  renderLearn(); document.getElementById('content').scrollTop=0;
}

function learnBack() {
  if (learnView==='lesson') { learnView='chapters'; learnLi=null; learnQuizState=null; learnChapComplete=false; }
  else if (learnView==='chapters') { learnView='subjects'; learnSid=null; learnCi=null; }
  renderLearn(); document.getElementById('content').scrollTop=0;
}

function showXPPop(text) {
  const el=document.createElement('div'); el.className='xp-pop'; el.textContent=text;
  document.body.appendChild(el); setTimeout(()=>el.remove(),1500);
}

// ── NAV ───────────────────────────────────────
let dailyLoaded = false, learnLoaded = false;
let currentTab = 'home';
const tabScrollPos = {};
const MORE_PANES = ['daily', 'learn', 'photos', 'settings'];

function goTab(name, el) {
  tabScrollPos[currentTab] = document.getElementById('content').scrollTop;

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-' + name).classList.add('active');

  // More-sub-panes keep the More tab highlighted
  if (MORE_PANES.includes(name)) {
    document.getElementById('moreTab').classList.add('active');
  } else {
    el.classList.add('active');
  }

  currentTab = name;
  document.getElementById('content').scrollTop = tabScrollPos[name] || 0;

  if (name === 'finance') loadFinance();
  if (name === 'home') loadVisibleHomeCards();
  if (name === 'daily' && !dailyLoaded) { dailyLoaded = true; loadDaily(); }
  if (name === 'learn' && !learnLoaded) { learnLoaded = true; loadLearn(); }
  if (name === 'photos') renderPhotoTab();
  if (name === 'settings') renderSettings();

  // Highlight active item in More sheet
  document.querySelectorAll('.more-item').forEach(i => i.classList.remove('active-section'));
  const moreItemMap = { daily:'moreItemDaily', learn:'moreItemLearn', photos:'moreItemPhotos', settings:'moreItemSettings' };
  if (moreItemMap[name]) document.getElementById(moreItemMap[name])?.classList.add('active-section');
}

// ── MORE SHEET ────────────────────────────────
function openMore() {
  document.getElementById('moreSheet').classList.add('open');
}
function closeMore() {
  document.getElementById('moreSheet').classList.remove('open');
}
function goTabFromMore(name) {
  closeMore();
  goTab(name, document.getElementById('moreTab'));
}

// ── HOME CARD VISIBILITY ──────────────────────
const HOME_HIDDEN_LS = 'atd_home_hidden';
function getHiddenCards() {
  const stored = localStorage.getItem(HOME_HIDDEN_LS);
  if (stored === null) return ['footballCard'];
  try { return JSON.parse(stored); } catch { return []; }
}
function applyHomeVisibility() {
  const hidden = getHiddenCards();
  ['weatherCard','morningBriefCard','clubEventsCard','spotifyCard','footballCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = hidden.includes(id) ? 'none' : '';
  });
}
function settingsToggleHomeCard(cardId) {
  const hidden = getHiddenCards();
  const idx = hidden.indexOf(cardId);
  if (idx === -1) hidden.push(cardId); else hidden.splice(idx, 1);
  localStorage.setItem(HOME_HIDDEN_LS, JSON.stringify(hidden));
  applyHomeVisibility();
  if (!hidden.includes(cardId)) loadHomeCard(cardId, true);
  renderSettings();
}

// ── SETTINGS ACTIONS ─────────────────────────
function settingsClearTmdbKey() {
  localStorage.removeItem(TMDB_LS);
  renderSettings();
}
function settingsClearDailyCache() {
  const d = getDailyData(); delete d[todayKey()]; setDailyData(d);
  renderSettings();
}
function settingsClearFinanceCache() {
  localStorage.removeItem(FIN_LS); localStorage.removeItem(WEEKLY_LS);
  renderSettings();
}
function settingsClearEventsCache() {
  localStorage.removeItem(EVENTS_LS);
  renderSettings();
}
function settingsClearCompletedTasks() {
  putTasks(getTasks().filter(t => !t.done));
  renderTasks(); renderSettings();
}
function settingsResetLearn() {
  if (!confirm('Reset all learning progress?')) return;
  localStorage.removeItem(LEARN_LS);
  learnLoaded = false;
  renderSettings();
}
async function settingsClearPhotos() {
  if (!confirm('Clear all saved photos?')) return;
  await clearPhotos();
  renderPhotoTab();
  renderSettings();
}
async function settingsClearAll() {
  if (!confirm('Clear ALL app data? This cannot be undone.')) return;
  await deletePhotoDb();
  localStorage.clear(); location.reload();
}

// ── RENDER SETTINGS ──────────────────────────
async function renderSettings() {
  const el = document.getElementById('settingsContent');
  if (!el) return;

  const spConnected = !!spGet('clientId');
  const tmdbKey = !!getTmdbKey();
  const hidden = getHiddenCards();
  const theme = localStorage.getItem(THEME_LS) || '';
  const tasks = getTasks();
  const doneTasks = tasks.filter(t => t.done).length;
  const photoCount = await getPhotoCount();

  const finCache = getFinCache();
  const finAge = finCache ? Math.round((Date.now() - finCache.ts) / 60000) : null;
  const finAgeStr = finAge === null ? 'No data' : finAge < 1 ? 'Just now' : finAge < 60 ? `${finAge}m ago` : `${Math.floor(finAge/60)}h ago`;

  let eventsAgeStr = 'No cache';
  try {
    const ec = JSON.parse(localStorage.getItem(EVENTS_LS) || '{}');
    if (ec.ts) { const a = Math.round((Date.now()-ec.ts)/60000); eventsAgeStr = a<1?'Just now':a<60?`${a}m ago`:`${Math.floor(a/60)}h ago`; }
  } catch {}

  const td = getTodayData();
  const dailyCached = Object.keys(td).length > 0;

  let learnCount = 0;
  try {
    const ld = JSON.parse(localStorage.getItem(LEARN_LS) || '{}');
    learnCount = (ld.done || []).length;
  } catch {}

  const homeCards = [
    { id:'weatherCard', label:'Weather' },
    { id:'morningBriefCard', label:'Morning Brief' },
    { id:'clubEventsCard', label:'Upcoming Events' },
    { id:'spotifyCard', label:'Spotify' },
    { id:'footballCard', label:'Football' },
  ];

  const tog = (id, on) => `<label class="tog" onclick="event.stopPropagation()">
    <input type="checkbox" ${on?'checked':''} onchange="settingsToggleHomeCard('${id}')">
    <div class="tog-track"></div>
  </label>`;

  const btn = (label, fn, danger) =>
    `<button class="settings-btn${danger?' danger':''}" onclick="${fn}">${label}</button>`;
  const meta = t => `<span class="settings-meta">${t}</span>`;

  el.innerHTML = `
    <div class="settings-section-title">Appearance</div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Theme</span>
          <span class="settings-row-sub">${theme==='sakura'?'Sakura 🌸':'Dark 🌑'}</span>
        </div>
        ${btn('Switch','toggleTheme();renderSettings()')}
      </div>
    </div>

    <div class="settings-section-title">Home Cards</div>
    <div class="settings-card">
      ${homeCards.map(c=>`<div class="settings-row">
        <span class="settings-row-label">${c.label}</span>
        ${tog(c.id,!hidden.includes(c.id))}
      </div>`).join('')}
    </div>

    <div class="settings-section-title">AI & Integrations</div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Gemini AI</span>
          <span class="settings-row-sub">Ready through the Vercel API route — no user setup needed</span>
        </div>
        ${meta('Included')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Finnhub market data</span>
          <span class="settings-row-sub">Ready through the Vercel API route — no user setup needed</span>
        </div>
        ${meta('Included')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Spotify</span>
          <span class="settings-row-sub">${spConnected?'Connected':'Not connected'}</span>
        </div>
        ${spConnected?btn('Disconnect','disconnectSpotify();renderSettings()',true):meta('Not connected')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">TMDB (Movie of the day)</span>
          <span class="settings-row-sub">${tmdbKey?'Key saved':'Not set'}</span>
        </div>
        ${tmdbKey?btn('Remove','settingsClearTmdbKey()',true):meta('Not set')}
      </div>
    </div>

    <div class="settings-section-title">Data on this device</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;padding:0 2px;line-height:1.5">App preferences and personal entries are stored on this device. Live data and AI prompts are sent only to the public APIs you enable.</div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Daily content</span>
          <span class="settings-row-sub">${dailyCached?'Cached for today':'Not loaded'}</span>
        </div>
        ${btn('Clear','settingsClearDailyCache()')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Finance data</span>
          <span class="settings-row-sub">Updated ${finAgeStr}</span>
        </div>
        ${btn('Clear','settingsClearFinanceCache()')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Club events</span>
          <span class="settings-row-sub">Updated ${eventsAgeStr}</span>
        </div>
        ${btn('Clear','settingsClearEventsCache()')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Tasks</span>
          <span class="settings-row-sub">${tasks.length} total · ${doneTasks} completed</span>
        </div>
        ${doneTasks?btn('Clear done','settingsClearCompletedTasks()'):meta('None done')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Photos</span>
          <span class="settings-row-sub">${photoCount} day${photoCount!==1?'s':''} captured — stored locally in IndexedDB</span>
        </div>
        ${photoCount?btn('Clear','settingsClearPhotos()',true):meta('None yet')}
      </div>
      <div class="settings-row">
        <div class="settings-row-left">
          <span class="settings-row-label">Learn progress</span>
          <span class="settings-row-sub">${learnCount} lesson${learnCount!==1?'s':''} completed</span>
        </div>
        ${learnCount?btn('Reset','settingsResetLearn()',true):meta('None yet')}
      </div>
    </div>

    <div style="margin-top:12px">
      <button style="width:100%;padding:14px;background:rgba(255,69,58,0.07);border:0.5px solid rgba(255,69,58,0.3);border-radius:12px;color:var(--red);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="settingsClearAll()">Clear all app data</button>
    </div>
    <div style="text-align:center;margin-top:28px;font-size:12px;color:var(--text3)">Attila's Daily · All data stays on this device</div>
  `;
}

// ── THEME ─────────────────────────────────────
const THEME_LS = 'atd_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || '');
  const btn = document.getElementById('themeBtn');
  if (theme === 'sakura') {
    btn.textContent = '🌑';
    btn.title = 'Switch to dark theme';
  } else {
    btn.textContent = '🌸';
    btn.title = 'Switch to Sakura theme';
  }
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_LS) || '';
  const next = current === 'sakura' ? '' : 'sakura';
  localStorage.setItem(THEME_LS, next);
  applyTheme(next);
}

// Apply saved theme on load
applyTheme(localStorage.getItem(THEME_LS) || '');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'activated') location.reload();
      });
    });
  }).catch(() => {});
  // Check for updates every time the app becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then(reg => reg && reg.update());
    }
  });
}
