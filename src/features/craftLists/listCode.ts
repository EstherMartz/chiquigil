import type { CraftListItem } from './types';
import type { ResolvedList } from './resolveList';

const PREFIX = 'qq:list:v1:';

interface WireList {
  n: string;
  i: [number, number, 0 | 1][]; // [itemId, qty, hqFlag]
}

export interface DecodedList {
  name: string;
  items: { itemId: number; qty: number; isHq: boolean }[];
}

// UTF-8-safe base64url. btoa only handles Latin-1, so encode UTF-8 first.
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeListCode(name: string, items: CraftListItem[]): string {
  const wire: WireList = {
    n: name,
    i: items.map((it) => [it.itemId, it.qty, it.isHq ? 1 : 0] as [number, number, 0 | 1]),
  };
  return PREFIX + toBase64Url(JSON.stringify(wire));
}

export function decodeListCode(code: string): DecodedList | null {
  if (!code.startsWith(PREFIX)) return null;
  try {
    const wire = JSON.parse(fromBase64Url(code.slice(PREFIX.length))) as WireList;
    if (typeof wire?.n !== 'string' || !Array.isArray(wire.i)) return null;
    const items = wire.i.map((t) => ({ itemId: Number(t[0]), qty: Number(t[1]), isHq: t[2] === 1 }));
    if (items.some((it) => !Number.isInteger(it.itemId) || !Number.isInteger(it.qty))) return null;
    return { name: wire.n, items };
  } catch {
    return null;
  }
}

/** Human-readable resolved ingredient list for shopping outside the game. */
export function resolvedToPlainText(listName: string, resolved: ResolvedList): string {
  const lines: string[] = [`${listName}`, ''];
  const section = (title: string, rows: { itemName: string; requiredQty: number }[]) => {
    if (rows.length === 0) return;
    lines.push(`== ${title} ==`);
    for (const r of rows) lines.push(`${r.itemName} x${r.requiredQty}`);
    lines.push('');
  };
  section('Final Items', resolved.finalItems.map((f) => ({ itemName: f.itemName, requiredQty: f.qty })));
  for (const [depth, rows] of [...resolved.subCraftsByDepth.entries()].sort((a, b) => a[0] - b[0])) {
    section(`Sub-crafts (Level ${depth})`, rows);
  }
  section('Gathered', resolved.gathered);
  section('Vendor / Other', resolved.otherAcquired);
  section('Crystals', resolved.crystals);
  return lines.join('\n').trim() + '\n';
}
