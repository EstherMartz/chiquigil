import { Link } from 'react-router-dom';
import type { QuestItemRow, QuestItemSort, SortDir } from './runQuestItemFlip';

interface Props {
  rows: QuestItemRow[];
  sortBy: QuestItemSort;
  sortDir: SortDir;
  onSort: (key: QuestItemSort) => void;
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

interface ColumnDef {
  key: QuestItemSort;
  label: string;
  align: 'left' | 'right';
}

const COLUMNS: ColumnDef[] = [
  { key: 'level', label: 'Lv', align: 'left' },
  { key: 'category', label: 'Category', align: 'left' },
  { key: 'quest', label: 'Quest', align: 'left' },
  { key: 'item', label: 'Item', align: 'left' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'nq', label: 'NQ MB', align: 'right' },
  { key: 'hq', label: 'HQ MB', align: 'right' },
  { key: 'listings', label: 'Listings', align: 'right' },
  { key: 'velocity', label: 'Vel/day', align: 'right' },
  { key: 'revenue', label: 'Revenue', align: 'right' },
];

export function QuestItemFlipResults({ rows, sortBy, sortDir, onSort }: Props) {
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
            {COLUMNS.map((c) => {
              const active = sortBy === c.key;
              const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              const tone = active ? 'text-gold' : '';
              const alignClass = c.align === 'right' ? 'text-right' : 'text-left';
              return (
                <th
                  key={c.key}
                  scope="col"
                  onClick={() => onSort(c.key)}
                  className={`${alignClass} px-2 py-1 cursor-pointer select-none hover:text-text-high ${tone}`}
                >
                  {c.label}{arrow}
                </th>
              );
            })}
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
