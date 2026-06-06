# Refreshing the Glamour Demand data

The Glamour Demand page reads `public/data/snapshots/glamours.json`, a ranking of
gear by how often it appears across Eorzea Collection's all-time most-loved
glamours. Refresh it roughly monthly and commit the result.

## ⚠️ Cloudflare blocks plain HTTP scraping

`ffxiv.eorzeacollection.com` is behind Cloudflare's JavaScript challenge. A plain
HTTP client (the `httpx`-based `scripts/scrape_glamours.py`) gets **HTTP 403** on
every request — it cannot fetch live data. The Python script is kept only as a
reference for the parsing logic. **Use the browser-based method below.**

## Working method: real browser + in-page fetch

A real browser passes the Cloudflare challenge and receives a `cf_clearance`
cookie. Once it has, a **same-origin `fetch()` from inside the page** carries that
cookie and succeeds — so the whole scrape can run in the page context, no
per-page navigation needed.

Steps (e.g. via the Playwright MCP, or any real/automated browser devtools):

1. Navigate to:
   `https://ffxiv.eorzeacollection.com/glamours/loved?filter[orderBy]=loves&filter[datePeriod]=any&page=1`
   Confirm the page title is "Glamour Collection | Eorzea Collection" (not a
   Cloudflare challenge page).

2. Run this once per page (`page=1..10`), accumulating into a `window` global so
   counts survive across calls. ~36 glamours/page; keep a polite delay
   (~300 ms) between detail fetches:

   ```js
   async () => {
     const BASE = 'https://ffxiv.eorzeacollection.com';
     const sleep = (ms) => new Promise(r => setTimeout(r, ms));
     const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
     if (!window.__glam) window.__glam = { counts: {}, page: 1, totalGlamours: 0, errors: 0 };
     const g = window.__glam, p = g.page;
     const lr = await fetch(`${BASE}/glamours/loved?filter[orderBy]=loves&filter[datePeriod]=any&page=${p}`, { credentials: 'same-origin' });
     const hrefs = [...parse(await lr.text()).querySelectorAll('article.c-glamour-grid-item')]
       .map(a => a.querySelector('a.c-glamour-grid-item-link')?.getAttribute('href')).filter(Boolean);
     for (const href of hrefs) {
       try {
         const ddoc = parse(await (await fetch(BASE + href, { credentials: 'same-origin' })).text());
         ddoc.querySelectorAll('.gear-icon-box-slot-name-wrapper').forEach(w => {
           const el = w.parentElement?.querySelector('.list-item-title');
           const name = el && el.textContent.trim();
           if (name) g.counts[name] = (g.counts[name] || 0) + 1;
         });
         g.totalGlamours++;
       } catch { g.errors++; }
       await sleep(300);
     }
     g.page++;
     return { page: p, totalGlamours: g.totalGlamours, unique: Object.keys(g.counts).length, errors: g.errors };
   }
   ```

3. After all 10 pages, emit the file in the exact output format:

   ```js
   () => {
     const g = window.__glam;
     const ranking = Object.entries(g.counts).map(([item, uses]) => ({ item, uses }))
       .sort((a, b) => b.uses - a.uses);
     return { generated_at: new Date().toISOString(), pages_scraped: 10,
              glamours_checked: g.totalGlamours, unique_items: ranking.length, ranking };
   }
   ```

   Save the returned object to `public/data/snapshots/glamours.json`.

4. Commit the refreshed `glamours.json` and deploy.

## Output format

```json
{ "generated_at": "ISO-8601-UTC", "ranking": [ { "item": "Name", "uses": 87 } ] }
```

`generated_at` drives the "Scraped X ago" freshness line; `ranking` is the
appearance-count ranking (one increment per glamour an item appears in). The
other fields (`pages_scraped`, `glamours_checked`, `unique_items`) are
informational and ignored by the app.

## How the app uses it

- `loadStaticGlamourRanking()` (`src/lib/staticSnapshots.ts`) fetches the file.
- `resolveGlamourRanking()` (`src/features/glamour/resolveGlamourRanking.ts`)
  joins scraped names to the item snapshot: it normalizes names (strips the HQ
  glyph, case, whitespace), drops untradeable items (`sc === 0`) and names with
  no item match, and counts both for the page's transparency footnote.
- The page then fetches marketboard price + velocity for the matched items.

In the first real scrape (2026-06-06, 360 glamours, 1222 unique items), **all
names matched** and ~74% were untradeable (hidden by design). If many names show
as "unmatched" after a future refresh, the item snapshot is likely older than the
gear referenced (e.g. a brand-new patch) — re-bake with `npm run snapshots`.
