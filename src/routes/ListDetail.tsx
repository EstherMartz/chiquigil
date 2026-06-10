import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCraftList } from '../features/craftLists/useCraftLists';
import { useResolvedList } from '../features/craftLists/useResolvedList';
import { useAuth } from '../features/auth/AuthProvider';
import { resolvedToPlainText, encodeListCode } from '../features/craftLists/listCode';
import { ItemNameLinks } from '../components/ItemNameLinks';
import { HqStar } from '../components/HqStar';
import { SourceTag } from '../features/craftLists/SourceTag';
import { crafterBeadClass } from '../features/items/crafterColors';
import { btnSecondary, btnGhost } from '../components/buttonStyles';
import type { ListInput, ResolvedIngredient, ResolvedList, ListSource } from '../features/craftLists/resolveList';

type View = 'sections' | 'table';
type SourceFilter = 'All' | 'Crafted' | 'Gathered' | 'Vendor' | 'Monster' | 'Crystal';

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function IngredientRow({ ing }: { ing: ResolvedIngredient }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border-base text-sm">
      <span className="grow"><ItemNameLinks id={ing.itemId} name={ing.itemName} suffix={ing.canHq ? <HqStar leading /> : undefined} /></span>
      <SourceTag source={ing.source} />
      {ing.recipeLevel != null && (
        <span className="font-mono text-[10px] text-text-low flex items-center gap-1">
          {ing.craftedByJob && <span className={crafterBeadClass(ing.craftedByJob)}>●</span>}Lv{ing.recipeLevel}
        </span>
      )}
      <span className="font-mono text-gold-hi tabular-nums w-12 text-right">×{ing.requiredQty}</span>
      {ing.usedToCraft.length > 0 && (
        <span className="font-mono text-[10px] text-text-low w-48 truncate" title={ing.usedToCraft.join(', ')}>
          feeds: {ing.usedToCraft.join(', ')}
        </span>
      )}
    </div>
  );
}

function Section({ title, count, defaultOpen = true, children }: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border-base bg-bg-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-gold">{open ? '▾' : '▸'} {title}</span>
        <span className="font-mono text-[10px] text-text-low">{count}</span>
      </button>
      {open && children}
    </div>
  );
}

function SectionsView({ resolved }: { resolved: ResolvedList }) {
  const depths = [...resolved.subCraftsByDepth.keys()].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <Section title="Final Items" count={resolved.finalItems.length}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          {resolved.finalItems.map((f) => (
            <div key={f.itemId} className="flex items-center gap-3 px-3 py-1.5 border-t border-border-base text-sm">
              {f.job && <span className={`${crafterBeadClass(f.job)} text-[10px]`}>●</span>}
              <span className="grow"><ItemNameLinks id={f.itemId} name={f.itemName} suffix={f.isHq ? <HqStar leading /> : undefined} /></span>
              {f.stars ? <span className="text-gold text-[10px]">{'★'.repeat(f.stars)}</span> : null}
              <span className="font-mono text-gold-hi tabular-nums">×{f.qty}</span>
            </div>
          ))}
        </div>
      </Section>

      {depths.map((d) => (
        <Section key={d} title={`Sub-crafts — Level ${d}`} count={resolved.subCraftsByDepth.get(d)!.length}>
          {resolved.subCraftsByDepth.get(d)!.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      ))}

      {resolved.gathered.length > 0 && (
        <Section title="Gathered" count={resolved.gathered.length}>
          {resolved.gathered.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      )}
      {resolved.otherAcquired.length > 0 && (
        <Section title="Vendor / Monster Drop / Other" count={resolved.otherAcquired.length}>
          {resolved.otherAcquired.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      )}
      {resolved.crystals.length > 0 && (
        <Section title="Crystals" count={resolved.crystals.length} defaultOpen={false}>
          {resolved.crystals.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      )}
    </div>
  );
}

const FILTER_MATCH: Record<Exclude<SourceFilter, 'All'>, (s: ListSource) => boolean> = {
  Crafted: (s) => s === 'Crafted',
  Gathered: (s) => s === 'Gathered' || s === 'TimedGather',
  Vendor: (s) => s === 'Vendor' || s === 'Tome',
  Monster: (s) => s === 'MonsterDrop',
  Crystal: (s) => s === 'Crystal',
};

function TableView({ resolved }: { resolved: ResolvedList }) {
  const [filter, setFilter] = useState<SourceFilter>('All');
  const rows = filter === 'All' ? resolved.all : resolved.all.filter((r) => FILTER_MATCH[filter](r.source));
  const filters: SourceFilter[] = ['All', 'Crafted', 'Gathered', 'Vendor', 'Monster', 'Crystal'];
  return (
    <div className="space-y-2">
      <div className="flex border border-border-base overflow-x-auto w-fit">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[11px] px-3 py-1.5 border-r border-border-base last:border-r-0 ${
              filter === f ? 'bg-bg-card-hi text-aether' : 'text-text-dim hover:text-aether'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low text-left">
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Recipe</th>
            <th className="px-3 py-2 text-right">Required</th>
            <th className="px-3 py-2">Used to Craft</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className="border-t border-border-base hover:bg-bg-card-hi">
              <td className="px-3 py-1.5"><ItemNameLinks id={r.itemId} name={r.itemName} /></td>
              <td className="px-3 py-1.5"><SourceTag source={r.source} /></td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-text-low">
                {r.recipeLevel != null ? (<span className="flex items-center gap-1">{r.craftedByJob && <span className={crafterBeadClass(r.craftedByJob)}>●</span>}Lv{r.recipeLevel}</span>) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-gold-hi tabular-nums">×{r.requiredQty}</td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-text-low">{r.usedToCraft.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const list = useCraftList(id);
  const inputs: ListInput[] = useMemo(
    () => (list.data?.items ?? []).map((it) => ({ itemId: it.itemId, qty: it.qty, isHq: it.isHq })),
    [list.data],
  );
  const { ready, resolved } = useResolvedList(inputs);
  const [view, setView] = useState<View>('sections');

  // Put the list name in the tab title so multiple open craft-list tabs are
  // distinguishable. The central <DocumentTitle> sets "Craft List — qiqirn.tools"
  // on navigation and only re-runs when the pathname changes, so once the name
  // loads we override it here and it sticks.
  const listName = list.data?.name;
  useEffect(() => {
    if (listName) document.title = `${listName} — qiqirn.tools`;
  }, [listName]);

  if (list.isLoading) return <div className="p-8 text-center text-text-low font-mono text-xs">Loading…</div>;
  if (list.isError || !list.data) {
    return (
      <div className="p-8 text-center text-text-low font-mono text-xs">
        List not found. <Link to="/craft-lists/saved" className="text-aether hover:underline">Your lists →</Link>
      </div>
    );
  }

  const isOwner = auth.user?.sub === list.data.ownerId;
  const ingredientCount = resolved
    ? resolved.all.filter((r) => r.source !== 'Crystal').length
    : 0;

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl text-gold italic">{list.data.name}</h2>
          <p className="font-mono text-[10px] text-text-low">
            {list.data.items.length} recipes · {ingredientCount} ingredients · {resolved?.crystals.length ?? 0} crystal types
          </p>
        </div>
        <div className="flex gap-2">
          {isOwner && <Link to="/craft-lists" className={btnGhost}>+ Add items</Link>}
          <button
            disabled={!resolved}
            onClick={() => resolved && copy(resolvedToPlainText(list.data!.name, resolved))}
            className={btnSecondary}
          >
            Export plain text
          </button>
          <button
            onClick={() => copy(encodeListCode(list.data!.name, list.data!.items))}
            className={btnSecondary}
          >
            Send to plugin
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(['sections', 'table'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setView(m)}
            className={`px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase border transition-colors ${
              view === m ? 'bg-aether/20 border-aether text-aether' : 'border-border-base/40 text-text-low hover:border-aether/50 hover:text-text-cream'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {!ready || !resolved ? (
        <div className="p-8 text-center text-text-low font-mono text-xs">Resolving ingredients…</div>
      ) : view === 'sections' ? (
        <SectionsView resolved={resolved} />
      ) : (
        <TableView resolved={resolved} />
      )}
    </div>
  );
}
