import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';
import type { CleanupResult, CleanupRow, CraftOpportunity, InventoryEntry } from './types';

interface CleanupResultsProps {
  result: CleanupResult;
}

function fmtGil(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

function fmtFull(n: number): string {
  return n.toLocaleString();
}

export function CleanupResults({ result }: CleanupResultsProps) {
  const anything =
    result.craft.length || result.sellMb.length || result.vendor.length ||
    result.discard.length || result.unrecognized.length;
  if (!anything) return null;

  return (
    <div className="space-y-8">
      {result.craft.length > 0 && (
        <Section title={`Craft these (${result.craft.length})`}>
          {result.craft.map((row) => <CraftRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} />)}
        </Section>
      )}
      {result.sellMb.length > 0 && (
        <Section title={`Sell on Marketboard (${result.sellMb.length})`}>
          {result.sellMb.map((row) => <SellRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} />)}
        </Section>
      )}
      {(result.vendor.length + result.discard.length) > 0 && (
        <Section title={`Vendor or discard (${result.vendor.length + result.discard.length})`}>
          {result.vendor.map((row) => <VendorRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} />)}
          {result.discard.map((row) => <DiscardRow key={`${row.entry.itemId}-${row.entry.isHq}`} row={row} />)}
        </Section>
      )}
      {result.unrecognized.length > 0 && (
        <Section title={`Unrecognized rows (${result.unrecognized.length})`}>
          {result.unrecognized.map((entry, i) => <UnrecognizedRow key={i} entry={entry} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionHeader label={title} />
      <div className="space-y-1">{children}</div>
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
  return (
    <div className="border-b border-border-base py-2">
      <div className="flex items-center justify-between text-xs">
        <ItemName entry={row.entry} />
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-text-cream hover:text-gold font-mono text-left"
          aria-label={row.bestCraft.outputName}
        >
          → Craft: {row.bestCraft.outputName}{' '}
          <span className="text-jade">+{fmtGil(row.bestCraft.netProfit)}</span>
          {row.otherCrafts.length > 0 && (
            <span className="text-text-low"> · +{row.otherCrafts.length} more</span>
          )}
        </button>
      </div>
      {open && <CraftDetail crafts={[row.bestCraft, ...row.otherCrafts]} />}
    </div>
  );
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
  return (
    <div className="border-b border-border-base py-2 flex items-center justify-between text-xs">
      <ItemName entry={row.entry} />
      <div className="font-mono text-text-low">
        {fmtFull(row.mbRevenue / row.entry.qty)}g/ea ·{' '}
        {row.mbListingCount < 2 ? <span className="text-crimson">thin market</span> : <span className="text-jade">{row.mbListingCount} listings</span>}{' '}
        · <span className="text-text-cream">{fmtFull(row.mbRevenue)}g</span>
      </div>
    </div>
  );
}

function VendorRow({ row }: { row: CleanupRow }) {
  return (
    <div className="border-b border-border-base py-2 flex items-center justify-between text-xs">
      <ItemName entry={row.entry} />
      <div className="font-mono text-text-low">
        vendor: {fmtFull(row.vendorRevenue / row.entry.qty)}g/ea · total {fmtFull(row.vendorRevenue)}g
      </div>
    </div>
  );
}

function DiscardRow({ row }: { row: CleanupRow }) {
  return (
    <div className="border-b border-border-base py-2 flex items-center justify-between text-xs">
      <ItemName entry={row.entry} />
      <div className="font-mono text-text-low text-crimson">no vendor · discard</div>
    </div>
  );
}

function UnrecognizedRow({ entry }: { entry: InventoryEntry }) {
  return (
    <div className="border-b border-border-base py-2 flex items-center justify-between text-xs">
      <span className="text-text-cream">"{entry.name}" <span className="text-text-low">qty {entry.qty}</span></span>
      <span className="font-mono text-text-low">not in current snapshot</span>
    </div>
  );
}
