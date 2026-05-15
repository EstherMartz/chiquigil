import { describe, it, expect } from 'vitest';
import { parseLeveSheetPage } from './leveSnapshot';

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
