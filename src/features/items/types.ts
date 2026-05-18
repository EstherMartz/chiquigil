export type CrafterCode = 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL' | 'ANY';
export type ItemCategory = 'Raid' | 'Tincture' | 'Food' | 'Fish' | 'Dye' | 'Glamour' | 'Housing' | 'Materia' | 'Minion';

export interface TrackedItem {
  id: number;
  name: string;
  crafter: CrafterCode;
  lvl: number;
  cat: ItemCategory;
  subcat?: string;
}

export type StarterPackId =
  | 'raid-current'
  | 'tinctures-g4'
  | 'food-7x'
  | 'dyes'
  | 'materia-xii'
  | 'materia-xi'
  | 'minions-crafted'
  | 'glamour-faves'
  | 'glamour-classic'
  | 'housing-faves';

export interface StarterPack {
  id: StarterPackId;
  label: string;
  defaultOn: boolean;
  items: TrackedItem[];
}
