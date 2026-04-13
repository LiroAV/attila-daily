const IC_UZH_API = 'https://www.icuzh.ch/api/events?page=1&limit=50';
const FVOEC_API = 'https://api.fvoec.ch/v1/events?lang=de';
const FVOEC_EVENTS_URL = 'https://fvoec.ch/events';
const UZHACK_SCHEDULE_URL = 'https://uzhack.com/schedule';
const UZHACK_FALLBACK = [
  { date: '04', month: 'Mar', title: 'Modern Social Engineering', location: 'BIN 1.D.29' },
  { date: '11', month: 'Mar', title: 'Wireless Network Intelligence', location: 'BIN 1.D.29' },
  { date: '18', month: 'Mar', title: 'Radio Frequency Security', location: 'BIN 1.D.29' },
  { date: '25', month: 'Mar', title: 'Game Security & Memory', location: 'BIN 1.D.29' },
  { date: '01', month: 'Apr', title: 'Hardware Security Analysis', location: 'BIN 1.D.29' },
  { date: '08', month: 'Apr', title: 'Physical Access Vectors', location: 'BIN 1.D.29' },
  { date: '15', month: 'Apr', title: 'Creating Your Own Botnet', location: 'BIN 1.D.29' },
  { date: '22', month: 'Apr', title: 'System Integrity & Boot', location: 'BIN 1.D.29' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const results = await Promise.allSettled([
    fetchIcUzh(),
    fetchFvoec(),
    fetchUzhack(),
  ]);

  const [icuzh, fvoec, uzhack] = results.map(result => (
    result.status === 'fulfilled' ? result.value : null
  ));

  res.status(200).json({
    events: { icuzh, fvoec, uzhack },
    ts: Date.now()
  });
}

async function fetchIcUzh() {
  const data = await fetchJson(IC_UZH_API);
  const upcoming = (data.docs || [])
    .filter(event => event._status === 'published' && new Date(event.start) >= new Date())
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const event = upcoming[0];
  if (!event) return null;

  return {
    title: event.name,
    start: event.start,
    location: event.location?.address || event.location?.onlineUrl || '',
    url: 'https://www.icuzh.ch/events'
  };
}

async function fetchFvoec() {
  const data = await fetchJson(FVOEC_API);
  const upcoming = (Array.isArray(data) ? data : [])
    .map(event => ({
      ...event,
      startIso: toZurichIso(event.startDate, event.startTime || '00:00')
    }))
    .filter(event => event.startIso && new Date(event.startIso) >= new Date())
    .sort((a, b) => new Date(a.startIso) - new Date(b.startIso));

  const event = upcoming[0];
  if (!event) return null;

  return {
    title: event.title,
    start: event.startIso,
    location: event.location || '',
    url: event.slug ? `${FVOEC_EVENTS_URL}/${event.slug}` : FVOEC_EVENTS_URL
  };
}

async function fetchUzhack() {
  let schedule = UZHACK_FALLBACK;
  let year = 2026;

  try {
    const html = await fetchText(UZHACK_SCHEDULE_URL);
    const assetPath = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
    if (assetPath) {
      const assetUrl = new URL(assetPath, UZHACK_SCHEDULE_URL).href;
      const js = await fetchText(assetUrl);
      year = Number(js.match(/SPRING\s+(\d{4})/)?.[1]) || year;
      const rawSchedule = js.match(/Yk=\[(.*?)\],qk=/s)?.[1] || '';
      const parsed = [...rawSchedule.matchAll(/\{date:"([^"]+)",month:"([^"]+)",title:"([^"]+)",type:"[^"]*",category:"[^"]*",location:"([^"]+)"/g)]
        .map(match => ({ date: match[1], month: match[2], title: match[3], location: match[4] }));
      if (parsed.length) schedule = parsed;
    }
  } catch {}

  const upcoming = schedule
    .map(event => ({
      ...event,
      startIso: toZurichIso(`${year}-${monthNumber(event.month)}-${event.date}`, '17:30')
    }))
    .filter(event => event.startIso && new Date(event.startIso) >= new Date())
    .sort((a, b) => new Date(a.startIso) - new Date(b.startIso));

  const event = upcoming[0];
  if (!event) return null;

  return {
    title: event.title,
    start: event.startIso,
    location: event.location || '',
    url: UZHACK_SCHEDULE_URL
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.text();
}

function monthNumber(month) {
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  return months[month] || '01';
}

function toZurichIso(dateText, timeText) {
  if (!dateText) return '';
  const safeTime = /^\d{2}:\d{2}$/.test(timeText || '') ? timeText : '00:00';
  const guess = new Date(`${dateText}T${safeTime}:00Z`);
  if (Number.isNaN(guess.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(guess).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  const zonedAsUtc = Date.UTC(parts.year, Number(parts.month) - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = zonedAsUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
}
