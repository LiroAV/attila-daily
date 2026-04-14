export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const url = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
  if (!url) { res.status(400).json({ error: 'Missing url' }); return; }

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) { res.status(502).json({ error: `Feed returned ${r.status}` }); return; }

    const xml = await r.text();

    // Feed title — first <title> inside <channel>
    const chanMatch = xml.match(/<channel[\s>]([\s\S]*)/i);
    const chanBlock = chanMatch ? chanMatch[1] : xml;
    const feedTitle = (chanBlock.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim();

    // Parse items
    const items = [];
    const itemRx = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRx.exec(xml)) !== null && items.length < 8) {
      const block = m[1];

      // Text content of a tag, strips CDATA
      const get = (tag) => {
        const rx = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
        return (block.match(rx)?.[1] || '').trim();
      };

      // Audio URL: try <enclosure url="...">, then <media:content url="...">, then <link>
      const enclosureUrl =
        block.match(/<enclosure[^>]+url="([^"]+)"/i)?.[1] ||
        block.match(/<enclosure[^>]+url='([^']+)'/i)?.[1] ||
        block.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ||
        block.match(/<media:content[^>]+url='([^']+)'/i)?.[1] ||
        '';

      const duration = (block.match(/<itunes:duration[^>]*>([^<]+)<\/itunes:duration>/i))?.[1]?.trim() || '';
      const title = get('title');
      const pubDate = get('pubDate');

      if (!title || !enclosureUrl) continue;
      items.push({ title, url: enclosureUrl, date: pubDate, duration });
    }

    if (!items.length) {
      res.status(502).json({ error: 'Feed parsed but no audio episodes found — check the RSS URL is a podcast feed' });
      return;
    }

    res.setHeader('Cache-Control', 's-maxage=7200');
    res.status(200).json({ feedTitle, items });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Failed to fetch feed' });
  }
}
