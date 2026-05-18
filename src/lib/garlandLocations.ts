/**
 * Garland Tools global data doc — used to resolve location IDs (from item NPC
 * partials' `l` field) to human-readable zone names.
 *
 * Endpoint: https://www.garlandtools.org/db/doc/core/en/3/data.json
 * Shape (subset we use):
 *   { locationIndex: { [stringId]: { id: number; name: string; parentId?: number } } }
 *
 * Best-effort: if the fetch fails, callers fall back to no zone (NPC name only).
 */

const GARLAND_DATA_URL = 'https://www.garlandtools.org/db/doc/core/en/3/data.json';

interface RawLocationEntry { id?: number; name?: string }
interface RawGarlandData { locationIndex?: Record<string, RawLocationEntry> }

export function parseGarlandLocations(raw: RawGarlandData): Map<number, string> {
  const out = new Map<number, string>();
  const idx = raw.locationIndex ?? {};
  for (const [key, entry] of Object.entries(idx)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const name = entry?.name;
    if (typeof name !== 'string' || name.length === 0) continue;
    out.set(id, name);
  }
  return out;
}

export async function fetchGarlandLocations(): Promise<Map<number, string>> {
  const res = await fetch(GARLAND_DATA_URL);
  if (!res.ok) throw new Error(`Garland data ${res.status}`);
  return parseGarlandLocations(await res.json());
}
