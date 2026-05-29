import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Recipe } from '../../lib/recipes';
import type { MarketItem } from '../../lib/universalis';
import { buildCraftTree, type CraftTreeNode } from './craftTree';
import { SectionHeader } from '../../components/SectionHeader';
import { Gil } from '../../components/Gil';

type Prices = Record<string, MarketItem> | undefined;

export function CraftTreeBlock({ itemId, recipeMap, dc, phantom, nameOf }: {
  itemId: number;
  recipeMap: Map<number, Recipe>;
  dc: Prices;
  phantom: Prices;
  nameOf: (id: number) => string;
}) {
  const [qty, setQty] = useState(1);
  const tree = useMemo(
    () => buildCraftTree(itemId, Math.max(1, qty), recipeMap, dc, phantom, nameOf),
    [itemId, qty, recipeMap, dc, phantom, nameOf],
  );

  const savings = tree.craftCost != null && tree.marketBuyCost > 0
    ? tree.marketBuyCost - tree.craftCost
    : null;
  const savePct = savings != null && tree.marketBuyCost > 0
    ? Math.round((savings / tree.marketBuyCost) * 100)
    : 0;

  return (
    <section>
      <SectionHeader label="Make vs buy" compact />
      <div className="border border-border-base bg-bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Quantity</span>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="w-20 bg-bg-base border border-border-base px-2 py-1 font-mono text-right"
          />
        </div>

        {/* Headline: buy outright vs optimal craft */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-text-dim">
            Buy outright:{' '}
            <span className="font-mono text-text-cream">
              {tree.marketBuyCost > 0 ? <Gil value={tree.marketBuyCost} /> : '—'}
            </span>
          </span>
          {tree.craftCost != null && (
            <span className="text-text-dim">
              Craft (optimal):{' '}
              <span className="font-mono text-gold"><Gil value={tree.craftCost} /></span>
            </span>
          )}
          {savings != null && (
            <span className={`font-mono text-[11px] tracking-wide ${savings > 0 ? 'text-jade' : 'text-crimson'}`}>
              {savings > 0 ? <>save <Gil value={savings} /> ({savePct}%)</> : <>+<Gil value={-savings} /> to craft</>}
            </span>
          )}
        </div>

        {/* Decision tree */}
        <div className="text-sm">
          {tree.children.length === 0 ? (
            <span className="text-text-low font-mono text-xs">No sub-ingredients.</span>
          ) : (
            tree.children.map((c) => <Node key={c.itemId} node={c} depth={0} />)
          )}
        </div>
      </div>
    </section>
  );
}

function Node({ node, depth }: { node: CraftTreeNode; depth: number }) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(depth < 1); // expand the first level by default
  const craftWins = node.bestChoice === 'craft';

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 border-t border-border-base/50"
        style={{ paddingLeft: depth * 18 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-4 font-mono text-[10px] text-text-low hover:text-aether"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 inline-block" />
        )}

        <Link
          to={`/item/${node.itemId}`}
          className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4"
        >
          {node.name}
        </Link>
        <span className="text-text-low font-mono text-xs">×{node.qty}</span>

        <span className="flex-1" />

        {/* buy / craft costs; chosen one highlighted */}
        <span className={`font-mono ${craftWins ? 'text-text-low line-through' : 'text-text-cream'}`}>
          {node.marketBuyCost > 0 ? <Gil value={node.marketBuyCost} /> : '—'}
        </span>
        {node.craftCost != null && (
          <>
            <span className="text-text-low">/</span>
            <span className={`font-mono ${craftWins ? 'text-jade' : 'text-text-low'}`}>
              <Gil value={node.craftCost} />
            </span>
          </>
        )}
        <span
          className={`font-mono text-[10px] tracking-widest uppercase border px-1.5 py-0.5 rounded-sm ${
            craftWins ? 'text-gold border-gold/40' : 'text-jade border-jade/40'
          }`}
        >
          {craftWins ? 'craft' : 'buy'}
        </span>
      </div>

      {open && hasChildren && node.children.map((c) => <Node key={c.itemId} node={c} depth={depth + 1} />)}
    </div>
  );
}
