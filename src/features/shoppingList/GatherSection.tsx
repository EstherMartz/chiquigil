import { Link } from 'react-router-dom';
import type { CraftPlan } from './buildCraftPlan';

interface Props {
  gather: CraftPlan['gather'];
  nameById: Map<number, string>;
  onBuyInstead: (id: number) => void;
}

export function GatherSection({ gather, nameById, onBuyInstead }: Props) {
  if (gather.size === 0) return null;
  const rows = [...gather.entries()];
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2 flex items-center gap-2">
        <span>Gather ({rows.length})</span>
        <Link to="/gathering/plan" className="text-aether hover:underline decoration-1 underline-offset-4 normal-case tracking-normal">
          open gathering plan →
        </Link>
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Lvl</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, g]) => (
              <tr key={id} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className="px-3 py-2">
                  <Link to={`/item/${id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                    {nameById.get(id) ?? `Item #${id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.level}</td>
                <td className="px-3 py-2 text-right font-mono">{g.qty}</td>
                <td className="px-3 py-2 font-mono text-text-low">{g.timed ? 'timed' : 'standard'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onBuyInstead(id)}
                    className="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border border-border-base text-text-dim hover:text-aether hover:border-aether transition-colors"
                  >
                    Buy instead
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
