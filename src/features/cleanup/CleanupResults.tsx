import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';
import type { CleanupResult, CleanupRow, CraftOpportunity, InventoryEntry, UsesEntry } from './types';

interface CleanupResultsProps {
  result: CleanupResult;
  /** Per-itemId list of recipes that consume this inventory item (ignores profitability). */
  usesByItemId?: Map<number, UsesEntry[]>;
}

function fmtGil(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function fmtFull(n: number): string {
  return n.toLocaleString();
}

export function CleanupResults({ result, usesByItemId }: CleanupResultsProps) {
  const anything =
    result.craft.length || result.sellMb.length || result.vendor.length ||
    result.discard.length || result.unrecognized.length;
  if (!anything) return null;

  const usesFor = (itemId: number) => usesByItemId?.get(itemId);
  const ingredientItemCount = usesByItemId?.size ?? 0;

  return (
    <div className="space-y-4">
      <Section title={result.craft.length > 0 ? `Craft these (${result.craft.length})` : 'Craft these (0)'}>
        {result.craft.length > 0
          ? result.craft.map((row) => <CraftRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} />)
          : <CraftEmptyState ingredientItemCount={ingredientItemCount} />}
      </Section>

      {result.sellMb.length > 0 && (
        <Section title={`Sell on Marketboard (${result.sellMb.length})`}>
          {result.sellMb.map((row) => <SellRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} />)}
        </Section>
      )}
      {(result.vendor.length + result.discard.length) > 0 && (
        <Section title={`Vendor or discard (${result.vendor.length + result.discard.length})`}>
          {result.vendor.map((row) => <VendorRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} uses={usesFor(row.entry.itemId)} />)}
          {result.discard.map((row) => <DiscardRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} uses={usesFor(row.entry.itemId)} />)}
        </Section>
      )}
      {result.unrecognized.length > 0 && (
        <Section title={`Unrecognized rows (${result.unrecognized.length})`} defaultOpen={false}>
          {result.unrecognized.map((entry, i) => <UnrecognizedRow key={i} entry={entry} />)}
        </Section>
      )}
    </div>
  );
}

function CraftEmptyState({ ingredientItemCount }: { ingredientItemCount: number }) {
  return (
    <div className="py-3 font-mono text-[11px] text-text-low space-y-1">
      <div>No recipes met both gates: ≤2 missing ingredients · all ingredients priced on MB.</div>
      {ingredientItemCount > 0 ? (
        <div>
          {ingredientItemCount} of your items appear as ingredients in some recipe — open the{' '}
          <span className="text-aether">▸ used in N recipes</span> toggle on a Vendor or Discard row to
          explore what they could become, even if not profitable right now.
        </div>
      ) : (
        <div>None of your recognized items appear as ingredients in any recipe. Most likely they're end products (gear, tools, tomestones).</div>
      )}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left group flex items-center gap-2 hover:opacity-90"
      >
        <span className="font-mono text-[10px] text-text-low group-hover:text-aether w-3">{open ? '▾' : '▸'}</span>
        <span className="flex-1"><SectionHeader label={title} /></span>
      </button>
      {open && <div className="space-y-0">{children}</div>}
    </section>
  );
}

function ItemName({ entry }: { entry: InventoryEntry }) {
  return (
    <Link to={`/item/${entry.itemId}`} className="text-text-cream hover:text-gold">
      {entry.name}{entry.isHq ? ' ✦' : ''} <span className="text-text-low">×{entry.qty}</span>
    </Link>
  );
}

function CraftRow({ row }: { row: CleanupRow }) {
  const [open, setOpen] = useState(false);
  if (!row.bestCraft) return null;
  const altLabel = craftAltLabel(row);
  return (
    <div className="border-b border-border-base py-1.5">
      <div className="flex items-center justify-between text-xs gap-3">
        <ItemName entry={row.entry} />
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-text-cream hover:text-gold font-mono text-left"
          aria-label={row.bestCraft.outputName}
        >
          → Craft: {row.bestCraft.outputName}{' '}
          <span className={row.bestCraft.netProfit >= 0 ? 'text-jade' : 'text-crimson'}>
            {row.bestCraft.netProfit >= 0 ? '+' : '−'}{fmtGil(Math.abs(row.bestCraft.netProfit))}
          </span>
          {row.otherCrafts.length > 0 && (
            <span className="text-text-low"> · +{row.otherCrafts.length} more</span>
          )}
          {altLabel && <span className="text-text-low"> · {altLabel}</span>}
        </button>
      </div>
      {open && <CraftDetail crafts={[row.bestCraft, ...row.otherCrafts]} />}
    </div>
  );
}

function craftAltLabel(row: CleanupRow): string | null {
  if (!row.runnerUp) return null;
  const perUnit = Math.round(row.runnerUp.value / Math.max(1, row.entry.qty));
  if (row.runnerUp.action === 'sellMb') return `or MB: ${fmtGil(perUnit)}g/ea`;
  if (row.runnerUp.action === 'vendor') return `or vendor: ${fmtGil(perUnit)}g/ea`;
  return null;
}

function CraftDetail({ crafts }: { crafts: CraftOpportunity[] }) {
  return (
    <div className="mt-2 pl-4 font-mono text-[11px] text-text-low space-y-3">
      {crafts.map((c) => (
        <div key={c.outputItemId}>
          <div className="text-text-cream">
            {c.outputName} · output {fmtFull(c.outputUnitPrice)}g · net +{fmtFull(c.netProfit)}g
          </div>
          {c.usedFromInventory.length > 0 && (
            <div>Uses from inventory: {c.usedFromInventory.map((u) => `${u.amount}× ${u.name}`).join(', ')}</div>
          )}
          {c.missingIngredients.length > 0 && (
            <div className="text-crimson">
              Buy on MB: {c.missingIngredients.map((m) => `${m.amount}× ${m.name} @ ${fmtFull(m.mbUnitPrice)}g`).join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SellRow({ row }: { row: CleanupRow }) {
  const scopeLabel = row.mbScope === 'dc' ? 'DC' : row.mbScope === 'region' ? 'cross-DC' : null;
  return (
    <div className="border-b border-border-base py-1.5 flex items-center justify-between text-xs">
      <ItemName entry={row.entry} />
      <div className="font-mono text-text-low">
        {fmtFull(row.mbRevenue / row.entry.qty)}g/ea ·{' '}
        {row.mbListingCount < 2 ? <span className="text-crimson">thin market</span> : <span className="text-jade">{row.mbListingCount} listings</span>}{' '}
        {scopeLabel && <span className="text-aether">· {scopeLabel}</span>}{' '}
        · <span className="text-text-cream">{fmtFull(row.mbRevenue)}g</span>
      </div>
    </div>
  );
}

function VendorRow({ row, uses }: { row: CleanupRow; uses?: UsesEntry[] }) {
  const [open, setOpen] = useState(false);
  const hasUses = uses && uses.length > 0;
  return (
    <div className="border-b border-border-base py-1.5">
      <div className="flex items-center justify-between text-xs">
        <ItemName entry={row.entry} />
        <div className="font-mono text-text-low flex items-center gap-3">
          <span>vendor: {fmtFull(row.vendorRevenue / row.entry.qty)}g/ea · total {fmtFull(row.vendorRevenue)}g</span>
          {hasUses && <UsesToggle open={open} setOpen={setOpen} count={uses!.length} />}
        </div>
      </div>
      {open && hasUses && <UsesDisclosure entries={uses!} />}
    </div>
  );
}

function DiscardRow({ row, uses }: { row: CleanupRow; uses?: UsesEntry[] }) {
  const [open, setOpen] = useState(false);
  const hasUses = uses && uses.length > 0;
  return (
    <div className="border-b border-border-base py-1.5">
      <div className="flex items-center justify-between text-xs">
        <ItemName entry={row.entry} />
        <div className="font-mono text-text-low flex items-center gap-3">
          <span className="text-crimson">no vendor · discard</span>
          {hasUses && <UsesToggle open={open} setOpen={setOpen} count={uses!.length} />}
        </div>
      </div>
      {open && hasUses && <UsesDisclosure entries={uses!} />}
    </div>
  );
}

function UsesToggle({ open, setOpen, count }: { open: boolean; setOpen: (v: boolean) => void; count: number }) {
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className="text-aether hover:text-gold font-mono"
    >
      {open ? '▾' : '▸'} used in {count} {count === 1 ? 'recipe' : 'recipes'}
    </button>
  );
}

function UsesDisclosure({ entries }: { entries: UsesEntry[] }) {
  return (
    <div className="mt-2 pl-4 font-mono text-[11px] space-y-1">
      {entries.map((e) => (
        <div key={e.outputItemId} className="flex items-center justify-between">
          <Link to={`/item/${e.outputItemId}`} className="text-text-cream hover:text-gold">
            {e.outputName} <span className="text-text-low">(needs {e.amountNeeded}×)</span>
          </Link>
          <span className="text-text-low">
            {e.outputUnitPrice > 0
              ? <>output {fmtFull(e.outputUnitPrice)}g</>
              : <span className="text-text-low italic">no MB price</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function UnrecognizedRow({ entry }: { entry: InventoryEntry }) {
  return (
    <div className="border-b border-border-base py-1.5 flex items-center justify-between text-xs">
      <span className="text-text-cream">"{entry.name}" <span className="text-text-low">qty {entry.qty}</span></span>
      <span className="font-mono text-text-low">not in current snapshot</span>
    </div>
  );
}
