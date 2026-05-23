export type Tier = 'common' | 'uncommon' | 'rare';

export interface LootItem {
  itemId: number;
  name: string;
  tier: Tier;
}

export interface Sector {
  id: number;
  name: string;
  letter: string;
  zone: string;
  rankReq: number;
  durationMin: number;
  loot: LootItem[];
}

export interface SectorData {
  sectors: Sector[];
}

/** Result row for the Route Valuator per-sector breakdown. */
export interface SectorValueRow {
  sectorId: number;
  sectorName: string;
  sectorLetter: string;
  itemId: number;
  itemName: string;
  tier: Tier;
  dropRate: number;
  price: number | null;
  expected: number;
}

/** Aggregated route summary. */
export interface RouteSummary {
  sectors: { id: number; letter: string; name: string; subtotal: number }[];
  totalGilPerVoyage: number;
  totalDurationMin: number;
  gilPerHour: number;
}

/** Result row for the Loot Pricer table. */
export type Indicator = 'SELL' | 'HOLD' | 'SKIP';

export interface LootPricerRow {
  itemId: number;
  name: string;
  zones: string[];
  tier: Tier;
  minPrice: number | null;
  avgPrice: number | null;
  velocity: number;
  indicator: Indicator;
}
