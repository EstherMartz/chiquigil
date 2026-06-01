import { Link } from 'react-router-dom';
import type { CraftPlan } from './buildCraftPlan';

interface Props {
  craft: CraftPlan['craft'];
  targetIds: Set<number>;
  nameById: Map<number, string>;
  onBuyInstead: (id: number) => void;
}

export function CraftSection({ craft, targetIds, nameById, onBuyInstead }: Props) {
  if (craft.size === 0) return null;
  const rows = [...craft.entries()];
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">
        Craft ({rows.length})
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Job</th>
              <th className="text-right px-3 py-2">Crafts</th>
              <th className="text-right px-3 py-2">Output</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, c]) => (
              <tr key={id} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className="px-3 py-2">
                  <Link to={`/item/${id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                    {nameById.get(id) ?? `Item #${id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-text-low">{c.job}</td>
                <td className="px-3 py-2 text-right font-mono">{c.craftCount}</td>
                <td className="px-3 py-2 text-right font-mono">{c.qty}</td>
                <td className="px-3 py-2 text-right">
                  {!targetIds.has(id) && (
                    <button
                      type="button"
                      onClick={() => onBuyInstead(id)}
                      className="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border border-border-base text-text-dim hover:text-aether hover:border-aether transition-colors"
                    >
                      Buy instead
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
