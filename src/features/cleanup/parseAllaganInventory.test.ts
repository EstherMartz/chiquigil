import { describe, it, expect } from 'vitest';
import { parseAllaganInventory } from './parseAllaganInventory';
import type { SnapshotItem } from '../../lib/itemSnapshot';

const items: SnapshotItem[] = [
  { id: 5, name: 'Fire Shard', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 },
  { id: 12, name: 'Earth Crystal', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 },
  { id: 100, name: 'Cobalt Ingot', sc: 60, ui: 47, ilvl: 50, canHq: true, priceLow: 17 },
];

const namesById = new Map(items.map((i) => [i.id, i.name]));

describe('parseAllaganInventory', () => {
  it('parses a basic CSV with header row', () => {
    const csv = `Item ID,Item Name,Quantity,HQ,Location
5,Fire Shard,42,false,bag
100,Cobalt Ingot,3,true,retainer`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries).toHaveLength(2);
    expect(out.entries[0]).toEqual({ itemId: 5, name: 'Fire Shard', qty: 42, isHq: false, locations: ['bag'] });
    expect(out.entries[1]).toEqual({ itemId: 100, name: 'Cobalt Ingot', qty: 3, isHq: true, locations: ['retainer'] });
    expect(out.unrecognized).toEqual([]);
  });

  it('is case-insensitive on header names and tolerates aliases', () => {
    const csv = `id,name,qty,high quality,source
5,Fire Shard,7,1,bag`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries[0]).toEqual({ itemId: 5, name: 'Fire Shard', qty: 7, isHq: true, locations: ['bag'] });
  });

  it('accepts multiple HQ truthy representations', () => {
    const csv = `Item ID,Quantity,HQ,Location
5,1,yes,bag
5,1,HQ,bag
5,1,0,bag
5,1,false,bag`;
    const out = parseAllaganInventory(csv, namesById);
    // 2 HQ rows + 2 NQ rows merge into 2 entries (HQ and NQ)
    const hq = out.entries.find((e) => e.isHq);
    const nq = out.entries.find((e) => !e.isHq);
    expect(hq?.qty).toBe(2);
    expect(nq?.qty).toBe(2);
  });

  it('drops armoury / glamour / equipped rows silently', () => {
    const csv = `Item ID,Quantity,Location
5,1,bag
5,1,armoury
5,1,glamour
5,1,equipped`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].qty).toBe(1); // only the bag row survives
  });

  it('merges duplicate (itemId, isHq) rows across locations', () => {
    const csv = `Item ID,Quantity,HQ,Location
5,10,false,bag
5,5,false,retainer
5,2,false,saddlebag`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].qty).toBe(17);
    expect(out.entries[0].locations.sort()).toEqual(['bag', 'retainer', 'saddlebag']);
  });

  it('preserves unrecognized item IDs in a separate bucket', () => {
    const csv = `Item ID,Item Name,Quantity,Location
99999,Mystery Item X,4,bag`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries).toHaveLength(0);
    expect(out.unrecognized).toHaveLength(1);
    expect(out.unrecognized[0]).toEqual({ itemId: 99999, name: 'Mystery Item X', qty: 4, isHq: false, locations: ['bag'] });
  });

  it('defaults missing quantity to 1', () => {
    const csv = `Item ID,Location
5,bag`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries[0].qty).toBe(1);
  });

  it('throws on missing headers', () => {
    const csv = `Just some text without a header row`;
    expect(() => parseAllaganInventory(csv, namesById)).toThrow(/headers/i);
  });

  it('resolves by name when only Item Name is present and no Item ID column', () => {
    const csv = `Item Name,Quantity,Location
Fire Shard,3,bag`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries[0].itemId).toBe(5);
  });

  it('parses real Allagan Tools export format', () => {
    // Allagan's actual export columns: Icon (empty), Name, Type (NQ/HQ),
    // Quantity/Total Quantity Available, Source (character name), Inventory Location (bag slot).
    const csv = `Icon,Name,Type,Quantity/Total Quantity Available,Source,Inventory Location
,Fire Shard,NQ,42,Esther Martz,Bag 1 - 1
,Cobalt Ingot,HQ,3,Esther Martz,Bag 1 - 4`;
    const out = parseAllaganInventory(csv, namesById);
    expect(out.entries).toHaveLength(2);
    expect(out.entries[0]).toMatchObject({ itemId: 5, qty: 42, isHq: false, locations: ['bag'] });
    expect(out.entries[1]).toMatchObject({ itemId: 100, qty: 3, isHq: true, locations: ['bag'] });
  });
});
