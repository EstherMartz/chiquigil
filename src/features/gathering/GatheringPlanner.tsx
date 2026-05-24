import { useMemo, useState } from 'react';
import { fmtGil } from '../../lib/format';
import { encodeGbrList } from '../../lib/gatherBuddyExport';
import { computePlan } from './computePlan';
import { useGatheringPlanStore } from './gatheringPlanStore';
import type { QueryResultRow } from '../queries/types';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import { ItemNameLinks } from '../../components/ItemNameLinks';

interface Props {
  rows: QueryResultRow[];
  catalog?: GatheringCatalog;
}

export function GatheringPlanner({ rows, catalog }: Props) {
  const s = useGatheringPlanStore();
  const [copyError, setCopyError] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!catalog) return rows;
    return rows.filter((r) => {
      const info = catalog.get(r.id);
      if (!info) return true; // unknown items: don't filter out
      if (info.level > s.maxLevel) return false;
      if (info.timed && !s.includeTimed) return false;
      return true;
    });
  }, [rows, catalog, s.maxLevel, s.includeTimed]);

  const result = useMemo(
    () =>
      computePlan(filteredRows, {
        mode: s.budgetMode,
        itemCount: s.itemCount,
        budgetTimeMin: s.budgetTimeMin,
        budgetGil: s.budgetGil,
        itemsPerMin: s.itemsPerMin,
      }),
    [filteredRows, s.budgetMode, s.itemCount, s.budgetTimeMin, s.budgetGil, s.itemsPerMin],
  );

  const canExport = result.rows.length > 0;

  async function copyToClipboard() {
    setCopyError(null);
    setFallbackText(null);
    const blob = await encodeGbrList({
      name: s.listName || 'AFK gather',
      items: result.rows.map((r) => ({ id: r.id, qty: r.qty })),
    });
    try {
      await navigator.clipboard.writeText(blob);
    } catch (err) {
      setCopyError((err as Error).message || 'Clipboard write failed');
      setFallbackText(blob);
    }
  }

  return (
    <section className="border border-border-base bg-bg-card p-4 space-y-3">
      <h3 className="font-display text-base text-gold tracking-wide">Plan a session</h3>

      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-1.5" aria-label="Time budget">
          <input
            type="radio"
            checked={s.budgetMode === 'time'}
            onChange={() => s.setBudgetMode('time')}
          />
          Time
          <input
            type="number"
            min={1}
            value={s.budgetTimeMin}
            onChange={(e) => s.setBudgetTimeMin(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
          min
        </label>

        <label className="flex items-center gap-1.5" aria-label="Gil budget">
          <input
            type="radio"
            checked={s.budgetMode === 'gil'}
            onChange={() => s.setBudgetMode('gil')}
          />
          Gil
          <input
            type="number"
            min={0}
            step={10_000}
            value={s.budgetGil}
            onChange={(e) => s.setBudgetGil(Number(e.target.value))}
            className="w-24 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
        </label>

        <label className="flex items-center gap-1.5" aria-label="Item count">
          Items
          <input
            type="range"
            min={1}
            max={10}
            value={s.itemCount}
            onChange={(e) => s.setItemCount(Number(e.target.value))}
          />
          <span className="text-text-low w-4">{s.itemCount}</span>
        </label>

        <label className="flex items-center gap-1.5" aria-label="Items per minute">
          Rate
          <input
            type="number"
            min={1}
            value={s.itemsPerMin}
            onChange={(e) => s.setItemsPerMin(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
          / min
        </label>

        <label className="flex items-center gap-1.5" aria-label="Max level">
          Lvl ≤
          <input
            type="number"
            min={1}
            max={999}
            value={s.maxLevel}
            onChange={(e) => s.setMaxLevel(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
        </label>

        <label className="flex items-center gap-1.5" aria-label="Include timed nodes">
          <input
            type="checkbox"
            checked={s.includeTimed}
            onChange={(e) => s.setIncludeTimed(e.target.checked)}
          />
          Timed
        </label>
      </div>

      {result.cappedAt < s.itemCount && filteredRows.length > 0 && (
        <div className="font-mono text-[10px] text-text-low">
          Only {result.cappedAt} matching item(s) — slider capped.
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
            <th className="text-left px-2 py-1">#</th>
            <th className="text-left px-2 py-1">Item</th>
            <th className="text-right px-2 py-1">Price</th>
            <th className="text-right px-2 py-1">Qty</th>
            <th className="text-right px-2 py-1">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
              <td className="px-2 py-1.5 font-mono text-text-low">{i + 1}</td>
              <td className="px-2 py-1.5">
                <ItemNameLinks id={r.id} name={r.name} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono">{fmtGil(r.unitPrice)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{r.qty.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right font-mono text-gold-hi">{fmtGil(r.subtotal)}</td>
            </tr>
          ))}
          {result.skippedZeroPriceRows.map((r) => (
            <tr key={`skip-${r.id}`} className="border-t border-border-base text-text-low hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
              <td className="px-2 py-1.5 font-mono">—</td>
              <td className="px-2 py-1.5 italic">
                <ItemNameLinks id={r.id} name={r.name} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono">—</td>
              <td className="px-2 py-1.5 text-right font-mono">—</td>
              <td className="px-2 py-1.5 text-right font-mono">—</td>
            </tr>
          ))}
          {result.rows.length === 0 && result.skippedZeroPriceRows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-3 text-center text-text-low font-mono text-[11px] italic">
                Click Run query to populate this plan.
              </td>
            </tr>
          )}
        </tbody>
        {result.rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-border-base font-mono text-[11px]">
              <td colSpan={3} className="px-2 py-1.5 text-text-low">
                Total ≈ {fmtGil(result.totalGil)} gil · est {result.totalMinutes} min @ {s.itemsPerMin}/min
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 font-mono text-[11px]">
          List name
          <input
            type="text"
            value={s.listName}
            onChange={(e) => s.setListName(e.target.value)}
            className="bg-bg-card-hi border border-border-base px-1.5 py-0.5 w-40"
          />
        </label>
        <button
          onClick={copyToClipboard}
          disabled={!canExport}
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold disabled:border-border-base disabled:text-text-low"
        >
          Copy GBR clipboard string
        </button>
      </div>

      {copyError && (
        <div className="font-mono text-[10px] text-crimson">
          Clipboard write failed ({copyError}). Copy manually below:
        </div>
      )}
      {fallbackText && (
        <textarea
          readOnly
          value={fallbackText}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full font-mono text-[10px] bg-bg-card-hi border border-border-base p-2"
          rows={3}
        />
      )}
    </section>
  );
}
