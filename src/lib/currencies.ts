export type CurrencyId =
  | 'poetics' | 'mathematics' | 'causality'
  | 'whiteCrafter' | 'purpleCrafter'
  | 'whiteGatherer' | 'purpleGatherer'
  | 'mgp' | 'wolfMarks' | 'bicolor';

export interface CurrencyDef {
  id: CurrencyId;
  label: string;
  shortLabel: string;
  itemId: number;
}

// VERIFY itemIds against XIVAPI v2 Item sheet before relying on data.
// Step 4 of this task probes XIVAPI to confirm.
export const CURRENCIES: readonly CurrencyDef[] = [
  { id: 'poetics',         label: 'Allagan Tomestone of Poetics',      shortLabel: 'Poetics',     itemId: 28 },
  { id: 'mathematics',     label: 'Allagan Tomestone of Mathematics',  shortLabel: 'Mathematics', itemId: 48 },
  { id: 'causality',       label: 'Allagan Tomestone of Causality',    shortLabel: 'Causality',   itemId: 44 },
  { id: 'whiteCrafter',    label: "White Crafters' Scrip",             shortLabel: 'W-Craft',     itemId: 25199 },
  { id: 'purpleCrafter',   label: "Purple Crafters' Scrip",            shortLabel: 'P-Craft',     itemId: 33913 },
  { id: 'whiteGatherer',   label: "White Gatherers' Scrip",            shortLabel: 'W-Gather',    itemId: 25200 },
  { id: 'purpleGatherer',  label: "Purple Gatherers' Scrip",           shortLabel: 'P-Gather',    itemId: 33914 },
  { id: 'mgp',             label: 'MGP',                               shortLabel: 'MGP',         itemId: 29 },
  { id: 'wolfMarks',       label: 'Wolf Marks',                        shortLabel: 'Wolf',        itemId: 25 },
  { id: 'bicolor',         label: 'Bicolor Gemstone',                  shortLabel: 'Bicolor',     itemId: 26807 },
];

export function getCurrencyById(id: CurrencyId): CurrencyDef | undefined {
  return CURRENCIES.find((c) => c.id === id);
}

export const currencyByItemId: Map<number, CurrencyId> = new Map(
  CURRENCIES.map((c) => [c.itemId, c.id]),
);
