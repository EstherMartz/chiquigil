import { describe, it, expect } from 'vitest';
import { parseAllaganInventory } from './parseAllaganInventory';

describe('parseAllaganInventory', () => {
  it('throws when the CSV has no rows', () => {
    expect(() => parseAllaganInventory('', new Map())).toThrow();
  });

  it('throws when headers cannot be detected', () => {
    expect(() => parseAllaganInventory('random text\nmore random', new Map())).toThrow(/headers/i);
  });

  it('parses a minimal CSV and merges HQ+NQ into one entry per item', () => {
    const out = parseAllaganInventory(
      'Item ID,Item Name,Quantity,HQ,Location\n5,Fire Shard,10,false,bag\n5,Fire Shard,5,true,bag',
      new Map(),
    );
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]).toMatchObject({ itemId: 5, qty: 15, isHq: true });
  });

  it('assigns the highest HQ seen to merged entries', () => {
    const out = parseAllaganInventory(
      'Item ID,Item Name,Quantity,HQ,Location\n5,Fire,3,false,bag\n5,Fire,5,false,bag\n5,Fire,2,true,bag',
      new Map(),
    );
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].isHq).toBe(true);  // at least one HQ variant seen
  });

  it('resolves item IDs via namesById when ID is missing', () => {
    const out = parseAllaganInventory(
      'Item Name,Quantity,HQ,Location\nFire Shard,10,false,bag',
      new Map([['Fire Shard', 5]]),
    );
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].itemId).toBe(5);
  });

  it('merges multiple locations into an array', () => {
    const out = parseAllaganInventory(
      'Item ID,Item Name,Quantity,HQ,Location\n5,Fire Shard,10,false,bag\n5,Fire Shard,3,false,retainer\n5,Fire Shard,2,false,saddlebag',
      new Map(),
    );
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].locations).toHaveLength(3);
    expect(out.entries[0].locations).toContain('bag');
    expect(out.entries[0].locations).toContain('retainer');
    expect(out.entries[0].locations).toContain('saddlebag');
  });

  it('puts unresolved items into the unrecognized bucket', () => {
    const out = parseAllaganInventory(
      'Item ID,Item Name,Quantity,HQ,Location\n0,Mystery Item,5,false,bag',
      new Map(),
    );
    expect(out.entries).toHaveLength(0);
    expect(out.unrecognized).toHaveLength(1);
    expect(out.unrecognized[0].name).toBe('Mystery Item');
  });

  it('normalizes location names and merges aliases', () => {
    const out = parseAllaganInventory(
      'Item ID,Item Name,Quantity,HQ,Location\n5,Fire Shard,2,false,Bag\n5,Fire Shard,3,false,RETAINER',
      new Map(),
    );
    expect(out.entries[0].locations).toContain('bag');
    expect(out.entries[0].locations).toContain('retainer');
  });

  it('skips rows where Quantity or HQ are unparseable, but does not crash', () => {
    const out = parseAllaganInventory(
      'Item ID,Item Name,Quantity,HQ,Location\n5,Fire Shard,10,false,bag\n6,Bad Row,abc,notabool,bag',
      new Map(),
    );
    // Bad row is silently skipped; Fire Shard is the only item.
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].itemId).toBe(5);
  });

  it('detects headers from multiple column alias sets', () => {
    // Allagan Tools uses "Item ID", ItemSnapshot uses "id", etc.
    const out = parseAllaganInventory(
      'id,name,quantity,hq,location\n5,Fire,10,false,bag',
      new Map(),
    );
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].itemId).toBe(5);
  });
});
