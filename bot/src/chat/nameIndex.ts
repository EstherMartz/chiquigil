export interface NameEntry {
  id: number;
  name: string;
  lower: string;
}

export type NameIndex = Map<string, number> & { _entries: NameEntry[] };

export function buildNameIndex(namesById: Map<number, string>): NameIndex {
  const map = new Map<string, number>() as NameIndex;
  const entries: NameEntry[] = [];
  for (const [id, name] of namesById) {
    const lower = name.toLowerCase();
    map.set(lower, id);
    entries.push({ id, name, lower });
  }
  entries.sort((a, b) => a.lower.localeCompare(b.lower));
  map._entries = entries;
  return map;
}

export interface SearchResult {
  id: number;
  name: string;
}

export function searchItems(index: NameIndex, query: string, limit = 5): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const exactId = index.get(q);
  if (exactId != null) {
    const entry = index._entries.find((e) => e.id === exactId)!;
    return [{ id: entry.id, name: entry.name }];
  }

  const results: SearchResult[] = [];
  for (const entry of index._entries) {
    if (entry.lower.includes(q)) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Fuzzy search: splits the query into words and returns items whose name
 * contains ALL words (in any order). Falls back to single-word partial
 * matches if multi-word yields nothing. Useful for free-text modal input.
 */
export function fuzzySearchItems(index: NameIndex, query: string, limit = 10): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // First try the normal substring search
  const exact = searchItems(index, q, limit);
  if (exact.length > 0) return exact;

  // Split into words and match all
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const results: SearchResult[] = [];
  for (const entry of index._entries) {
    if (words.every((w) => entry.lower.includes(w))) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  if (results.length > 0) return results;

  // Last resort: match ANY word
  for (const entry of index._entries) {
    if (words.some((w) => entry.lower.includes(w))) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  return results;
}
