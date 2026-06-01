import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { fmtGil } from '../../lib/format';
import { Gil } from '../../components/Gil';
import { useShoppingListStore } from '../shoppingList/shoppingListStore';
import { selfSourceBreakdown, type IngredientSourceKind, type BreakdownRow, type CurrencyResolver } from './CraftSellMathCard';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

const KIND_LABEL: Record<IngredientSourceKind, string> = {
  gather: 'Gather', currency: 'Currency', craft: 'Craft', buy: 'Buy',
};
const KIND_CLASS: Record<IngredientSourceKind, string> = {
  gather:   'text-aether border-aether/40',
  currency: 'text-jade border-jade/40',
  craft:    'text-gold border-gold/40',
  buy:      'text-text-dim border-border-base',
};
// gather + currency are "earned by playing" — 0 gil in the floor.
const FREE_KINDS = new Set<IngredientSourceKind>(['gather', 'currency']);

/** Renders a breakdown tree as flat <tr>s; craftable rows recurse, indented. */
function renderRows(rows: BreakdownRow[], nameOf: (id: number) => string, depth = 0): React.ReactNode {
  return rows.map((r) => {
    const free = FREE_KINDS.has(r.kind);
    return (
      <Fragment key={`${depth}-${r.itemId}`}>
        <tr className={depth === 0 ? 'border-t border-border-base/50' : ''}>
          <td className="py-1.5">
            <span style={{ paddingLeft: depth * 14 }} className="inline-flex items-center gap-1">
              {depth > 0 && <span className="text-text-low" aria-hidden>↳</span>}
              <Link to={`/item/${r.itemId}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                {nameOf(r.itemId)}
              </Link>
            </span>
          </td>
          <td className="py-1.5 text-center font-mono tabular-nums">{r.amount}</td>
          <td className="py-1.5 text-center whitespace-nowrap">
            <span className={`border ${KIND_CLASS[r.kind]} px-1.5 py-px leading-none text-[9px] tracking-widest uppercase rounded-sm`}>
              {KIND_LABEL[r.kind]}
            </span>
            {r.kind === 'craft' && r.yield != null && r.yield > 1 && (
              <span className="ml-1 font-mono text-[9px] text-text-low">÷{r.yield}</span>
            )}
            {r.kind === 'currency' && r.currencyCost != null && (
              <span className="ml-1 font-mono text-[9px] text-text-low">{r.currencyCost} {r.currencyLabel}</span>
            )}
          </td>
          <td className="py-1.5 text-right font-mono tabular-nums text-text-low">
            {free ? 'free' : fmtGil(r.unitCost)}
          </td>
          <td className="py-1.5 text-right font-mono tabular-nums">
            {free ? '—' : <Gil value={r.lineCost} />}
          </td>
        </tr>
        {r.children && r.children.length > 0 && renderRows(r.children, nameOf, depth + 1)}
      </Fragment>
    );
  });
}

/**
 * Per-ingredient self-source breakdown for one craft, plus a "Plan this craft"
 * button that pushes the item to the Shopping List with craftIntermediates on,
 * so the planner explodes sub-recipes the same way this breakdown does.
 */
export function IngredientBreakdownModal({
  itemId, itemName, recipe, recipeMap, market, gatherableIds, currencyOf, nameOf, onClose,
}: {
  itemId: number;
  itemName: string;
  recipe: Recipe;
  recipeMap: Map<number, Recipe | null>;
  market: MarketData;
  gatherableIds: Set<number>;
  /** Cheapest currency offer per item — currency-obtainable mats count as 0 gil. */
  currencyOf?: CurrencyResolver;
  nameOf: (id: number) => string;
  onClose: () => void;
}) {
  const addItem = useShoppingListStore((s) => s.addItem);
  const onList = useShoppingListStore((s) => s.items.some((i) => i.id === itemId));

  const rows = selfSourceBreakdown(recipe, recipeMap, market, gatherableIds, currencyOf);
  const total = rows.reduce((s, r) => s + r.lineCost, 0);

  function planCraft() {
    // The Craft Helper always explodes sub-recipes fully, so adding the item is
    // enough — it lands in the Craft bucket with its whole tree expanded.
    addItem(itemId, 1);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-bg-deep/80 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-hi max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Self-source breakdown</div>
            <h2 className="font-display text-xl text-text-cream">{itemName}</h2>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-text-low hover:text-crimson text-lg leading-none -mt-1"
            aria-label="Close"
          >✕</button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[9px] tracking-widest uppercase">
              <th className="text-left py-1">Ingredient</th>
              <th className="text-center py-1">Qty</th>
              <th className="text-center py-1">Source</th>
              <th className="text-right py-1">Unit</th>
              <th className="text-right py-1">Line</th>
            </tr>
          </thead>
          <tbody>
            {renderRows(rows, nameOf)}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-base">
              <td colSpan={4} className="py-2 text-right font-mono text-[10px] tracking-widest uppercase text-text-low">
                Self-source floor
              </td>
              <td className="py-2 text-right font-mono"><Gil value={total} /></td>
            </tr>
          </tfoot>
        </table>

        <p className="font-mono text-[10px] text-text-low mt-3">
          <span className="text-aether">Gather</span> &amp; <span className="text-jade">Currency</span> (scrip/tome/seal)
          mats cost time, not gil. <span className="text-gold">Craft</span> mats recurse into their own cost.
          <span className="text-text-dim"> Buy</span> mats use the home-world price.
        </p>

        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border-base">
          <button
            onClick={onClose}
            className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:text-aether transition-colors"
          >
            Close
          </button>
          <button
            onClick={planCraft}
            className="font-mono text-[10px] tracking-widest uppercase border border-jade/60 text-jade px-3 py-2 hover:bg-jade/10 transition-colors"
          >
            {onList ? '✓ On shopping list · add another' : '+ Plan this craft'}
          </button>
        </div>
      </div>
    </div>
  );
}
