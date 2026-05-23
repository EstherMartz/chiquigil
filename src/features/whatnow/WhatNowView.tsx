import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { useQuestSnapshot } from '../queries/useQuestSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketItem } from '../../lib/universalis';
import { runCraftFlip } from '../queries/runCraftFlip';
import { runVendorFlip } from '../queries/runVendorFlip';
import { runCurrencyFlip } from '../queries/runCurrencyFlip';
import { runQuestItemFlip, defaultQuestItemFilter } from '../queries/runQuestItemFlip';
import { defaultVendorFlipFilter, defaultCurrencyFlipFilter } from '../queries/types';
import type { CraftFlipRow, VendorFlipRow, CurrencyFlipRow } from '../queries/types';
import type { QuestItemRow } from '../queries/runQuestItemFlip';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { buildHeatmapCells, type HeatmapCell } from '../heatmap/buildHeatmapData';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { CopyButton } from '../../components/CopyButton';
import { EmptyState } from '../../components/EmptyState';
import type { SnapshotItem } from '../../lib/itemSnapshot';

const SAMPLE_SIZE = 300;

interface TopPick {
  id: number;
  name: string;
  metric: string;
  metricLabel: string;
  secondary: string;
  link: string;
  pageLink: string;
  pageLabel: string;
}

interface ScanResult {
  craft: TopPick | null;
  vendor: TopPick | null;
  currency: TopPick | null;
  gcSupply: TopPick | null;
  gathering: TopPick | null;
}

function pickCraft(rows: CraftFlipRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name,
    metric: fmtGil(r.profit), metricLabel: 'profit/unit',
    secondary: `${r.velocity.toFixed(1)}/day · sells ${fmtGil(r.unitPrice)}`,
    link: `/item/${r.id}`, pageLink: '/crafts', pageLabel: 'Crafts',
  };
}

function pickVendor(rows: VendorFlipRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name,
    metric: fmtGil(r.profitPerUnit), metricLabel: 'profit/unit',
    secondary: `${r.velocity.toFixed(1)}/day · buy ${fmtGil(r.vendorPrice)}`,
    link: `/item/${r.id}`, pageLink: '/vendor-flip', pageLabel: 'Vendor flip',
  };
}

function pickCurrency(rows: CurrencyFlipRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name,
    metric: fmtGil(r.gilPerUnit), metricLabel: 'gil/unit',
    secondary: `${r.velocity.toFixed(1)}/day · ${r.costPerUnit} currency`,
    link: `/item/${r.id}`, pageLink: '/currency-flip', pageLabel: 'Currencies',
  };
}

function pickGcSupply(rows: QuestItemRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  const price = r.hqPrice ?? r.nqPrice ?? 0;
  return {
    id: r.itemId, name: r.itemName,
    metric: fmtGil(price), metricLabel: 'sale price',
    secondary: `${r.velocity.toFixed(1)}/day · ${r.categoryName} Lv.${r.level}`,
    link: `/item/${r.itemId}`, pageLink: '/quest-items', pageLabel: 'GC Supply',
  };
}

function pickGathering(cells: HeatmapCell[]): TopPick | null {
  if (cells.length === 0) return null;
  const best = cells.reduce((a, b) => (a.salePrice * a.velocity > b.salePrice * b.velocity ? a : b));
  return {
    id: best.id, name: best.name,
    metric: fmtGil(best.salePrice), metricLabel: 'sale price',
    secondary: `${best.velocity.toFixed(1)}/day · ${fmtGil(Math.round(best.salePrice * best.velocity))}/day revenue`,
    link: `/item/${best.id}`, pageLink: '/gathering', pageLabel: 'Gathering',
  };
}

export function WhatNowView() {
  const { world, hideCrystals } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const vendorSnap = useVendorShopSnapshot();
  const shopSnap = useSpecialShopSnapshot();
  const questSnap = useQuestSnapshot();
  const gatherSnap = useGatheringCatalog();

  const notReady = !itemSnap.data || !recipeSnap.data || !vendorSnap.data || !shopSnap.data || !questSnap.data || !gatherSnap.data;

  // Pre-compute candidate IDs from all sources, merged and deduped.
  const candidateIds = useMemo<number[]>(() => {
    if (notReady) return [];
    const ids = new Set<number>();
    const items = itemSnap.data!.items;

    // Tradeable items with recipes (craft flip candidates) — sample top by ilvl
    const craftable = items.filter((i) => i.sc > 0 && recipeSnap.data!.has(i.id));
    craftable.sort((a, b) => b.ilvl - a.ilvl);
    for (const i of craftable.slice(0, SAMPLE_SIZE)) ids.add(i.id);

    // Vendor flip candidates
    for (const [id] of vendorSnap.data!.snapshot) ids.add(id);

    // Currency flip — poetics candidates
    const poeticsEntries = shopSnap.data!.snapshot.byCurrency.get('poetics') ?? [];
    for (const e of poeticsEntries) ids.add(e.itemId);

    // GC supply candidates
    for (const q of questSnap.data!.snapshot) {
      for (const r of q.requiredItems) ids.add(r.itemId);
    }

    // Gathering candidates
    for (const [id] of gatherSnap.data!) {
      const item = items.find((i) => i.id === id);
      if (item && item.sc > 0 && !(hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY)) ids.add(id);
    }

    // Ingredient prices for craft flip
    for (const i of craftable.slice(0, SAMPLE_SIZE)) {
      const recipe = recipeSnap.data!.get(i.id);
      if (recipe) for (const ing of recipe.ingredients) ids.add(ing.itemId);
    }

    return [...ids];
  }, [notReady, itemSnap.data, recipeSnap.data, vendorSnap.data, shopSnap.data, questSnap.data, gatherSnap.data, hideCrystals]);

  const [scanTime, setScanTime] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const run = useMutation<ScanResult>({
    mutationFn: async () => {
      const t0 = Date.now();
      setProgress({ current: 0, total: candidateIds.length });
      const sale = await fetchInBatches<MarketItem>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        {
          chunkSize: 100,
          concurrency: 4,
          onProgress: (done) => setProgress({ current: Math.min(done * 100, candidateIds.length), total: candidateIds.length }),
        },
      );
      const market = sale.data;
      const items = itemSnap.data!.items;
      const recipes = recipeSnap.data!;
      const itemsById = new Map<number, SnapshotItem>();
      for (const i of items) itemsById.set(i.id, i);

      // Best craft
      const craftRows = runCraftFlip(items, market, recipes, {
        searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0.5,
        minPrice: null, maxPrice: null, sort: 'discount', limit: 5,
        scope: 'home', maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
      });

      // Best vendor flip
      const vendorRows = runVendorFlip(items, vendorSnap.data!.snapshot, market, {
        ...defaultVendorFlipFilter(), sort: 'profitPerDay', limit: 5,
      });

      // Best currency exchange
      const currencyRows = runCurrencyFlip(items, shopSnap.data!.snapshot, market, {
        ...defaultCurrencyFlipFilter(), limit: 5,
      });

      // Best GC supply item
      const gcRows = runQuestItemFlip(questSnap.data!.snapshot, itemsById, market, {
        ...defaultQuestItemFilter(), hq: 'either',
      }).slice(0, 5);

      // Best gathering item (non-craftable, high revenue)
      const gatherIds = new Set<number>();
      for (const [id] of gatherSnap.data!) gatherIds.add(id);
      const gatherItems = items.filter((i) => gatherIds.has(i.id) && i.sc > 0 && !recipes.has(i.id));
      const gatherCells = buildHeatmapCells(gatherItems, market, new Map());

      setScanTime(Date.now() - t0);
      setProgress(null);

      return {
        craft: pickCraft(craftRows),
        vendor: pickVendor(vendorRows),
        currency: pickCurrency(currencyRows),
        gcSupply: pickGcSupply(gcRows),
        gathering: pickGathering(gatherCells),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => { run.reset(); run.mutate(); }}
          disabled={run.isPending || notReady}
          title={notReady ? 'Loading catalogs…' : undefined}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-5 py-2.5 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {run.isPending ? 'Scanning…' : 'What should I do?'}
        </button>
        {scanTime != null && run.data && (
          <span className="font-mono text-[10px] text-text-low">{(scanTime / 1000).toFixed(1)}s · {candidateIds.length.toLocaleString()} items checked</span>
        )}
      </div>

      {notReady && <span className="font-mono text-[10px] text-text-low">Loading catalogs…</span>}
      {run.isPending && (
        progress
          ? <ProgressBar current={progress.current} total={progress.total} label={`Scanning ${world} market…`} />
          : <Spinner label={`Scanning ${world} market for best opportunities…`} />
      )}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}

      {run.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <OpportunityCard label="Craft & Sell" pick={run.data.craft} color="text-jade" />
          <OpportunityCard label="Vendor Flip" pick={run.data.vendor} color="text-gold" />
          <OpportunityCard label="Currency Exchange" pick={run.data.currency} color="text-aether" />
          <OpportunityCard label="GC Supply (sell on MB)" pick={run.data.gcSupply} color="text-gold" />
          <OpportunityCard label="Gather & Sell" pick={run.data.gathering} color="text-jade" />
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ label, pick, color }: { label: string; pick: TopPick | null; color: string }) {
  return (
    <div className={`border bg-bg-card p-4 space-y-3 ${pick ? 'border-border-base' : 'border-border-base/50 bg-bg-card/50'}`}>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">{label}</div>
      {pick ? (
        <>
          <div className="flex items-center gap-2">
            <Link
              to={pick.link}
              target="_blank"
              className="font-display text-base text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 truncate"
            >
              {pick.name}
            </Link>
            <CopyButton text={pick.name} />
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`font-mono text-lg ${color}`}>{pick.metric}</span>
            <span className="font-mono text-[10px] text-text-low">{pick.metricLabel}</span>
          </div>
          <div className="font-mono text-[10px] text-text-dim">{pick.secondary}</div>
          <Link
            to={pick.pageLink}
            className="inline-block font-mono text-[10px] tracking-widest uppercase text-aether hover:underline decoration-1 underline-offset-4"
          >
            {pick.pageLabel} →
          </Link>
        </>
      ) : (
        <EmptyState icon="◇" message="No opportunities found" />
      )}
    </div>
  );
}
