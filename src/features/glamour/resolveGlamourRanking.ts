import type { SnapshotItem } from '../../lib/itemSnapshot';

export interface RawGlamourEntry {
  item: string;
  uses: number;
}

export interface ResolvedGlamourItem {
  id: number;
  name: string;
  sc: number;
  ilvl: number;
  rarity?: number;
  uses: number;
}

export interface GlamourResolution {
  rows: ResolvedGlamourItem[];
  matched: number;
  unmatched: number;
  untradeable: number;
}

/**
 * Normalize an item name for matching: NFKC, drop the HQ glyph (U+E03C) and a
 * trailing "(HQ)", lowercase, trim, collapse internal whitespace.
 */
function normalize(name: string): string {
  return name
    .normalize('NFKC')
    .replace(new RegExp('\\uE03C', 'g'), '')
    .replace(/\s*\(hq\)\s*$/i, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function toItemArray(src: SnapshotItem[] | Map<number, SnapshotItem>): SnapshotItem[] {
  return Array.isArray(src) ? src : [...src.values()];
}

/**
 * Join scraped glamour item names to the item snapshot. Drops untradeable
 * (sc === 0) and unmatched names, counting each for a transparency footnote.
 * Output rows are sorted by uses desc, then name asc (deterministic).
 */
export function resolveGlamourRanking(
  ranking: RawGlamourEntry[],
  items: SnapshotItem[] | Map<number, SnapshotItem>,
): GlamourResolution {
  const byName = new Map<string, SnapshotItem>();
  for (const it of toItemArray(items)) {
    if (!it.name) continue;
    const key = normalize(it.name);
    const existing = byName.get(key);
    if (!existing || it.id < existing.id) byName.set(key, it);
  }

  const rows: ResolvedGlamourItem[] = [];
  let matched = 0;
  let unmatched = 0;
  let untradeable = 0;

  for (const entry of ranking) {
    if (!entry || typeof entry.item !== 'string' || typeof entry.uses !== 'number') continue;
    const key = normalize(entry.item);
    if (key === '') continue;
    const hit = byName.get(key);
    if (!hit) {
      unmatched++;
      continue;
    }
    if (hit.sc === 0) {
      untradeable++;
      continue;
    }
    matched++;
    rows.push({
      id: hit.id,
      name: hit.name,
      sc: hit.sc,
      ilvl: hit.ilvl,
      rarity: hit.rarity,
      uses: entry.uses,
    });
  }

  rows.sort((a, b) => (b.uses - a.uses) || a.name.localeCompare(b.name));
  return { rows, matched, unmatched, untradeable };
}
