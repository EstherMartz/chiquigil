import { describe, it, expect, vi } from 'vitest';
import { parseLeveSheetPage, fetchLeveSnapshot } from './leveSnapshot';

describe('parseLeveSheetPage', () => {
  it('extracts a DoH crafter leve into a SnapshotLeve', () => {
    const raw = {
      rows: [
        {
          row_id: 1234,
          fields: {
            Name: 'And Bring Plenty of Ale',
            ClassJobCategory: { fields: { Name: 'Culinarian' } },
            LeveAssignmentType: { fields: { Name: 'Tradecraft' } },
            ClassJobLevel: 30,
            AllowanceCost: 1,
            GilReward: 1200,
            ExpReward: 5400,
            LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
            DataId: { value: 5678 },
          },
        },
      ],
    };
    const out = parseLeveSheetPage(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 1234,
      name: 'And Bring Plenty of Ale',
      type: 'doh',
      classJob: 15, // ClassJob id for Culinarian; pulled from CLASS_JOB_BY_NAME map
      level: 30,
      city: 'Limsa Lominsa',
      baseGil: 1200,
      baseExp: 5400,
      hqGilMultiplier: 2.0,
    });
  });

  it('classifies a DoL gatherer leve with hqGilMultiplier=1', () => {
    const raw = {
      rows: [
        {
          row_id: 2222,
          fields: {
            Name: 'Mining for Memories',
            ClassJobCategory: { fields: { Name: 'Miner' } },
            LeveAssignmentType: { fields: { Name: 'Fieldcraft' } },
            ClassJobLevel: 20,
            AllowanceCost: 1,
            GilReward: 800,
            ExpReward: 3000,
            LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: "Ul'dah" } } } } } },
            DataId: { value: 0 },
          },
        },
      ],
    };
    const out = parseLeveSheetPage(raw);
    expect(out[0].type).toBe('dol');
    expect(out[0].hqGilMultiplier).toBe(1.0);
  });

  it('classifies a Grand Company combat leve as type=dow', () => {
    const raw = {
      rows: [
        {
          row_id: 3333,
          fields: {
            Name: 'Slay Wamouras',
            ClassJobCategory: { fields: { Name: 'Disciple of War' } },
            LeveAssignmentType: { fields: { Name: 'Maelstrom' } },
            ClassJobLevel: 50,
            AllowanceCost: 1,
            GilReward: 5000,
            ExpReward: 12000,
            LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
            DataId: { value: 0 },
          },
        },
      ],
    };
    const out = parseLeveSheetPage(raw);
    expect(out[0].type).toBe('dow');
    expect(out[0].hqGilMultiplier).toBe(1.0);
  });

  it('drops rows with empty Name (deprecated placeholders)', () => {
    const raw = {
      rows: [
        {
          row_id: 4444,
          fields: { Name: '', ClassJobCategory: { fields: { Name: 'Carpenter' } } },
        },
      ],
    };
    expect(parseLeveSheetPage(raw)).toHaveLength(0);
  });

  it('returns [] for empty input', () => {
    expect(parseLeveSheetPage({})).toEqual([]);
    expect(parseLeveSheetPage({ rows: [] })).toEqual([]);
  });
});

describe('fetchLeveSnapshot', () => {
  it('paginates the Leve sheet until an empty page comes back', async () => {
    const pages = [
      // First Leve page: one DoH leve with DataId 5678, one DoL leve with DataId 0
      {
        rows: [
          {
            row_id: 1001,
            fields: {
              Name: 'And Bring Plenty of Ale',
              ClassJobCategory: { fields: { Name: 'Culinarian' } },
              LeveAssignmentType: { fields: { Name: 'Tradecraft' } },
              ClassJobLevel: 30,
              AllowanceCost: 1,
              GilReward: 1200,
              ExpReward: 5400,
              LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
              DataId: { value: 5678 },
            },
          },
          {
            row_id: 1002,
            fields: {
              Name: 'Mining for Memories',
              ClassJobCategory: { fields: { Name: 'Miner' } },
              LeveAssignmentType: { fields: { Name: 'Fieldcraft' } },
              ClassJobLevel: 20,
              AllowanceCost: 1,
              GilReward: 800,
              ExpReward: 3000,
              LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: "Ul'dah" } } } } } },
              DataId: { value: 0 },
            },
          },
        ],
      },
      // Second Leve page: empty
      { rows: [] },
      // First CraftLeve page: one row matching the DoH leve's DataId
      {
        rows: [
          {
            row_id: 5678,
            fields: {
              Item0: { value: 4567 },
              ItemCount0: 5,
            },
          },
        ],
      },
      // Second CraftLeve page: empty
      { rows: [] },
    ];
    const fetchSpy = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => pages.shift() }));
    vi.stubGlobal('fetch', fetchSpy);

    const out = await fetchLeveSnapshot();
    expect(out).toHaveLength(2);
    // Verify the DoH leve was enriched with target from CraftLeve
    const dohLeve = out.find((l) => l.type === 'doh');
    expect(dohLeve).toMatchObject({ id: 1001, targetItemId: 4567, targetItemQty: 5 });
    // Verify the DoL leve has null targets
    const dolLeve = out.find((l) => l.type === 'dol');
    expect(dolLeve).toMatchObject({ id: 1002, targetItemId: null, targetItemQty: null });
  });

  it('invokes onProgress after each non-empty Leve page', async () => {
    const pages = [
      // First Leve page with one row
      {
        rows: [
          {
            row_id: 2001,
            fields: {
              Name: 'Test Leve 1',
              ClassJobCategory: { fields: { Name: 'Carpenter' } },
              LeveAssignmentType: { fields: { Name: 'Tradecraft' } },
              ClassJobLevel: 10,
              AllowanceCost: 1,
              GilReward: 500,
              ExpReward: 2000,
              LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
              DataId: { value: 0 },
            },
          },
        ],
      },
      // Second Leve page with one row
      {
        rows: [
          {
            row_id: 2002,
            fields: {
              Name: 'Test Leve 2',
              ClassJobCategory: { fields: { Name: 'Blacksmith' } },
              LeveAssignmentType: { fields: { Name: 'Tradecraft' } },
              ClassJobLevel: 15,
              AllowanceCost: 1,
              GilReward: 600,
              ExpReward: 2500,
              LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: "Ul'dah" } } } } } },
              DataId: { value: 0 },
            },
          },
        ],
      },
      // Third Leve page: empty, terminates Leve fetch
      { rows: [] },
      // First CraftLeve page: empty
      { rows: [] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => pages.shift() })));

    const progress: number[] = [];
    await fetchLeveSnapshot({ onProgress: (n) => progress.push(n) });
    expect(progress).toEqual([1, 2]);
  });

  it('throws on a non-OK Leve response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(fetchLeveSnapshot()).rejects.toThrow(/XIVAPI Leve 400/);
  });

  it('throws on a non-OK CraftLeve response', async () => {
    const pages = [
      // First Leve page with one row
      {
        rows: [
          {
            row_id: 3001,
            fields: {
              Name: 'Test Leve',
              ClassJobCategory: { fields: { Name: 'Armorer' } },
              LeveAssignmentType: { fields: { Name: 'Tradecraft' } },
              ClassJobLevel: 25,
              AllowanceCost: 1,
              GilReward: 800,
              ExpReward: 3000,
              LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
              DataId: { value: 0 },
            },
          },
        ],
      },
      // Second Leve page: empty
      { rows: [] },
      // CraftLeve response with error (use 400 — non-retried by fetchXivapiPage)
      { ok: false, status: 400 },
    ];
    const fetchSpy = vi.fn().mockImplementation(async () => {
      const result = pages.shift();
      if (result && 'ok' in result && result.ok === false) return result;
      return { ok: true, json: async () => result };
    });
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchLeveSnapshot()).rejects.toThrow(/XIVAPI CraftLeve 400/);
  });
});
