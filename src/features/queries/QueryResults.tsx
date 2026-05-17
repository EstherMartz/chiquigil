import { useMemo, useState } from 'react';
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { QueryResultRow } from './types';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: QueryResultRow[];
  totalCandidates: number;
  skippedChunks: number;
  gatheringCatalog?: GatheringCatalog;
}

type SortKey = 'name' | 'unitPrice' | 'averagePrice' | 'dealPct' | 'velocity' | 'gilFlow';
type SortDir = 'asc' | 'desc';

const COLS: { key: SortKey | null; label: string; hint?: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: null, label: '#' },
  { key: 'name', label: 'Item' },
  { key: 'unitPrice', label: 'Current', hint: 'Cheapest active listing right now on the selected scope.', align: 'right' },
  { key: 'averagePrice', label: 'Average', hint: '7-day average sale price from Universalis history.', align: 'right', hideOnMobile: true },
  { key: 'dealPct', label: 'Disc.', hint: 'How far below the 7-day average the current cheapest listing is.', align: 'right' },
  { key: 'velocity', label: 'Velocity', hint: 'Sales per day on the selected scope (home world or DC).', align: 'right', hideOnMobile: true },
  { key: 'gilFlow', label: 'Gil / day', hint: 'Current price × velocity. Daily gil flow if you cleared every sale at this price.', align: 'right' },
];

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  unitPrice: 'asc',
  averagePrice: 'desc',
  dealPct: 'desc',
  velocity: 'desc',
  gilFlow: 'desc',
};

const CSV_COLUMNS: CsvColumn<QueryResultRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'averagePrice', label: 'Average Price' },
  { key: 'dealPct', label: 'Deal %' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'gilFlow', label: 'Gil Flow' },
  { key: 'hq', label: 'HQ' },
];

export function QueryResults({ rows, totalCandidates, skippedChunks, gatheringCatalog }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  return (
    <ResultTableScaffold
      rows={sortedRows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          The ledger comes up empty. Loosen the discount, widen the price band, or pick a roomier category.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`query-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              {COLS.map((c) => {
                const sortable = c.key !== null;
                const sorted = sortable && sortKey === c.key;
                const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                const align = c.align === 'right' ? 'text-right' : 'text-left';
                const hide = c.hideOnMobile ? 'hidden md:table-cell' : '';
                const tone = sorted ? 'text-gold' : 'text-text-dim';
                const interactive = sortable ? 'cursor-pointer select-none hover:text-aether' : '';
                const labelNode = c.hint ? (
                  <InfoTooltip label={c.hint}>{c.label}{arrow}</InfoTooltip>
                ) : (
                  <>{c.label}{arrow}</>
                );
                return (
                  <th
                    key={c.label}
                    onClick={sortable ? () => toggleSort(c.key as SortKey) : undefined}
                    className={`px-3 py-2 ${align} ${hide} ${tone} ${interactive}`}
                  >
                    {labelNode}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={
                      <>
                        {r.hq && <HqStar leading />}
                        {gatheringCatalog && <GatherBadge info={gatheringCatalog.get(r.id)} />}
                      </>
                    }
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.unitPrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.averagePrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>-{r.dealPct}%</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>{fmtGil(Math.round(r.gilFlow))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

function GatherBadge({ info }: { info: { level: number; timed: boolean; hidden: boolean } | undefined }) {
  if (!info) return null;
  return (
    <span
      className={`ml-1.5 font-mono text-[9px] tracking-widest uppercase px-1 py-0.5 leading-none border ${
        info.timed
          ? 'text-gold border-gold/60'
          : 'text-aether border-border-base'
      }`}
      title={info.timed ? 'Timed gathering node (ephemeral/rare-pop)' : 'Untimed gathering node'}
    >
      {info.timed ? '⏱ Timed' : 'Gather'} · Lv {info.level || '?'}
    </span>
  );
}
