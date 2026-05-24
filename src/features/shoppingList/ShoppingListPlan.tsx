import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ShoppingPlan } from './planShopping';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import { applyShoppingOverrides, NPC_VENDOR_WORLD, type ChosenSource } from './applyShoppingOverrides';
import { fmtGil } from '../../lib/format';
import { CopyButton } from '../../components/CopyButton';

interface Props {
  survey: IngredientSurvey[];
  shoppingItems: ShoppingListItem[];
  snapshot: SnapshotItem[];
  prices: MarketData;
  nameById: Map<number, string>;
}

export function ShoppingListPlan({ survey, shoppingItems, snapshot, prices, nameById }: Props) {
  const [overrides, setOverrides] = useState<Map<number, ChosenSource>>(new Map());

  const plan = useMemo(
    () => applyShoppingOverrides(survey, shoppingItems, snapshot, prices, overrides),
    [survey, shoppingItems, snapshot, prices, overrides],
  );

  const surveyById = useMemo(() => {
    const m = new Map<number, IngredientSurvey>();
    for (const s of survey) m.set(s.id, s);
    return m;
  }, [survey]);

  if (plan.perIngredient.length === 0 && plan.byWorldSummary.length === 0) {
    return null;
  }

  function setSource(id: number, source: ChosenSource) {
    setOverrides((prev) => { const next = new Map(prev); next.set(id, source); return next; });
  }

  return (
    <div className="space-y-4">
      <Rollup rollup={plan.rollup} />
      <ByWorld summary={plan.byWorldSummary} nameById={nameById} />
      <DetailTable perIngredient={plan.perIngredient} surveyById={surveyById} overrides={overrides} setSource={setSource} nameById={nameById} />
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
        {summary.map((card) => {
          const isNpc = card.world === NPC_VENDOR_WORLD;
          return (
            <div key={card.world} className={`border bg-bg-card p-3 ${isNpc ? 'border-aether' : 'border-border-base'}`}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-text-cream font-mono">
                  {card.world}
                  {!isNpc && card.isLightDc && <span className="text-gold ml-1" title="Requires DC travel">✈</span>}
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
          );
        })}
      </div>
    </div>
  );
}

function DetailTable({
  perIngredient, surveyById, overrides, setSource, nameById,
}: {
  perIngredient: ShoppingPlan['perIngredient'];
  surveyById: Map<number, IngredientSurvey>;
  overrides: Map<number, ChosenSource>;
  setSource: (id: number, src: ChosenSource) => void;
  nameById: Map<number, string>;
}) {
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
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {perIngredient.map((row) => {
              const survey = surveyById.get(row.id);
              return (
                <tr key={row.id} className="border-t border-border-base align-top hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                  <td className="px-3 py-2">
                    <Link to={`/item/${row.id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {nameById.get(row.id) ?? `Item #${row.id}`}
                    </Link>
                    <CopyButton text={nameById.get(row.id) ?? `Item #${row.id}`} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{row.qty}</td>
                  <td className="px-3 py-2">
                    <SourceCell row={row} survey={survey} overrides={overrides} setSource={setSource} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice * row.qty) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceCell({
  row, survey, overrides, setSource,
}: {
  row: ShoppingPlan['perIngredient'][number];
  survey: IngredientSurvey | undefined;
  overrides: Map<number, ChosenSource>;
  setSource: (id: number, src: ChosenSource) => void;
}) {
  if (!survey) {
    return row.bestWorld ? <span>{row.bestWorld}</span> : <span className="text-text-low italic">No listings</span>;
  }
  const hasBoth = !!survey.mb && !!survey.npc;
  const overridden = overrides.get(row.id);
  const effective: ChosenSource | null =
    overridden === 'mb' && survey.mb ? 'mb' :
    overridden === 'npc' && survey.npc ? 'npc' :
    survey.autoSource;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {row.bestWorld ? (
          <span>
            {row.bestWorld}
            {row.bestWorld !== NPC_VENDOR_WORLD && row.isLightDc && (
              <span className="text-gold ml-1" title="Requires DC travel">✈</span>
            )}
          </span>
        ) : (
          <span className="text-text-low italic">No listings</span>
        )}
        {hasBoth && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSource(row.id, 'mb')}
              className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 border ${
                effective === 'mb' ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              MB
            </button>
            <button
              type="button"
              onClick={() => setSource(row.id, 'npc')}
              className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 border ${
                effective === 'npc' ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              NPC
            </button>
          </div>
        )}
      </div>
      {survey.currency && (
        <div className="font-mono text-[10px] text-text-low">
          └─ {survey.currency.costPerUnit < 10 ? survey.currency.costPerUnit.toFixed(2) : Math.round(survey.currency.costPerUnit)}{' '}
          <Link
            to={`/currency-flip?currency=${survey.currency.id}`}
            className="text-aether hover:underline decoration-1 underline-offset-4"
          >
            {survey.currency.shortLabel}
          </Link>
          {' '}avail.
        </div>
      )}
    </div>
  );
}
