import { CopyButton } from '../../components/CopyButton';
import type { CraftPlan } from './buildCraftPlan';
import { exportCraftPlanText } from './exportCraftPlanText';

interface Props {
  plan: CraftPlan;
  nameById: Map<number, string>;
}

/** Collapsible "Export as text" panel: the whole plan as a Nx-Name list to copy. */
export function CraftPlanExport({ plan, nameById }: Props) {
  const text = exportCraftPlanText(plan, nameById);
  if (!text) return null;
  const lineCount = text.split('\n').length;

  return (
    <details className="border border-border-base bg-bg-card">
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-[10px] tracking-widest uppercase text-text-low flex items-center justify-between gap-2 hover:text-text-cream">
        <span>Export as text ({lineCount} line{lineCount === 1 ? '' : 's'})</span>
        <CopyButton text={text} label="Copy list" />
      </summary>
      <div className="px-3 pb-3">
        <textarea
          readOnly
          aria-label="Craft plan as text"
          value={text}
          rows={Math.min(lineCount, 16)}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1.5 resize-y focus:outline-none focus:border-aether"
        />
      </div>
    </details>
  );
}
