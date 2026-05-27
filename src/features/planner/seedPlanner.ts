export type LaneKey = 'craft' | 'gather' | 'content' | 'passive';

export interface PlanItem {
  id: string;
  name: string;
  src: string;
  price: number;
  cost: number;
  perDay: number;
  supply: number | null;
  active: boolean;
  earned: number;
  units: number;
}

export interface DailyTask {
  id: string;
  label: string;
}

export const LANE_ORDER: LaneKey[] = ['craft', 'gather', 'content', 'passive'];

export const LANE_META: Record<LaneKey, { nm: string; desc: string; dotClass: string }> = {
  craft:   { nm: 'Craft',          desc: 'your engine',        dotClass: 'bg-gold shadow-[0_0_10px] shadow-gold' },
  gather:  { nm: 'Gather & Sell',  desc: 'near-pure profit',   dotClass: 'bg-jade shadow-[0_0_10px] shadow-jade' },
  content: { nm: 'Content Farm',   desc: 'high-ticket lottery', dotClass: 'bg-crimson shadow-[0_0_10px] shadow-crimson' },
  passive: { nm: 'Passive',        desc: 'set & forget',       dotClass: 'bg-aether shadow-[0_0_10px] shadow-aether' },
};

export const DAILY_TASKS: DailyTask[] = [
  { id: 'd1', label: 'Collect retainer sales & re-list (small undercut)' },
  { id: 'd2', label: 'Craft 2-3 lowest-supply items' },
  { id: 'd3', label: 'One gathering pass (high-velocity mats)' },
  { id: 'd4', label: 'One content run (Occult Crescent / Cosmic)' },
  { id: 'd5', label: 'Check spiritbond fodder' },
  { id: 'd6', label: 'Refresh qiqirn.tools market data' },
];

export function newItemId(): string {
  return 'i' + Math.random().toString(36).slice(2, 8);
}

function mk(name: string, src: string, price: number, cost: number, perDay: number, supply: number | null): PlanItem {
  return { id: newItemId(), name, src, price, cost, perDay, supply, active: true, earned: 0, units: 0 };
}

export function seedPlanner() {
  return {
    goal: { current: 10_000_000, target: 100_000_000, startTs: Date.now() },
    log: [] as Array<{ ts: number; amount: number; note: string; itemId?: string }>,
    lanes: {
      craft: [
        mk('Plain Hooded Tunic', 'Weaver', 4_025_000, 1_200_000, 1.1, 0.9),
        mk('Crested Shirt of Crafting', 'iL750 gear', 399_500, 120_000, 1.7, 1.8),
        mk("Courtly Lover's Partisan", 'weapon craft', 437_961, 150_000, 1.6, 1.9),
        mk("Courtly Lover's Cane", 'weapon craft', 579_896, 180_000, 1.0, 1.0),
        mk('Grade 4 Gemdraughts (filler)', 'Alchemist · vol', 4_150, 1_500, 250, 2.0),
      ],
      gather: [
        mk('Yollal Extract', 'gatherable', 7_900, 0, 154, null),
        mk('Everkeep Resin', 'gatherable', 7_999, 0, 108, null),
        mk('Levinchrome Aethersand', 'Cosmic Auxesia', 1_800, 0, 266, null),
        mk('Double Duracoat', 'gatherable', 7_499, 0, 69, null),
      ],
      content: [
        mk('Occult Bracelet of Blood', 'Occult Crescent', 40_000_000, 0, 0.3, null),
        mk('Occult Necklace of Blood', 'Occult Crescent', 43_249_499, 0, 0.1, null),
        mk('Cosmoboard', 'Cosmic Exploration', 2_964_474, 0, 0.3, null),
      ],
      passive: [
        mk("Craftsman's Command Materia XII", 'spiritbond', 14_392, 0, 20, null),
        mk("Gatherer's Guile Materia XII", 'spiritbond', 6_352, 0, 34, null),
        mk('Timeworn Gargantuaskin Map', 'gather + sell', 41_499, 0, 2.9, null),
      ],
    },
    daily: { date: '', done: {} as Record<string, boolean> },
  };
}
