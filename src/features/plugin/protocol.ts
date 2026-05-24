import type { CrafterLevels } from '../items/craftStatus';

export interface HelloMessage {
  type: 'hello';
  v: 1;
  client: 'chiquigil-web';
}

export interface PlayerSnapshotMessage {
  type: 'playerSnapshot';
  v: 1;
  world: string;
  dc: string;
  crafterLevels: CrafterLevels;
}

export type PluginInboundMessage = PlayerSnapshotMessage;

const CRAFTER_KEYS: readonly (keyof CrafterLevels)[] = [
  'CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL',
] as const;

export function parseInboundMessage(raw: string): PluginInboundMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (o.type === 'playerSnapshot' && o.v === 1) {
    const world = typeof o.world === 'string' ? o.world : null;
    const dc = typeof o.dc === 'string' ? o.dc : null;
    const levelsRaw = o.crafterLevels as Record<string, unknown> | undefined;
    if (!world || !dc || !levelsRaw || typeof levelsRaw !== 'object') return null;
    const crafterLevels = {} as CrafterLevels;
    for (const k of CRAFTER_KEYS) {
      const v = levelsRaw[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null;
      crafterLevels[k] = Math.floor(v);
    }
    return { type: 'playerSnapshot', v: 1, world, dc, crafterLevels };
  }
  return null;
}
