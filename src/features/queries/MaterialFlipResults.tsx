import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { MaterialFlipRow, MaterialFlipSort } from './types';

interface Props {
  rows: MaterialFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: MaterialFlipSort;
  onSortChange: (next: MaterialFlipSort) => void;
}

function SortableHeader({
  active, onClick, children, align = 'right', hideOnMobile = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
}) {
  const tail = active ? ' ▼' : '';
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-${align} ${
        hideOnMobile ? 'hidden md:table-cell' : ''
      } ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
    >
      {children}{tail}
    </th>
  );
}

export function MaterialFlipResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No cross-world material savings tonight. Try lowering Min savings,
          raising Max listings, or including Light DC.
        </EmptyResults>
      }
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'salePrice'} onClick={() => onSortChange('salePrice')}>
                <InfoTooltip label="Cheapest trusted listing on your home world. Your sell price.">Sale</InfoTooltip>
              </SortableHeader>
              <th className="text-right px-3 py-2 text-text-dim hidden md:table-cell">
                <InfoTooltip label="Total ingredient cost using only home-world prices.">Home mats</InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 text-text-dim hidden md:table-cell">
                <InfoTooltip label="Total cost if you bought each ingredient on its cheapest world in the region (max savings; multi-hop).">
                  Region mats
                </InfoTooltip>
              </th>
              <SortableHeader active={sort === 'savePerCraft'} onClick={() => onSortChange('savePerCraft')}>
                <InfoTooltip label="Home mats − region mats. Maximum savings per craft if you visit every cheapest world.">
                  Save/craft
                </InfoTooltip>
              </SortableHeader>
              <SortableHeader active={sort === 'pctDiscount'} onClick={() => onSortChange('pctDiscount')} hideOnMobile>
                <InfoTooltip label="Savings as a fraction of home material cost.">%</InfoTooltip>
              </SortableHeader>
              <th className="text-left px-3 py-2 text-text-dim hidden md:table-cell">
                <InfoTooltip label="If you make ONE hop, this is the world where your full basket totals the least.">
                  Best stop
                </InfoTooltip>
              </th>
              <SortableHeader active={sort === 'gilSavedPerDay'} onClick={() => onSortChange('gilSavedPerDay')}>
                <InfoTooltip label="Save/craft × home velocity. Expected daily gil saved.">Save/day</InfoTooltip>
              </SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>
                <InfoTooltip label="Sales per day on your home world.">Vel</InfoTooltip>
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.salePrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.homeMatCost)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.bestPerIngredientCost)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.perIngredientSavings)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{Math.round(r.pctDiscount * 100)}%</td>
                <td className={`px-3 ${rowY} hidden md:table-cell`}>
                  <span className="text-aether">{r.bestSingleWorld}</span>
                  {r.needsDcTravel && <span className="text-text-low ml-1">✈ (Light DC)</span>}
                </td>
                <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>{fmtGil(Math.round(r.gilSavedPerDay))}</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
