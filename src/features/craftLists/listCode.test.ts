import { describe, it, expect } from 'vitest';
import { encodeListCode, decodeListCode } from './listCode';
import type { CraftListItem } from './types';

const ITEMS: CraftListItem[] = [
  { itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false },
  { itemId: 200, itemName: 'Surcôat of Fending', qty: 2, isHq: true },
];

describe('listCode', () => {
  it('round-trips a list through encode/decode', () => {
    const code = encodeListCode('Set of Fending', ITEMS);
    expect(code.startsWith('qq:list:v1:')).toBe(true);
    const decoded = decodeListCode(code);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('Set of Fending');
    expect(decoded!.items).toEqual([
      { itemId: 100, qty: 1, isHq: false },
      { itemId: 200, qty: 2, isHq: true },
    ]);
  });

  it('returns null for a malformed code', () => {
    expect(decodeListCode('not-a-code')).toBeNull();
    expect(decodeListCode('qq:list:v1:!!!notbase64!!!')).toBeNull();
    expect(decodeListCode('qq:list:v2:abc')).toBeNull();
  });
});
