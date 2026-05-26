import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

export interface IconMappingEntry {
  label: string;
  filename: string;
}

export function extractSectionMapping(html: string, headlineId: string): IconMappingEntry[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const headline = doc.querySelector(`span.mw-headline[id="${headlineId}"]`);
  if (!headline) return [];
  const heading = headline.closest('h1, h2, h3, h4, h5, h6');
  if (!heading) return [];

  const results: IconMappingEntry[] = [];
  let cur = heading.nextElementSibling;
  while (cur && !/^H[1-6]$/.test(cur.tagName)) {
    if (cur.tagName === 'TABLE') {
      const rows = cur.querySelectorAll('tr');
      for (const row of Array.from(rows)) {
        const img = row.querySelector('img');
        const cells = row.querySelectorAll('td');
        if (!img || cells.length < 2) continue;
        const src = img.getAttribute('src');
        if (!src) continue;
        const filename = basename(src);
        const label = (cells[1].textContent ?? '').trim();
        if (filename && label) results.push({ label, filename });
      }
    }
    cur = cur.nextElementSibling;
  }
  return results;
}

const HTML_PATH = "Dictionary of Icons - Gamer Escape's Final Fantasy XIV (FFXIV, FF14) wiki.html";

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('extract-icon-mapping.ts')) {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: tsx scripts/extract-icon-mapping.ts <headlineId>');
    console.error('Common ids: Disciple_of_Land.2FHand_Class_Icons, Currency, Quest_Types');
    process.exit(1);
  }
  if (!existsSync(HTML_PATH)) {
    console.error(`HTML file not found at ${HTML_PATH}`);
    process.exit(2);
  }
  const html = readFileSync(HTML_PATH, 'utf8');
  const entries = extractSectionMapping(html, id);
  console.log(`// ${entries.length} entries for ${id}`);
  for (const e of entries) console.log(JSON.stringify(e));
}
