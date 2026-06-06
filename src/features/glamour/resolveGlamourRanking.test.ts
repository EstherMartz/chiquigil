import { describe, it, expect } from 'vitest';
import { resolveGlamourRanking } from './resolveGlamourRanking';
import type { SnapshotItem } from '../../lib/itemSnapshot';

function item(id: number, name: string, sc: number, ilvl = 1): SnapshotItem {
  return { id, name, sc, ui: 0, ilvl, canHq: false };
}

describe('resolveGlamourRanking', () => {
  it('matches names to ids and keeps tradeable rows sorted by uses desc', () => {
    const items = [item(10, 'Dream Hat', 31, 5), item(20, 'Company Hat', 31, 3)];
    const out = resolveGlamourRanking(
      [{ item: 'Company Hat', uses: 5 }, { item: 'Dream Hat', uses: 9 }],
      items,
    );
    expect(out.rows.map((r) => r.id)).toEqual([10, 20]);
    expect(out.rows[0]).toMatchObject({ id: 10, name: 'Dream Hat', sc: 31, ilvl: 5, uses: 9 });
    expect(out.matched).toBe(2);
  });

  it('normalizes case, whitespace, and HQ markers when matching', () => {
    const items = [item(10, 'Dream Hat', 31)];
    const out = resolveGlamourRanking(
      [{ item: '  dream   hat ', uses: 4 }],
      items,
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].id).toBe(10);
  });

  it('drops untradeable (sc === 0) matches and counts them', () => {
    const items = [item(10, 'Artifact Helm', 0)];
    const out = resolveGlamourRanking([{ item: 'Artifact Helm', uses: 50 }], items);
    expect(out.rows).toEqual([]);
    expect(out.untradeable).toBe(1);
    expect(out.matched).toBe(0);
  });

  it('counts unmatched names', () => {
    const items = [item(10, 'Dream Hat', 31)];
    const out = resolveGlamourRanking([{ item: 'Nonexistent Item', uses: 3 }], items);
    expect(out.rows).toEqual([]);
    expect(out.unmatched).toBe(1);
  });

  it('on duplicate normalized names, the lowest id wins', () => {
    const items = [item(30, 'Mirage Coat', 33), item(10, 'Mirage Coat', 33)];
    const out = resolveGlamourRanking([{ item: 'Mirage Coat', uses: 1 }], items);
    expect(out.rows[0].id).toBe(10);
  });

  it('tie-breaks equal uses by name ascending', () => {
    const items = [item(10, 'Beta Hat', 31), item(20, 'Alpha Hat', 31)];
    const out = resolveGlamourRanking(
      [{ item: 'Beta Hat', uses: 7 }, { item: 'Alpha Hat', uses: 7 }],
      items,
    );
    expect(out.rows.map((r) => r.name)).toEqual(['Alpha Hat', 'Beta Hat']);
  });

  it('skips malformed entries without counting them as unmatched', () => {
    const items = [item(10, 'Dream Hat', 31)];
    const out = resolveGlamourRanking(
      [{ item: '', uses: 5 }, { item: 'Dream Hat', uses: 0 } as never, { uses: 1 } as never],
      items,
    );
    expect(out.rows.map((r) => r.id)).toEqual([10]);
    expect(out.unmatched).toBe(0);
  });

  it('accepts a Map<number,SnapshotItem> as the item source', () => {
    const map = new Map([[10, item(10, 'Dream Hat', 31)]]);
    const out = resolveGlamourRanking([{ item: 'Dream Hat', uses: 2 }], map);
    expect(out.rows[0].id).toBe(10);
  });

  it('returns empty result for empty ranking', () => {
    const out = resolveGlamourRanking([], [item(10, 'Dream Hat', 31)]);
    expect(out).toEqual({ rows: [], matched: 0, unmatched: 0, untradeable: 0 });
  });
});
