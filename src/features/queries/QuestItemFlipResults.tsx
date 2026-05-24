import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { QuestItemRow, QuestItemSort, SortDir } from './runQuestItemFlip';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: QuestItemRow[];
  totalCandidates: number;
  sortBy: QuestItemSort;
  sortDir: SortDir;
  onSort: (key: QuestItemSort) => void;
}

const CSV_COLUMNS: CsvColumn<QuestItemRow>[] = [
  { key: 'questId', label: 'Quest ID' },
  { key: 'questName', label: 'Quest' },
  { key: 'categoryName', label: 'Category' },
  { key: 'level', label: 'Level' },
  { key: 'itemId', label: 'Item ID' },
  { key: 'itemName', label: 'Item' },
  { key: 'qty', label: 'Qty' },
  { key: 'nqPrice', label: 'NQ MB' },
  { key: 'hqPrice', label: 'HQ MB' },
  { key: 'listingCount', label: 'Listings' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'totalRevenue', label: 'Revenue' },
];

function fmtRevenue(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function SortableHeader({
  active, dir, onClick, children, align = 'right', hideOnMobile = false,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
}) {
  const arrow = active ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th
      scope="col"
      className={`px-3 py-2 cursor-pointer select-none text-${align} ${
        hideOnMobile ? 'hidden md:table-cell' : ''
      } ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
    >
      {children}{arrow}
    </th>
  );
}

interface ColumnDef {
  key: QuestItemSort;
  label: string;
  align: 'left' | 'right';
  hideOnMobile?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'level', label: 'Lv', align: 'right' },
  { key: 'category', label: 'Category', align: 'left', hideOnMobile: true },
  { key: 'quest', label: 'Quest', align: 'left', hideOnMobile: true },
  { key: 'item', label: 'Item', align: 'left' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'nq', label: 'NQ', align: 'right' },
  { key: 'hq', label: 'HQ', align: 'right' },
  { key: 'listings', label: 'Listings', align: 'right', hideOnMobile: true },
  { key: 'velocity', label: 'Sales/day', align: 'right', hideOnMobile: true },
  { key: 'revenue', label: 'Revenue', align: 'right' },
];

export function QuestItemFlipResults({ rows, totalCandidates, sortBy, sortDir, onSort }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={0}
      emptyState={
        <EmptyResults>
          No quest items match these filters. Try clearing the category, lowering Min listings, or switching HQ mode.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`quest-items-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              {COLUMNS.map((c) => (
                <SortableHeader
                  key={c.key}
                  active={sortBy === c.key}
                  dir={sortDir}
                  onClick={() => onSort(c.key)}
                  align={c.align}
                  hideOnMobile={c.hideOnMobile}
                >
                  {c.label}
                </SortableHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={`${row.questId}-${row.itemId}`} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{row.level}</td>
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs hidden md:table-cell`}>{row.categoryName}</td>
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs hidden md:table-cell`}>{row.questName}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={row.itemId} name={row.itemName} />
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{row.qty}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(row.nqPrice)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(row.hqPrice)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{row.listingCount}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{row.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-gold-hi`}>{fmtRevenue(row.totalRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
