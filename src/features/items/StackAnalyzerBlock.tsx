import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { QualityTab } from './QualityTab';
import { fmtGil, fmtRelative } from '../../lib/format';
import {
  soldByStack, listedByStack, isStackable, mergeStacks, suggestStack, partitionStacks,
  type MergedStackRow, type StackSuggestion, type RareSummary,
} from './stackAnalysis';

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;

interface BlockProps { itemId: number; scope: string; listings: WorldListing[]; canHq: boolean }

/** Query wrapper: fetches 90-day home-world history, delegates to the pure view. */
export function StackAnalyzerBlock({ itemId, scope, listings, canHq }: BlockProps) {
  const q = useQuery({
    queryKey: ['item-history', scope, itemId, 90],
    enabled: Number.isFinite(itemId) && itemId > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await fetchHistoryWithin(scope, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
  });
  const entries: HistoryEntry[] = q.data ?? [];

  return (
    <section>
      <SectionHeader label="Stack size analyzer" compact />
      {q.isLoading
        ? <Spinner label="Loading 90-day sale history…" />
        : <StackAnalyzerView entries={entries} listings={listings} canHq={canHq} />}
    </section>
  );
}

interface ViewProps { entries: HistoryEntry[]; listings: WorldListing[]; canHq: boolean }

/** Pure presentation: NQ/HQ toggle + demand and supply panels. Exported for tests. */
export function StackAnalyzerView({ entries, listings, canHq }: ViewProps) {
  const [hq, setHq] = useState(false);
  const sold = soldByStack(entries, hq);
  const listed = listedByStack(listings, hq);
  const stackable = isStackable(sold, listed);
  const rows = mergeStacks(sold, listed);
  const suggestion = suggestStack(sold, listed);

  return (
    <div>
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}

      {!stackable ? (
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          Always sold as single units — stack analysis doesn't apply.
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          No {hq ? 'HQ' : 'NQ'} data in the last 90 days.
        </div>
      ) : (
        <StackDemandSupplyChart rows={rows} suggestion={suggestion} />
      )}
    </div>
  );
}

const MARKER_H = 14; // px, sweet-spot marker row
const DEMAND_H = 64; // px, demand (sold) zone
const SUPPLY_H = 48; // px, supply (listed) zone
const MIN_BAR = 3;   // px, floor so a 1-sale stack still shows a tick

/** The actionable "list at" caption, derived from suggestStack. */
function suggestionCaption(suggestion: StackSuggestion, rows: MergedStackRow[]): string {
  const row = rows.find((r) => r.stack === suggestion.stack);
  const sales = row?.sales ?? 0;
  const listed = row?.listedCount ?? 0;
  const price = `~${fmtGil(suggestion.unitPrice)}/u`;
  return suggestion.kind === 'gap'
    ? `◆ Supply gap at stack ${suggestion.stack} — ${sales} sold/90d, ${price}, ${listed} listed now.`
    : `◆ Most liquid at stack ${suggestion.stack} — ${sales} sold/90d, ${price}.`;
}

function rareTitle(rare: RareSummary): string {
  return `Stacks ${rare.sizes.join(', ')} · ${rare.totalSales} sold · ${rare.totalListed} listed`;
}

/**
 * Vertical diverging column chart: demand (90-day sales) grows up, supply (live listings)
 * grows down from a shared stack-size baseline. The long tail of low-volume sizes collapses
 * into a "rare" chip; a gold ~/unit line overlays the demand band; the recommended stack is
 * marked; per-column detail opens in a hover card.
 */
export function StackDemandSupplyChart({
  rows, suggestion,
}: { rows: MergedStackRow[]; suggestion: StackSuggestion | null }) {
  const { shown, rare } = partitionStacks(rows, suggestion);
  const maxSales = Math.max(1, ...shown.map((r) => r.sales));
  const maxListed = Math.max(1, ...shown.map((r) => r.listedCount));
  const recommended = suggestion?.stack;
  const n = shown.length;

  const [hover, setHover] = useState<{ row: MergedStackRow; el: HTMLElement } | null>(null);
  const clearHover = (stack: number) =>
    setHover((h) => (h?.row.stack === stack ? null : h));

  // Price line: a gold ~/unit polyline over the demand band, on a secondary price scale.
  // Columns are equal-width (no flex gap), so x = i + 0.5 lands at each column centre.
  const priced = shown.filter((r) => r.sales > 0).map((r) => r.medianUnitPrice);
  const priceMin = priced.length ? Math.min(...priced) : 0;
  const priceMax = priced.length ? Math.max(...priced) : 0;
  const priceY = (p: number) =>
    priceMax === priceMin ? DEMAND_H / 2 : DEMAND_H * (0.85 - 0.7 * ((p - priceMin) / (priceMax - priceMin)));
  const segments: string[][] = [];
  let run: string[] = [];
  shown.forEach((r, i) => {
    if (r.sales > 0) run.push(`${i + 0.5},${priceY(r.medianUnitPrice).toFixed(2)}`);
    else if (run.length) { segments.push(run); run = []; }
  });
  if (run.length) segments.push(run);

  return (
    <div className="border border-border-base bg-bg-card">
      <div className="flex items-center gap-4 px-3 pt-2 font-mono text-[10px] tracking-widest uppercase">
        <span className="text-jade/80">▲ sold (90d)</span>
        <span className="text-aether/80">▼ listed now</span>
        <span className="text-gold/80">◆ ~/unit</span>
      </div>

      <div className="overflow-x-auto px-3 pb-2 pt-1">
        <div className="flex items-stretch">
          {/* Equal-width column band (no gap → exact SVG alignment); relative for the price overlay. */}
          <div className="relative flex items-stretch flex-1">
            {shown.map((r) => {
              const isRec = r.stack === recommended;
              return (
                <div
                  key={r.stack}
                  tabIndex={0}
                  aria-label={`Stack ${r.stack}`}
                  onMouseEnter={(e) => setHover({ row: r, el: e.currentTarget })}
                  onMouseLeave={() => clearHover(r.stack)}
                  onFocus={(e) => setHover({ row: r, el: e.currentTarget })}
                  onBlur={() => clearHover(r.stack)}
                  className={`flex flex-col items-center min-w-[2.25rem] flex-1 outline-none focus-visible:bg-bg-card-hi ${r.isGap ? 'bg-jade/10' : ''}`}
                >
                  {/* Sweet-spot marker */}
                  <div className="flex items-end justify-center" style={{ height: MARKER_H }}>
                    {isRec && <span className="text-gold text-[10px] leading-none" aria-hidden>▾</span>}
                  </div>
                  {/* Demand — grows up */}
                  <div className="flex items-end justify-center w-full" style={{ height: DEMAND_H }}>
                    {r.sales > 0 && (
                      <div
                        className={`w-3 ${r.isGap ? 'bg-jade' : 'bg-jade/40'}`}
                        style={{ height: `${Math.max(MIN_BAR, (r.sales / maxSales) * DEMAND_H)}px` }}
                        aria-hidden
                      />
                    )}
                  </div>
                  {/* Axis label */}
                  <div className="py-1 font-mono text-[11px] text-text-cream whitespace-nowrap">
                    {r.stack}
                    {r.isGap && <span className="text-jade ml-0.5" aria-hidden>✓</span>}
                  </div>
                  {/* Supply — grows down */}
                  <div className="flex items-start justify-center w-full" style={{ height: SUPPLY_H }}>
                    {r.listedCount > 0 && (
                      <div
                        className="w-3 bg-aether/40"
                        style={{ height: `${Math.max(MIN_BAR, (r.listedCount / maxListed) * SUPPLY_H)}px` }}
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {segments.length > 0 && (
              <svg
                className="absolute left-0 text-gold/70 pointer-events-none"
                style={{ top: MARKER_H, height: DEMAND_H }}
                width="100%"
                viewBox={`0 0 ${n} ${DEMAND_H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {segments.map((seg, si) => (
                  <polyline
                    key={si}
                    points={seg.join(' ')}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}
          </div>

          {rare && (
            <div
              title={rareTitle(rare)}
              aria-label={rareTitle(rare)}
              className="shrink-0 ml-2 self-stretch flex items-center px-2 border-l border-border-base"
            >
              <span className="font-mono text-[10px] text-text-low leading-tight max-w-[5rem]">
                +{rare.count} rare sizes
              </span>
            </div>
          )}
        </div>
      </div>

      {suggestion && (
        <div className="border-t border-border-base px-3 py-2 font-mono text-[11px] text-jade">
          {suggestionCaption(suggestion, rows)}
        </div>
      )}

      {hover && <ColumnTooltip row={hover.row} anchor={hover.el} />}
    </div>
  );
}

/** Portaled, viewport-clamped detail card for a hovered/focused chart column. */
function ColumnTooltip({ row, anchor }: { row: MergedStackRow; anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    const card = ref.current;
    const cw = card?.offsetWidth ?? 0;
    const ch = card?.offsetHeight ?? 0;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));
    let top = r.bottom + 8;
    if (ch && top + ch > window.innerHeight - 8 && r.top - 8 - ch > 8) top = r.top - 8 - ch;
    setPos({ top, left });
  }, [anchor]);

  useLayoutEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="bg-bg-card border border-border-base shadow-2xl px-3 py-2 font-mono text-[11px] whitespace-nowrap">
        <div className="text-gold-hi">Stack {row.stack}</div>
        {row.sales > 0 ? (
          <>
            <div className="text-text-low">
              {row.units} units · {row.sales} {row.sales === 1 ? 'sale' : 'sales'} · ~{fmtGil(row.medianUnitPrice)}/u
            </div>
            <div className="text-text-low">last sold {fmtRelative(row.lastSoldMs)}</div>
          </>
        ) : (
          <div className="text-text-low">no sales (90d)</div>
        )}
        <div className="text-text-low">
          {row.listedCount > 0 ? `${row.listedCount} listed now` : 'none listed'}
        </div>
      </div>
    </div>,
    document.body,
  );
}
