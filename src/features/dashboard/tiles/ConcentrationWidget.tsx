import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryShares } from '../aggregate';
import type { ItemCategory } from '../../items/types';
import type { WatchlistRow } from '../../watchlist/buildRows';

// Category colors for the stacked bar — warm/teal palette, stable and visually distinct
const CAT_COLOR: Record<ItemCategory, string> = {
  'Raid': '#d4a857',
  'Tincture': '#c06a59',
  'Food': '#7ab06f',
  'Fish': '#6ec5ce',
  'Dye': '#9a8f7a',
  'Glamour': '#a9b86a',
  'Housing': '#8fb86a',
  'Materia': '#5fa37a',
  'Minion': '#b5524e',
};

const OTHER_COLOR = '#6b6456';

// Discover-supported categories (mirror from DiscoverView)
const DISCOVER_CATS: ItemCategory[] = ['Tincture', 'Food', 'Dye', 'Glamour', 'Housing', 'Materia', 'Minion'];

export function ConcentrationWidget({ rows }: { rows: WatchlistRow[] }) {
  const [diverseOpen, setDiverseOpen] = useState(false);

  const shares = useMemo(() => categoryShares(rows), [rows]);

  // Income by category: only include categories with gil/day > 0
  const withGil = useMemo(() => shares.filter((s) => s.gilPerDay > 0), [shares]);

  // Long tail collapse: render top ~5 individually, bucket the rest as "other"
  const { segments } = useMemo(() => {
    const top = withGil.slice(0, 5);
    const rest = withGil.slice(5);

    if (rest.length === 0) {
      return { segments: top, restCount: 0 };
    }

    // Bucket the remainder as "other"
    const otherGil = rest.reduce((sum, s) => sum + s.gilPerDay, 0);
    const totalGil = shares.reduce((sum, s) => sum + s.gilPerDay, 0);
    const otherShare = totalGil > 0 ? otherGil / totalGil : 0;

    return {
      segments: [
        ...top,
        {
          cat: 'Other' as const,
          gilPerDay: otherGil,
          share: otherShare,
          itemCount: rest.reduce((sum, s) => sum + s.itemCount, 0),
        },
      ],
      restCount: rest.length,
    };
  }, [withGil, shares]);

  // Diversification opportunities: categories the user under-tracks
  const diverseOpportunities = useMemo(() => {
    // Count items per tracked category
    const trackedCount = new Map<ItemCategory, number>();
    for (const r of rows) {
      trackedCount.set(r.cat, (trackedCount.get(r.cat) ?? 0) + 1);
    }

    // Find Discover categories with < 2 tracked items
    const gaps = DISCOVER_CATS.filter((cat) => (trackedCount.get(cat) ?? 0) < 2)
      .sort((a, b) => {
        const aCount = trackedCount.get(a) ?? 0;
        const bCount = trackedCount.get(b) ?? 0;
        if (aCount !== bCount) return aCount - bCount;
        return a.localeCompare(b);
      });

    return gaps;
  }, [rows]);

  const totalGil = shares.reduce((sum, s) => sum + s.gilPerDay, 0);
  const hasNoGil = totalGil === 0;

  return (
    <div id="concentration-widget" className="border border-border-base bg-bg-card p-4">
      {/* Section 1: Income by category */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Income by category</div>
      </div>

      {hasNoGil ? (
        <div className="text-text-low text-sm italic py-4 text-center">
          No priced items yet.
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {/* Horizontal stacked bar */}
          <div className="flex h-6 bg-bg-deep rounded-none border border-border-base/50 overflow-hidden">
            {segments.map((seg) => {
              const isOther = seg.cat === 'Other';
              const color = isOther ? OTHER_COLOR : CAT_COLOR[seg.cat];
              const widthPct = (seg.share * 100).toFixed(1);

              return (
                <div
                  key={isOther ? 'other' : seg.cat}
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: color,
                  }}
                  className="h-full transition-all"
                  title={`${isOther ? 'Other' : seg.cat} ${(seg.share * 100).toFixed(0)}%`}
                />
              );
            })}
          </div>

          {/* Legend row */}
          <div className="flex flex-wrap gap-4 font-mono text-[9px] tracking-widest uppercase text-text-low">
            {segments.map((seg) => {
              const isOther = seg.cat === 'Other';
              const color = isOther ? OTHER_COLOR : CAT_COLOR[seg.cat];
              const pct = (seg.share * 100).toFixed(0);
              const label = isOther ? 'other' : seg.cat;

              return (
                <div key={isOther ? 'other' : seg.cat} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-[1px]"
                    style={{ backgroundColor: color }}
                  />
                  <span>
                    {label} {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 2: Diversification opportunities */}
      <div className="border-t border-border-base/40 pt-3 mt-4">
        <button
          type="button"
          onClick={() => setDiverseOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 text-left mb-2"
        >
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            ◇ Not tracking — potential diversification
          </span>
          <span className="font-mono text-[10px] text-text-low shrink-0">
            {diverseOpen ? '▲' : '▼'}
          </span>
        </button>

        {diverseOpen && (
          <div className="mt-2 space-y-0.5">
            {diverseOpportunities.length === 0 ? (
              <div className="font-mono text-[10px] text-text-low italic py-2">
                You're tracking across all categories.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {diverseOpportunities.map((cat) => {
                  const count = rows.filter((r) => r.cat === cat).length;
                  return (
                    <li key={cat} className="flex items-center justify-between gap-2 py-1 border-b border-border-base/40 last:border-b-0">
                      <span className="font-display text-[12px] text-text-cream">
                        {cat}
                        <span className="font-mono text-[10px] text-text-low ml-2">
                          ({count} tracked)
                        </span>
                      </span>
                      <Link
                        to={`/discover?category=${cat}`}
                        className="font-mono text-[10px] text-aether hover:text-gold transition-colors hover:underline underline-offset-2 shrink-0"
                      >
                        → Discover
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
