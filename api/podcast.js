export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const url = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
  if (!url) { res.status(400).json({ error: 'Missing url' }); return; }

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PodcastReader/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { res.status(502).json({ error: `Feed returned ${r.status}` }); return; }

    const xml = await r.text();

    // Feed title
    const feedTitle = (xml.match(/<channel[^>]*>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();

    // Parse items
    const items = [];
    const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRx.exec(xml)) !== null && items.length < 8) {
      const block = m[1];
      const get = (tag) => {
        const r = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
        return r ? r[1].trim() : '';
      };
      const enclosureUrl = (block.match(/<enclosure[^>]+url="([^"]+)"/i) || block.match(/<enclosure[^>]+url='([^']+)'/i))?.[1] || '';
      const duration = (block.match(/<itunes:duration[^>]*>([^<]+)<\/itunes:duration>/i))?.[1]?.trim() || '';
      const pubDate = get('pubDate');
      const title = get('title');
      if (!title || !enclosureUrl) continue;
      items.push({ title, url: enclosureUrl, date: pubDate, duration });
    }

    res.setHeader('Cache-Control', 's-maxage=7200');
    res.status(200).json({ feedTitle, items });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Failed to fetch feed' });
  }
}
