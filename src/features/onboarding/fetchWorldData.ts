export interface WorldEntry {
  name: string;
  dc: string;
}

export async function fetchWorldData(): Promise<WorldEntry[]> {
  const { CHAOS_WORLDS, LIGHT_WORLDS } = await import('../../lib/europeWorlds');
  const entries: WorldEntry[] = [];
  for (const w of CHAOS_WORLDS) entries.push({ name: w, dc: 'Chaos' });
  for (const w of LIGHT_WORLDS) entries.push({ name: w, dc: 'Light' });
  entries.sort((a, b) => a.dc.localeCompare(b.dc) || a.name.localeCompare(b.name));
  return entries;
}
