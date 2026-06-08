import type { DcFlipRow } from './dcFlip';

export interface GroupedRow extends DcFlipRow {
  /** false when maxCapital is set and this row's buy price pushes the running total over the cap. */
  withinBudget: boolean;
}

export interface DcFlipGroup {
  world: string;
  rows: GroupedRow[];        // ordered by netSpread desc
  itemCount: number;         // total matching items in the group
  fitCount: number;          // items within the capital cap (== itemCount when no cap)
  totalCapital: number;      // sum of dcPrice over the FITTING rows
  totalNetSpread: number;    // sum of netSpread over the FITTING rows
  gilPerMillion: number;     // totalNetSpread per 1M of totalCapital
}

export interface GroupOpts {
  /** Max gil to spend buying in one trip. Undefined/0 = no cap. */
  maxCapital?: number;
}

export function gilPerMillion(totalNetSpread: number, totalCapital: number): number {
  if (totalCapital <= 0) return 0;
  return totalNetSpread / totalCapital * 1_000;
}

export function groupByWorld(rows: DcFlipRow[], opts: GroupOpts): DcFlipGroup[] {
  const cap = opts.maxCapital && opts.maxCapital > 0 ? opts.maxCapital : Infinity;

  const byWorld = new Map<string, DcFlipRow[]>();
  for (const r of rows) {
    const list = byWorld.get(r.buyWorld) ?? [];
    list.push(r);
    byWorld.set(r.buyWorld, list);
  }

  const groups: DcFlipGroup[] = [];
  for (const [world, list] of byWorld) {
    const ordered = [...list].sort((a, b) => b.netSpread - a.netSpread);

    let running = 0;
    let totalCapital = 0;
    let totalNetSpread = 0;
    let fitCount = 0;
    let exceeded = false;
    const groupedRows: GroupedRow[] = ordered.map((r) => {
      const within = !exceeded && running + r.dcPrice <= cap;
      if (within) {
        running += r.dcPrice;
        totalCapital += r.dcPrice;
        totalNetSpread += r.netSpread;
        fitCount += 1;
      } else {
        exceeded = true;
      }
      return { ...r, withinBudget: within };
    });

    groups.push({
      world,
      rows: groupedRows,
      itemCount: ordered.length,
      fitCount,
      totalCapital,
      totalNetSpread,
      gilPerMillion: gilPerMillion(totalNetSpread, totalCapital),
    });
  }

  return groups.sort((a, b) =>
    b.gilPerMillion - a.gilPerMillion || b.totalNetSpread - a.totalNetSpread,
  );
}
