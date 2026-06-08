import { useQuery } from '@tanstack/react-query';
import { CHAOS_WORLDS, LIGHT_WORLDS } from './europeWorlds';

export type WorldsMap = Map<number, string>;

/** Fetch Universalis' world list once → id→name map. Worlds rarely change. */
export async function fetchWorlds(): Promise<WorldsMap> {
  const res = await fetch('https://universalis.app/api/v2/worlds');
  if (!res.ok) throw new Error(`Universalis worlds ${res.status}`);
  const list = (await res.json()) as Array<{ id: number; name: string }>;
  return new Map(list.map((w) => [w.id, w.name]));
}

export function useWorldsMap() {
  return useQuery<WorldsMap>({ queryKey: ['universalis-worlds'], queryFn: fetchWorlds, staleTime: Infinity });
}

/** World IDs in a EU data center, derived from the id→name map. [] for unknown DCs. */
export function dcWorldIds(dc: string, map: WorldsMap): number[] {
  const names = dc === 'Chaos' ? CHAOS_WORLDS : dc === 'Light' ? LIGHT_WORLDS : null;
  if (!names) return [];
  const out: number[] = [];
  for (const [id, name] of map) if (names.has(name)) out.push(id);
  return out.sort((a, b) => a - b);
}
