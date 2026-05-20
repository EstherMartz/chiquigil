import { Link } from 'react-router-dom';
import type { QuestItemRow } from './runQuestItemFlip';

interface Props {
  rows: QuestItemRow[];
}

function fmtGil(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString();
}

function fmtRevenue(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

export function QuestItemFlipResults({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="font-mono text-xs text-text-low py-8 text-center">
        No quest items match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="font-mono text-[11px] w-full">
        <thead className="text-text-low">
          <tr>
            <th className="text-left px-2 py-1">Lv</th>
            <th className="text-left px-2 py-1">Category</th>
            <th className="text-left px-2 py-1">Quest</th>
            <th className="text-left px-2 py-1">Item</th>
            <th className="text-right px-2 py-1">Qty</th>
            <th className="text-right px-2 py-1">NQ MB</th>
            <th className="text-right px-2 py-1">HQ MB</th>
            <th className="text-right px-2 py-1">Listings</th>
            <th className="text-right px-2 py-1">Vel/day</th>
            <th className="text-right px-2 py-1">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.questId}-${row.itemId}`} className="border-t border-border-low">
              <td className="px-2 py-1">{row.level}</td>
              <td className="px-2 py-1 text-text-low">{row.categoryName}</td>
              <td className="px-2 py-1">{row.questName}</td>
              <td className="px-2 py-1">
                <Link to={`/item/${row.itemId}`} className="text-text-high hover:text-gold">
                  {row.itemName}
                </Link>
              </td>
              <td className="px-2 py-1 text-right">{row.qty}</td>
              <td className="px-2 py-1 text-right">{fmtGil(row.nqPrice)}</td>
              <td className="px-2 py-1 text-right">{fmtGil(row.hqPrice)}</td>
              <td className="px-2 py-1 text-right">{row.listingCount}</td>
              <td className="px-2 py-1 text-right">{row.velocity.toFixed(1)}</td>
              <td className="px-2 py-1 text-right">{fmtRevenue(row.totalRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
