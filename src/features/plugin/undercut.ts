import type { OwnListing } from './protocol';

export type UndercutStatus = 'undercut' | 'holding' | 'unknown';

export interface UndercutRow {
  itemId: number;
  hq: boolean;
  yourPrice: number;
  qty: number;
  retainer?: string;
  /** Current market floor for this item+quality, or null when unknown. */
  floor: number | null;
  /** How far below your price the cheapest listing sits (>0 means you're beaten). */
  undercutBy: number | null;
  status: UndercutStatus;
}

const STATUS_RANK: Record<UndercutStatus, number> = { undercut: 0, holding: 1, unknown: 2 };

/**
 * Compare the player's own retainer listings against the current market floor.
 * `floorOf` returns the cheapest listed price for an item+quality (it includes
 * the player's own listing, so a match means they hold the floor). Pure.
 */
export function computeUndercuts(
  listings: OwnListing[],
  floorOf: (itemId: number, hq: boolean) => number | null,
): UndercutRow[] {
  const rows: UndercutRow[] = listings.map((l) => {
    const floor = floorOf(l.itemId, l.hq);
    let status: UndercutStatus = 'unknown';
    let undercutBy: number | null = null;
    if (floor != null) {
      if (floor < l.unitPrice) {
        status = 'undercut';
        undercutBy = l.unitPrice - floor;
      } else {
        status = 'holding';
        undercutBy = 0;
      }
    }
    return {
      itemId: l.itemId, hq: l.hq, yourPrice: l.unitPrice, qty: l.qty, retainer: l.retainer,
      floor, undercutBy, status,
    };
  });

  return rows.sort((a, b) => {
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return (b.undercutBy ?? 0) - (a.undercutBy ?? 0);
  });
}
