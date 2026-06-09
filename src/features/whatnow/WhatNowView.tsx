import { useEffect, useMemo, useState } from 'react';
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
import { isItemHidden } from '../queries/commonFilters';
import { useIgnoredItemSet } from '../settings/useIgnoredItems';
import { buildHeatmapCells, type HeatmapCell } from '../heatmap/buildHeatmapData';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { CopyButton } from '../../components/CopyButton';
import type { SnapshotItem } from '../../lib/itemSnapshot';

const SAMPLE_SIZE = 300;

type Tone = 'gold' | 'good' | 'aether' | 'bad';

interface TopPick {
  id: number;
  name: string;
  kind: string;          // "Craft-flip", "Gather", etc.
  tone: Tone;            // tag color
  action: string;        // "Craft & sell", "Buy from NPC", ...
  metric: string;        // "+ 28,500"
  metricLabel: string;   // "profit / unit"
  hint: string;          // free-form sentence
  meta: string[];        // ["31% margin", "6 listings HQ"]
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
  const margin = r.unitPrice > 0 ? Math.round(((r.unitPrice - r.materialCost) / r.unitPrice) * 100) : 0;
  return {
    id: r.id, name: r.name,
    kind: 'Craft-flip', tone: 'gold',
    action: 'Craft & sell',
    metric: `+ ${fmtGil(r.profit)}`, metricLabel: 'profit / unit',
    hint: `Sells around ${fmtGil(r.unitPrice)} · materials cost ${fmtGil(r.materialCost)}. Velocity ${r.velocity.toFixed(1)}/day at current prices.`,
    meta: [`${margin}% margin`, `${r.velocity.toFixed(1)}/day`],
    pageLink: '/crafts', pageLabel: 'See all crafts',
  };
}

function pickVendor(rows: VendorFlipRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name,
    kind: 'Vendor flip', tone: 'gold',
    action: 'Buy from NPC',
    metric: `+ ${fmtGil(r.profitPerUnit)}`, metricLabel: 'profit / unit',
    hint: `Vendor sells for ${fmtGil(r.vendorPrice)} → marketboard sells for ${fmtGil(r.salePrice)}. Velocity ${r.velocity.toFixed(1)}/day.`,
    meta: [`Buy ${fmtGil(r.vendorPrice)}`, `${r.velocity.toFixed(1)}/day`],
    pageLink: '/vendor-flip', pageLabel: 'See all vendor flips',
  };
}

function pickCurrency(rows: CurrencyFlipRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name,
    kind: 'Currency', tone: 'aether',
    action: 'Exchange tomestones for',
    metric: `+ ${fmtGil(r.gilPerUnit)}`, metricLabel: 'gil / unit',
    hint: `Trade ${r.costPerUnit} currency for one unit, sells around ${fmtGil(r.salePrice)} on the marketboard.`,
    meta: [`${r.costPerUnit} currency`, `${r.velocity.toFixed(1)}/day`],
    pageLink: '/currency-flip', pageLabel: 'See all currency plays',
  };
}

function pickGcSupply(rows: QuestItemRow[]): TopPick | null {
  if (rows.length === 0) return null;
  const r = rows[0];
  const price = r.hqPrice ?? r.nqPrice ?? 0;
  const dailyRevenue = Math.round(price * r.velocity);
  return {
    id: r.itemId, name: r.itemName,
    kind: 'GC Supply', tone: 'gold',
    action: 'Craft and sell',
    metric: `+ ${fmtGil(dailyRevenue)}`, metricLabel: 'gil / day',
    hint: `${r.categoryName} Lv.${r.level}. Sells around ${fmtGil(price)} on the marketboard at ${r.velocity.toFixed(1)}/day.`,
    meta: [`${r.categoryName} Lv.${r.level}`, `Sale ${fmtGil(price)}`],
    pageLink: '/quest-items', pageLabel: 'See all GC supply',
  };
}

function pickGathering(cells: HeatmapCell[]): TopPick | null {
  if (cells.length === 0) return null;
  const best = cells.reduce((a, b) => (a.salePrice * a.velocity > b.salePrice * b.velocity ? a : b));
  const dailyRevenue = Math.round(best.salePrice * best.velocity);
  return {
    id: best.id, name: best.name,
    kind: 'Gather', tone: 'good',
    action: 'Gather and sell',
    metric: `+ ${fmtGil(dailyRevenue)}`, metricLabel: 'gil / day',
    hint: `Sells around ${fmtGil(best.salePrice)} per unit at ${best.velocity.toFixed(1)}/day on the marketboard.`,
    meta: [`Sale ${fmtGil(best.salePrice)}`, `${best.velocity.toFixed(1)}/day`],
    pageLink: '/gathering', pageLabel: 'See all gathering plays',
  };
}

function formatAgo(ts: number, now: number): string {
  const diffMin = Math.max(0, Math.floor((now - ts) / 60_000));
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1m ago';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hr = Math.floor(diffMin / 60);
  return hr === 1 ? '1h ago' : `${hr}h ago`;
}

function freshnessTone(ageMin: number): { dot: string; text: string; label: string } {
  if (ageMin < 15) return { dot: 'bg-jade', text: 'text-jade', label: 'Fresh' };
  if (ageMin < 60) return { dot: 'bg-gold', text: 'text-gold', label: 'OK' };
  return { dot: 'bg-crimson', text: 'text-crimson', label: 'Stale' };
}

export function WhatNowView() {
  const { world, hideCrystals } = useSettingsStore();
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
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

    const craftable = items.filter((i) => i.sc > 0 && recipeSnap.data!.has(i.id));
    craftable.sort((a, b) => b.ilvl - a.ilvl);
    for (const i of craftable.slice(0, SAMPLE_SIZE)) ids.add(i.id);
    for (const [id] of vendorSnap.data!.snapshot) ids.add(id);
    const poeticsEntries = shopSnap.data!.snapshot.byCurrency.get('poetics') ?? [];
    for (const e of poeticsEntries) ids.add(e.itemId);
    for (const q of questSnap.data!.snapshot) {
      for (const r of q.requiredItems) ids.add(r.itemId);
    }
    for (const [id] of gatherSnap.data!) {
      const item = items.find((i) => i.id === id);
      if (item && item.sc > 0 && !isItemHidden(item, { hideCrystals, hideIgnored, ignored })) ids.add(id);
    }
    for (const i of craftable.slice(0, SAMPLE_SIZE)) {
      const recipe = recipeSnap.data!.get(i.id);
      if (recipe) for (const ing of recipe.ingredients) ids.add(ing.itemId);
    }

    return [...ids];
  }, [notReady, itemSnap.data, recipeSnap.data, vendorSnap.data, shopSnap.data, questSnap.data, gatherSnap.data, hideCrystals, hideIgnored, ignored]);

  const [scanTimestamp, setScanTimestamp] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoRanOnce, setAutoRanOnce] = useState(false);

  const run = useMutation<ScanResult>({
    mutationFn: async () => {
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

      const craftRows = runCraftFlip(items, market, recipes, {
        searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0.5,
        minPrice: null, maxPrice: null, sort: 'discount', limit: 5,
        scope: 'home', maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
      });
      const vendorRows = runVendorFlip(items, vendorSnap.data!.snapshot, market, {
        ...defaultVendorFlipFilter(), sort: 'profitPerDay', limit: 5,
      });
      const currencyRows = runCurrencyFlip(items, shopSnap.data!.snapshot, market, {
        ...defaultCurrencyFlipFilter(), limit: 5,
      });
      const gcRows = runQuestItemFlip(questSnap.data!.snapshot, itemsById, market, {
        ...defaultQuestItemFilter(), hq: 'either',
      }).slice(0, 5);
      const gatherIds = new Set<number>();
      for (const [id] of gatherSnap.data!) gatherIds.add(id);
      const gatherItems = items.filter((i) => gatherIds.has(i.id) && i.sc > 0 && !recipes.has(i.id));
      const gatherCells = buildHeatmapCells(gatherItems, market, new Map());

      setScanTimestamp(Date.now());
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

  // Auto-fire on first ready render — design F.01: "What Now?" is an answer, not a button.
  useEffect(() => {
    if (!notReady && !autoRanOnce && !run.isPending && !run.data && !run.isError) {
      setAutoRanOnce(true);
      run.mutate();
    }
  }, [notReady, autoRanOnce, run.isPending, run.data, run.isError, run]);

  // Tick every 30s so the freshness stamp updates without manual refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ageMin = scanTimestamp ? Math.max(0, Math.floor((now - scanTimestamp) / 60_000)) : 0;
  const fresh = freshnessTone(ageMin);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl text-gold tracking-wide">What Now?</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Your best moves right now, ranked. Pulled live from {world} prices across crafting, vendor flips, currencies, GC supply, and gathering.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scanTimestamp && run.data && (
            <div className={`flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase ${fresh.text}`}>
              <span aria-hidden className={`inline-block w-1.5 h-1.5 rounded-full ${fresh.dot}`} />
              <span>{fresh.label} · {formatAgo(scanTimestamp, now)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => run.mutate()}
            disabled={run.isPending || notReady}
            title={notReady ? 'Loading catalogs…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {run.isPending ? <>Scanning…<span aria-hidden className="ml-1 inline-block animate-spin">❖</span></> : (run.data ? '↻ Refresh' : 'Run scan →')}
          </button>
        </div>
      </div>

      {notReady && !run.data && (
        <div className="font-mono text-[10px] text-text-low">Loading catalogs…</div>
      )}

      {run.isPending && (
        progress
          ? <ProgressBar current={progress.current} total={progress.total} label={`Scanning ${world} market…`} />
          : <Spinner label={`Scanning ${world} market for best opportunities…`} />
      )}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}

      {run.data && (() => {
        const picks: TopPick[] = [
          run.data.craft, run.data.vendor, run.data.currency, run.data.gcSupply, run.data.gathering,
        ].filter((p): p is TopPick => p != null);
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {picks.map((p, idx) => (
              <MoveCard key={p.kind + p.id} pick={p} rank={idx + 1} primary={idx === 0} />
            ))}
          </div>
        );
      })()}
    </div>
  );
}

const TONE_TAG_CLASSES: Record<Tone, string> = {
  gold: 'text-gold border-gold/40',
  good: 'text-jade border-jade/40',
  aether: 'text-aether border-aether/40',
  bad: 'text-crimson border-crimson/40',
};

const TONE_METRIC_CLASSES: Record<Tone, string> = {
  gold: 'text-gold',
  good: 'text-jade',
  aether: 'text-aether',
  bad: 'text-crimson',
};

function MoveCard({ pick, rank, primary }: { pick: TopPick; rank: number; primary?: boolean }) {
  const rankStr = String(rank).padStart(2, '0');
  return (
    <div
      className={`bg-bg-card border ${primary ? 'border-gold/60 bg-bg-card-hi' : 'border-border-base'} border-l-[3px] ${primary ? 'border-l-gold' : 'border-l-gold/40'} p-4 space-y-2.5`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-2xl text-gold leading-none">{rankStr}</span>
          <span className={`font-mono text-[10px] tracking-widest uppercase border ${TONE_TAG_CLASSES[pick.tone]} px-2 py-0.5 rounded-sm`}>
            {pick.kind}
          </span>
        </div>
        <div className="text-right">
          <div className={`font-mono text-lg tabular-nums leading-none ${TONE_METRIC_CLASSES[pick.tone]}`}>{pick.metric}</div>
          <div className="font-mono text-[10px] text-text-low mt-1">{pick.metricLabel}</div>
        </div>
      </div>

      <div className="text-sm text-text-cream flex items-baseline gap-2 flex-wrap">
        <span>{pick.action}</span>
        <Link
          to={`/item/${pick.id}`}
          className="font-display italic text-base text-gold hover:underline decoration-1 underline-offset-4"
        >
          {pick.name}
        </Link>
        <CopyButton text={pick.name} />
      </div>

      <p className="text-[12.5px] text-text-dim leading-snug">{pick.hint}</p>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-dashed border-border-base">
        <div className="flex items-center gap-3 font-mono text-[10px] text-text-low tracking-widest uppercase">
          {pick.meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
        <Link
          to={pick.pageLink}
          className="font-mono text-[10px] tracking-widest uppercase text-aether hover:underline decoration-1 underline-offset-4"
        >
          {pick.pageLabel} →
        </Link>
      </div>
    </div>
  );
}
