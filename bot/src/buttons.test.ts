import { describe, it, expect } from 'vitest';
import { ButtonStyle } from 'discord.js';
import {
  buildOverviewButtons,
  encodeCustomId,
  decodeCustomId,
  type ButtonAction,
} from './buttons';
import type { CleanupResult } from '../../src/features/cleanup/types';

function emptyResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
  return { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [], ...overrides };
}

describe('customId codec', () => {
  it('round-trips ownerId, cacheId, action', () => {
    const encoded = encodeCustomId({ ownerId: '123456789012345678', cacheId: 'abcdef012345', action: 'craft' });
    const decoded = decodeCustomId(encoded);
    expect(decoded).toEqual({ ownerId: '123456789012345678', cacheId: 'abcdef012345', action: 'craft' });
  });

  it('returns null for unparseable customId', () => {
    expect(decodeCustomId('totally-unrelated')).toBeNull();
    expect(decodeCustomId('cleanup:abc')).toBeNull();
    expect(decodeCustomId('cleanup:abc:user:bogus')).toBeNull();
  });

  it('rejects unknown actions', () => {
    expect(decodeCustomId('cleanup:abcdef012345:user1:somethingelse')).toBeNull();
  });

  it('stays under Discord 100-char customId limit', () => {
    const encoded = encodeCustomId({ ownerId: '999999999999999999', cacheId: 'ffffffffffff', action: 'refresh' });
    expect(encoded.length).toBeLessThan(100);
  });
});

describe('buildOverviewButtons', () => {
  it('emits exactly 4 buttons in a single row', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ craft: [{} as any] }));
    expect(row.components).toHaveLength(4);
  });

  it('disables craft button when craft bucket is empty', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult());
    const craftBtn = row.components[0].toJSON();
    expect(craftBtn.disabled).toBe(true);
  });

  it('enables craft button when craft bucket has rows', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ craft: [{} as any, {} as any] }));
    const craftBtn = row.components[0].toJSON();
    expect(craftBtn.disabled).toBe(false);
  });

  it('combines vendor + discard count on the vendor button label', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ vendor: [{} as any, {} as any], discard: [{} as any] }));
    const vendorBtn = row.components[2].toJSON();
    expect(vendorBtn.label).toContain('(3)');
  });

  it('refresh button is always enabled and uses Secondary style', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult());
    const refreshBtn = row.components[3].toJSON();
    expect(refreshBtn.disabled).toBeFalsy();
    expect(refreshBtn.style).toBe(ButtonStyle.Secondary);
  });

  it('encodes the right action in each button customId', () => {
    const row = buildOverviewButtons('user1', 'abcdef012345', emptyResult({ craft: [{} as any], sellMb: [{} as any], vendor: [{} as any] }));
    const actions: ButtonAction[] = ['craft', 'sell', 'vendor', 'refresh'];
    row.components.forEach((btn, i) => {
      const decoded = decodeCustomId(btn.toJSON().custom_id!);
      expect(decoded?.action).toBe(actions[i]);
    });
  });
});
