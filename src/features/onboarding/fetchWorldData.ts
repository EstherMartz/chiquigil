import { dcOf } from '../../lib/europeWorlds';

export interface WorldEntry {
  name: string;
  dc: string;
}

interface RawDc { name: string; worlds: number[] }
interface RawWorld { id: number; name: string }

export async function fetchWorldData(): Promise<WorldEntry[]> {
  try {
    const [dcsRes, worldsRes] = await Promise.all([
      fetch('https://universalis.app/api/v2/data-centers'),
      fetch('https://universalis.app/api/v2/worlds'),
    ]);
    if (!dcsRes.ok || !worldsRes.ok) throw new Error('fetch failed');

    const dcs: RawDc[] = await dcsRes.json();
    const worlds: RawWorld[] = await worldsRes.json();

    const worldIdToName = new Map<number, string>();
    for (const w of worlds) worldIdToName.set(w.id, w.name);

    const entries: WorldEntry[] = [];
    for (const dc of dcs) {
      for (const wid of dc.worlds) {
        const name = worldIdToName.get(wid);
        if (name) entries.push({ name, dc: dc.name });
      }
    }
    entries.sort((a, b) => a.dc.localeCompare(b.dc) || a.name.localeCompare(b.name));
    return entries;
  } catch {
    // Fallback to hardcoded EU worlds
    const { CHAOS_WORLDS, LIGHT_WORLDS } = await import('../../lib/europeWorlds');
    const entries: WorldEntry[] = [];
    for (const w of CHAOS_WORLDS) entries.push({ name: w, dc: 'Chaos' });
    for (const w of LIGHT_WORLDS) entries.push({ name: w, dc: 'Light' });
    entries.sort((a, b) => a.dc.localeCompare(b.dc) || a.name.localeCompare(b.name));
    return entries;
  }
}
