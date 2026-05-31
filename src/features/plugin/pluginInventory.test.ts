import { describe, it, expect } from 'vitest';
import { pluginInventoryToParseResult } from './pluginInventory';
import type { InventorySnapshotMessage } from './protocol';

function snap(items: InventorySnapshotMessage['items'], source: InventorySnapshotMessage['source'] = 'all'): InventorySnapshotMessage {
  return { type: 'inventorySnapshot', v: 2, source, capturedAt: 1, items };
}

const names = new Map<number, string>([[5058, 'Cotton Boll'], [5366, 'Cotton Cloth']]);

describe('pluginInventoryToParseResult', () => {
  it('maps items to InventoryEntry and resolves names', () => {
    const out = pluginInventoryToParseResult(snap([{ id: 5058, qty: 40, hq: false }]), names);
    expect(out.unrecognized).toEqual([]);
    expect(out.entries).toEqual([
      { itemId: 5058, name: 'Cotton Boll', qty: 40, isHq: false, locations: ['bag'] },
    ]);
  });

  it('merges same item+HQ stacks but keeps NQ and HQ separate', () => {
    const out = pluginInventoryToParseResult(snap([
      { id: 5058, qty: 40, hq: false },
      { id: 5058, qty: 10, hq: false },
      { id: 5058, qty: 3, hq: true },
    ]), names);
    const nq = out.entries.find((e) => e.itemId === 5058 && !e.isHq);
    const hq = out.entries.find((e) => e.itemId === 5058 && e.isHq);
    expect(nq?.qty).toBe(50);
    expect(hq?.qty).toBe(3);
  });

  it('falls back to #id for unknown names, drops non-positive qty, and tags location by source', () => {
    const out = pluginInventoryToParseResult(snap([
      { id: 9999, qty: 2, hq: false },
      { id: 5058, qty: 0, hq: false },
    ], 'retainers'), names);
    expect(out.entries).toEqual([
      { itemId: 9999, name: '#9999', qty: 2, isHq: false, locations: ['retainer'] },
    ]);
  });
});
