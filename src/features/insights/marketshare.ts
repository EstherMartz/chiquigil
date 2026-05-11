import type { WatchlistRow } from '../watchlist/buildRows';

export interface MarketshareRow {
  id: number;
  name: string;
  crafter: WatchlistRow['crafter'];
  cat: WatchlistRow['cat'];
  craftable: boolean;
  gilFlow: number;
  velocity: number;
  unitValue: number;
}

export function rankMarketshare(rows: WatchlistRow[]): MarketshareRow[] {
  const out: MarketshareRow[] = [];
  for (const r of rows) {
    if (r.craftable === null) continue;
    if (r.dcSpd <= 0) continue;
    if (r.craftable && (r.gilPerDay == null || r.gilPerDay <= 0)) continue;

    if (r.craftable && r.gilPerDay && r.profit) {
      out.push({
        id: r.id, name: r.name, crafter: r.crafter, cat: r.cat,
        craftable: true, gilFlow: r.gilPerDay, velocity: r.dcSpd, unitValue: r.profit,
      });
    } else if (!r.craftable) {
      const unit = r.dcMinHQ ?? r.dcMinNQ ?? 0;
      if (unit <= 0) continue;
      out.push({
        id: r.id, name: r.name, crafter: r.crafter, cat: r.cat,
        craftable: false, gilFlow: unit * r.dcSpd, velocity: r.dcSpd, unitValue: unit,
      });
    }
  }
  return out.sort((a, b) => b.gilFlow - a.gilFlow);
}
