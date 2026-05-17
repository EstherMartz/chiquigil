import { Link } from 'react-router-dom';
import type { ShoppingPlan } from './planShopping';
import { fmtGil } from '../../lib/format';

interface Props {
  plan: ShoppingPlan;
  nameById: Map<number, string>;
}

export function ShoppingListPlan({ plan, nameById }: Props) {
  if (plan.perIngredient.length === 0 && plan.byWorldSummary.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Rollup rollup={plan.rollup} />
      <ByWorld summary={plan.byWorldSummary} nameById={nameById} />
      <DetailTable perIngredient={plan.perIngredient} nameById={nameById} />
    </div>
  );
}

function Rollup({ rollup }: { rollup: ShoppingPlan['rollup'] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total material cost" value={fmtGil(rollup.spend)} warning={
        rollup.missingIngredients > 0
          ? `⚠ ${rollup.missingIngredients} ingredient${rollup.missingIngredients === 1 ? '' : 's'} have no listings`
          : null
      } />
      <StatCard label="Est. revenue" value={fmtGil(rollup.revenue)} />
      <StatCard label="Net profit" value={fmtGil(rollup.profit)} valueClass={rollup.profit > 0 ? 'text-jade' : rollup.profit < 0 ? 'text-crimson' : 'text-text-cream'} />
    </div>
  );
}

function StatCard({ label, value, valueClass, warning }: { label: string; value: string; valueClass?: string; warning?: string | null }) {
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">{label}</div>
      <div className={`font-mono text-lg ${valueClass ?? 'text-text-cream'}`}>{value}</div>
      {warning && <div className="font-mono text-[10px] text-crimson mt-1">{warning}</div>}
    </div>
  );
}

function ByWorld({ summary, nameById }: { summary: ShoppingPlan['byWorldSummary']; nameById: Map<number, string> }) {
  if (summary.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">Shopping by world</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {summary.map((card) => (
          <div key={card.world} className="border border-border-base bg-bg-card p-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-text-cream font-mono">
                {card.world}
                {card.isLightDc && <span className="text-gold ml-1" title="Requires DC travel">✈</span>}
              </div>
              <div className="font-mono text-gold">{fmtGil(card.total)}</div>
            </div>
            <ul className="space-y-0.5">
              {card.ingredients.map((ing) => (
                <li key={ing.id} className="font-mono text-[11px] text-text-low flex justify-between gap-2">
                  <span className="truncate">{ing.qty}× {nameById.get(ing.id) ?? `Item #${ing.id}`}</span>
                  <span className="tabular-nums">{fmtGil(ing.price * ing.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTable({ perIngredient, nameById }: { perIngredient: ShoppingPlan['perIngredient']; nameById: Map<number, string> }) {
  if (perIngredient.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">All ingredients</div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Ingredient</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">Best world</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {perIngredient.map((row) => (
              <tr key={row.id} className="border-t border-border-base">
                <td className="px-3 py-2">
                  <Link to={`/item/${row.id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                    {nameById.get(row.id) ?? `Item #${row.id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono">{row.qty}</td>
                <td className="px-3 py-2">
                  {row.bestWorld ? (
                    <span>
                      {row.bestWorld}
                      {row.isLightDc && <span className="text-gold ml-1" title="Requires DC travel">✈</span>}
                    </span>
                  ) : (
                    <span className="text-text-low italic">No listings</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice * row.qty) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
