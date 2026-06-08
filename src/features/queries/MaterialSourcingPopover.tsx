import type { ReactNode } from 'react';
import { fmtGil } from '../../lib/format';
import { useSnapshotById } from './useSnapshotById';
import type { MaterialSourcing, SourceKind } from '../profit/materialSourcing';

const SOURCE_LABEL: Record<SourceKind, string> = {
  'gather-standard': 'GATHER (std)',
  'gather-timed': 'GATHER (timed)',
  'crystal': 'CRYSTAL',
  'buy': 'MB',
};

/**
 * CSS-only hover popover (named Tailwind group) listing each ingredient with
 * its source type. Gatherable ingredients show `0*` (assumed self-sourced);
 * buy ingredients show their gil subtotal.
 */
export function MaterialSourcingPopover({ sourcing, children }: { sourcing: MaterialSourcing; children: ReactNode }) {
  const byId = useSnapshotById();
  const selfCount = sourcing.ingredients.filter((i) => i.gatherable).length;

  return (
    <span className="group/ms relative inline-flex items-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover/ms:block z-30 border border-border-hi bg-bg-card-hi text-text-cream font-mono text-[10px] tracking-normal normal-case px-3 py-2 leading-relaxed whitespace-nowrap shadow-lg text-left"
      >
        <table className="border-separate border-spacing-x-3">
          <tbody>
            {sourcing.ingredients.map((ing) => (
              <tr key={ing.itemId}>
                <td className="text-text-cream">{byId.get(ing.itemId)?.name ?? `#${ing.itemId}`}</td>
                <td className="text-text-low text-right">×{ing.qty}</td>
                <td className={ing.gatherable ? 'text-jade' : 'text-text-dim'}>{SOURCE_LABEL[ing.source]}</td>
                <td className="text-right tabular-nums">{ing.gatherable ? '0*' : fmtGil(ing.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1.5 pt-1.5 border-t border-border-base flex justify-between gap-6">
          <span>Total buy: <span className="text-text-cream">{fmtGil(sourcing.buyOnlyCost)}</span></span>
          <span>Total self: <span className="text-jade">0</span> ({selfCount} items)</span>
        </div>
        {selfCount > 0 && <div className="mt-1 text-text-low">* assumed self-sourced at 0 cost</div>}
      </span>
    </span>
  );
}
