import { Link } from 'react-router-dom';
import { useUiStore, rowPadClass, type SortKey } from '../ui/uiStore';
import type { WatchlistRow } from './buildRows';
import { CraftTag } from './CraftTag';
import { fmtGil } from '../../lib/format';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { CATEGORY_TO_TRADING_PRESET } from './categoryPresetMap';
import { MarketStateBadge } from '../../components/MarketStateBadge';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import { CopyButton } from '../../components/CopyButton';
import type { CsvColumn } from '../../lib/csv';
import { Sparkline } from '../../components/Sparkline';
import { SparklineShimmer } from '../../components/SparklineShimmer';
import { InfoTooltip } from '../../components/InfoTooltip';
import { colorFromDelta } from '../../features/sparklines/sparklineColor';
import { formatSparklineTooltip } from '../../features/sparklines/sparklineTooltip';
import { detectAlert, ALERT_LABEL, ALERT_CLASS } from './alerts';
import type { Valuation } from '../fairvalue/fairValue';

// Valuation chip styling — only cheap/rich are surfaced (fair/unknown are hidden).
const VALUATION_CLASS: Partial<Record<Valuation, string>> = {
  cheap: 'text-jade border-jade/40',
  rich: 'text-gold border-gold/40',
};
function ValuationChip({ valuation }: { valuation: Valuation | undefined }) {
  if (!valuation || !VALUATION_CLASS[valuation]) return null;
  return (
    <span
      className={`border ${VALUATION_CLASS[valuation]} px-1.5 py-0.5 leading-none text-[9px] tracking-widest uppercase rounded-sm`}
      title="Fair-value read vs this item's own recent price range"
    >
      {valuation}
    </span>
  );
}

// 4-tier profit color ramp, mirroring the design's watchlist proposal:
//   ≥ 50k → jade (strong play)
//   ≥  5k → gold (solid)
//   ≥   0 → cream (neutral)
//    < 0 → crimson (bleeding)
function profitTone(profit: number | null): { text: string; bar: string } {
  if (profit == null) return { text: 'text-text-low', bar: 'bg-border-base' };
  if (profit >= 50000) return { text: 'text-jade', bar: 'bg-jade' };
  if (profit >= 5000) return { text: 'text-gold', bar: 'bg-gold' };
  if (profit >= 0) return { text: 'text-text-cream', bar: 'bg-text-low' };
  return { text: 'text-crimson', bar: 'bg-crimson' };
}

interface Col { key: SortKey | null; label: string; align?: 'right'; hideOnMobile?: boolean; tip?: string }

const csvColumns = (applyMarketTax: boolean): CsvColumn<WatchlistRow>[] => [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Crafter' },
  { key: 'lvl', label: 'Level' },
  { key: 'cat', label: 'Category' },
  { key: 'dcMinNQ', label: 'DC Min NQ', value: (r) => r.dcMinNQ ?? 'N/A' },
  { key: 'dcMinHQ', label: 'DC Min HQ', value: (r) => r.dcMinHQ ?? 'N/A' },
  { key: 'pMinNQ', label: 'Phantom Min NQ', value: (r) => r.pMinNQ ?? 'N/A' },
  { key: 'pMinHQ', label: 'Phantom Min HQ', value: (r) => r.pMinHQ ?? 'N/A' },
  { key: 'pAvgNQ', label: 'Phantom Avg NQ', value: (r) => r.pAvgNQ ?? 'N/A' },
  { key: 'pAvgHQ', label: 'Phantom Avg HQ', value: (r) => r.pAvgHQ ?? 'N/A' },
  { key: 'dcSpd', label: 'DC Velocity' },
  { key: 'delta', label: 'Trend', value: (r) => r.delta ?? 'N/A' },
  { key: 'materialCost', label: 'Material Cost', value: (r) => r.materialCost ?? 'N/A' },
  { key: 'profit', label: applyMarketTax ? 'Profit (net of tax)' : 'Profit (gross)', value: (r) => r.profit ?? 'N/A' },
  { key: 'gilPerDay', label: 'Gil/day', value: (r) => r.gilPerDay ?? 'N/A' },
];

export function WatchlistTable({ rows, onSelect, sparklineMap, sparklineLoading, applyMarketTax = true, valuationById }: {
  rows: WatchlistRow[];
  onSelect: (id: number) => void;
  sparklineMap?: Map<number, (number | null)[]>;
  sparklineLoading?: boolean;
  applyMarketTax?: boolean;
  valuationById?: Map<number, Valuation>;
}) {
  const { catFilter, sortKey, sortDir, setSort, density } = useUiStore();
  const lm = useLoadMore(rows, 25);
  const rowY = rowPadClass(density);
  const showSparkline = sparklineMap != null;

  const cols: Col[] = [
    { key: 'name', label: 'Item' },
    { key: 'crafter', label: 'Craft' },
    { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
    { key: 'dc', label: 'Sale', align: 'right' },
    ...(showSparkline ? [{ key: null as SortKey | null, label: '', hideOnMobile: true }] : []),
    { key: 'trend', label: 'Trend', hideOnMobile: true },
    {
      key: 'profit', label: 'Profit', align: 'right',
      tip: applyMarketTax
        ? 'Profit per craft, net of the 5% marketboard tax. Turn off in Settings → Display.'
        : 'Gross profit per craft (sale − materials). Marketboard tax not applied — toggle in Settings → Display.',
    },
    { key: 'gilDay', label: 'Gil/day', align: 'right' },
    { key: 'spd', label: 'Velocity', align: 'right', hideOnMobile: true },
  ];

  if (rows.length === 0) {
    const presetId = CATEGORY_TO_TRADING_PRESET[catFilter];
    return (
      <div className="border border-border-base bg-bg-card p-12 text-center text-text-low italic">
        <div className="text-aether/70 mb-1 text-[18px]" aria-hidden>❖</div>
        <div>The page is blank for this filter.</div>
        {presetId && (
          <Link
            to={`/trading?preset=${presetId}`}
            className="not-italic mt-3 inline-block font-mono text-[11px] tracking-widest uppercase text-aether hover:text-gold transition-colors"
          >
            Scry the market for top {catFilter.toLowerCase()} →
          </Link>
        )}
      </div>
    );
  }

  const alertsFiring = rows.filter((r) => detectAlert(r) != null).length;

  return (
    <div className="border border-border-base bg-bg-card">
      <div className="flex justify-between items-center gap-3 px-3 py-2 border-b border-border-base">
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-text-low">{lm.shown} of {lm.total}</span>
          {alertsFiring > 0 && (
            <span className="inline-flex items-center gap-1.5 border border-crimson/40 text-crimson px-2 py-0.5 rounded-sm text-[10px] tracking-widest uppercase">
              <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-crimson" />
              {alertsFiring} alert{alertsFiring === 1 ? '' : 's'} firing
            </span>
          )}
        </div>
        <ExportCsvButton rows={rows} columns={csvColumns(applyMarketTax)} filename={`watchlist-${new Date().toISOString().slice(0, 10)}.csv`} />
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-border-base">
        {lm.visible.map((r) => {
          const alert = detectAlert(r);
          const tone = profitTone(r.profit);
          return (
            <div key={r.id} className="p-3 pl-2 flex gap-2 active:bg-bg-card-hi transition-colors">
              <span aria-hidden className={`w-[3px] rounded-sm flex-shrink-0 ${tone.bar}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <Link
                    to={`/item/${r.id}`}
                    className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 flex-1 min-w-0 break-words"
                  >
                    {r.name}
                  </Link>
                  <CopyButton text={r.name} />
                  <button
                    onClick={() => onSelect(r.id)}
                    className="font-mono text-text-low hover:text-aether active:text-aether transition-colors shrink-0 px-2 py-2 -mr-2"
                    aria-label="Open per-item settings"
                  >
                    ⚙
                  </button>
                </div>
                <div className="font-mono text-[11px] text-text-low mt-1 flex items-center gap-2 flex-wrap">
                  <CraftTag crafter={r.crafter} status={r.craftStatus} />
                  <span>Lv {r.lvl}</span>
                  <span>·</span>
                  <span>{r.cat}{r.subcat ? ` · ${r.subcat}` : ''}</span>
                  <ValuationChip valuation={valuationById?.get(r.id)} />
                  {alert && (
                    <span className={`border ${ALERT_CLASS[alert]} px-1.5 py-0.5 leading-none text-[9px] tracking-widest uppercase rounded-sm`}>
                      {ALERT_LABEL[alert]}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[12px]">
                  <MobileMetric label="Sale">
                    {r.craftable === false
                      ? <span className="text-text-low text-[10px] tracking-widest uppercase">sale-only</span>
                      : r.dcMinHQ ? <>{fmtGil(r.dcMinHQ)}<span className="text-text-low text-[10px] ml-1">HQ</span></>
                      : r.dcMinNQ ? <>{fmtGil(r.dcMinNQ)}<span className="text-text-low text-[10px] ml-1">NQ</span></>
                      : <span className="text-text-low">—</span>}
                  </MobileMetric>
                  <MobileMetric label="Profit">
                    {r.craftable === false
                      ? <span className="text-text-low">—</span>
                      : r.craftable === null
                        ? <span className="text-text-low">…</span>
                        : r.profit != null
                          ? <span className={tone.text}>{fmtGil(r.profit)}</span>
                          : <span className="text-text-low">—</span>}
                  </MobileMetric>
                  <MobileMetric label="Gil/day">
                    {r.gilPerDay != null ? fmtGil(Math.round(r.gilPerDay)) : <span className="text-text-low">—</span>}
                  </MobileMetric>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {cols.map((c, idx) => {
              const sorted = sortKey === c.key;
              const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              const isClickable = c.key != null;
              return (
                <th
                  key={`${c.key}-${idx}`}
                  onClick={() => isClickable && setSort(c.key as SortKey)}
                  className={`px-3 py-2 bg-bg-card-hi font-mono text-[10px] tracking-widest uppercase ${
                    isClickable ? 'cursor-pointer' : ''
                  } select-none whitespace-nowrap sticky top-0 z-10 ${
                    sorted ? 'text-aether' : isClickable ? 'text-text-dim hover:text-aether' : 'text-text-dim'
                  } ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideOnMobile ? 'hidden md:table-cell' : ''}`}
                >
                  {c.tip ? (
                    <InfoTooltip label={c.tip}>
                      <span className="border-b border-dotted border-text-low/50">{c.label}</span>
                    </InfoTooltip>
                  ) : c.label}{arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {lm.visible.map((r) => {
            const alert = detectAlert(r);
            const tone = profitTone(r.profit);
            return (
            <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
              <td className={`pl-2 pr-3 ${rowY}`}>
                <div className="flex items-stretch gap-2">
                  <span aria-hidden className={`w-[3px] rounded-sm flex-shrink-0 self-stretch ${tone.bar}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <Link
                        to={`/item/${r.id}`}
                        className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 text-left"
                      >
                        {r.name}
                      </Link>
                      <CopyButton text={r.name} />
                      <button
                        onClick={() => onSelect(r.id)}
                        className="font-mono text-[10px] text-text-low hover:text-aether transition-colors shrink-0"
                        title="Per-item recipe settings (craft intermediates, craft time, history)"
                        aria-label="Open per-item settings"
                      >
                        ⚙
                      </button>
                      <ValuationChip valuation={valuationById?.get(r.id)} />
                      {alert && (
                        <span className={`border ${ALERT_CLASS[alert]} px-1.5 py-0.5 leading-none text-[9px] tracking-widest uppercase rounded-sm`}>
                          {ALERT_LABEL[alert]}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-text-low mt-0.5">
                      {r.cat}{r.subcat ? ` · ${r.subcat}` : ''}
                      {r.staleDays != null && r.staleDays > 3 && (
                        <span className="text-crimson ml-2">{r.staleDays.toFixed(0)}d stale</span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className={`px-3 ${rowY}`}><CraftTag crafter={r.crafter} status={r.craftStatus} /></td>
              <td className={`px-3 ${rowY} font-mono text-right text-text-low hidden md:table-cell`}>{r.lvl}</td>
              <td className={`px-3 ${rowY} font-mono text-right`}>
                {r.craftable === false
                  ? <span className="text-text-low text-[10px] tracking-widest uppercase">sale-only</span>
                  : r.dcMinHQ ? <>{fmtGil(r.dcMinHQ)} <span className="text-text-low text-[10px]">HQ</span></>
                  : r.dcMinNQ ? <>{fmtGil(r.dcMinNQ)} <span className="text-text-low text-[10px]">NQ</span></>
                  : <span className="text-text-low">—</span>}
              </td>
              {showSparkline && (
                <td className={`px-3 ${rowY} hidden md:table-cell`}>
                  {(() => {
                    const buckets = sparklineMap!.get(r.id);
                    if (!buckets) return sparklineLoading ? <SparklineShimmer /> : null;
                    return (
                      <InfoTooltip label={<pre className="font-mono text-[10px] whitespace-pre">{formatSparklineTooltip(buckets)}</pre>}>
                        <Sparkline points={buckets} color={colorFromDelta(r.delta)} />
                      </InfoTooltip>
                    );
                  })()}
                </td>
              )}
              <td className={`px-3 ${rowY} hidden md:table-cell`}>
                <MarketStateBadge delta={r.delta} listings={r.pListings} />
              </td>
              <td className={`px-3 ${rowY} font-mono text-right`}>
                {r.craftable === false
                  ? <span className="text-text-low">—</span>
                  : r.craftable === null
                    ? <span className="text-text-low">…</span>
                    : r.profit != null
                      ? <span className={tone.text}>{fmtGil(r.profit)}</span>
                      : <span className="text-text-low">—</span>}
              </td>
              <td className={`px-3 ${rowY} font-mono text-right`}>
                {r.gilPerDay != null ? fmtGil(Math.round(r.gilPerDay)) : <span className="text-text-low">—</span>}
              </td>
              <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>
                {r.dcSpd.toFixed(1)}
                {r.clearDays != null && r.clearDays > 0 && (
                  <div className="text-[9px] text-text-low" title="Days to clear current listings at this velocity">
                    {r.clearDays < 10 ? r.clearDays.toFixed(1) : Math.round(r.clearDays)}d clear
                  </div>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      <LoadMoreFooter
        hasMore={lm.hasMore}
        total={lm.total}
        shown={lm.shown}
        onLoadMore={lm.loadMore}
      />
    </div>
  );
}

function MobileMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-text-low">{label}</div>
      <div className="mt-0.5 truncate">{children}</div>
    </div>
  );
}
