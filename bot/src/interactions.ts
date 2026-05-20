import type { ButtonInteraction, Interaction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { randomBytes } from 'node:crypto';
import { decodeCustomId, type ButtonAction } from './buttons';
import type { CleanupCache, CachedCleanup } from './cleanupCache';
import type { BotSnapshots } from './loadSnapshots';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';
import {
  formatCleanupReply,
  formatExpandedCraftReply,
  formatExpandedSellReply,
  formatExpandedVendorDiscardReply,
} from './formatDiscord';
import { findCraftOpportunities } from '../../src/features/cleanup/findCraftOpportunities';
import { findInventoryUses } from '../../src/features/cleanup/findInventoryUses';
import { runCleanup } from '../../src/features/cleanup/runCleanup';

const OWNER_MISMATCH = 'Este botón pertenece a otro inventario ✨';
const CACHE_MISS = 'Tu inventario ya descansa en paz ✨ Súbelo otra vez si quieres seguir ordenando.';

export interface BotConfig {
  world: string;
  dc: string;
  region: string;
}

export interface InteractionDeps {
  cache: CleanupCache;
  snapshots: BotSnapshots;
  cfg: BotConfig;
  fetchMarket: (ids: number[], cfg: BotConfig) => Promise<MarketBundle>;
}

export function newCacheId(): string {
  return randomBytes(6).toString('hex');
}

async function replyEphemeral(
  btn: ButtonInteraction,
  embeds: EmbedBuilder[],
): Promise<void> {
  try {
    await btn.reply({ embeds, ephemeral: true });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error('Failed to send ephemeral reply:', m);
    // Best-effort follow-up; if THIS also fails, swallow — already logged.
    try {
      await btn.followUp({
        content: `No pude mostrarte la lista completa ahora mismo 🌫️ (${m})`,
        ephemeral: true,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function handleInteraction(
  interaction: Interaction,
  deps: InteractionDeps,
): Promise<void> {
  if (!interaction.isButton()) return;
  const btn = interaction as ButtonInteraction;
  const decoded = decodeCustomId(btn.customId);
  if (!decoded) return; // not one of ours

  if (decoded.ownerId !== btn.user.id) {
    await btn.reply({ content: OWNER_MISMATCH, ephemeral: true });
    return;
  }

  const cached = deps.cache.get(btn.user.id);
  if (!cached || cached.cacheId !== decoded.cacheId) {
    await btn.reply({ content: CACHE_MISS, ephemeral: true });
    return;
  }

  switch (decoded.action) {
    case 'craft': {
      const embeds = formatExpandedCraftReply(cached.result, cached.usesByItemId);
      await replyEphemeral(btn, embeds);
      return;
    }
    case 'sell': {
      const embeds = formatExpandedSellReply(cached.result);
      await replyEphemeral(btn, embeds);
      return;
    }
    case 'vendor': {
      const embeds = formatExpandedVendorDiscardReply(cached.result);
      await replyEphemeral(btn, embeds);
      return;
    }
    case 'refresh': {
      await btn.deferReply({ ephemeral: true });
      try {
        const market = await deps.fetchMarket(cached.marketIds, deps.cfg);
        const craftMap = findCraftOpportunities(
          cached.parsed.entries,
          deps.snapshots.recipes,
          market,
          deps.snapshots.itemsById,
        );
        const result = runCleanup({
          inventory: cached.parsed.entries,
          market,
          items: deps.snapshots.itemsById,
          craftOpportunities: craftMap,
          unrecognized: cached.parsed.unrecognized,
        });
        const usesByItemId = findInventoryUses(
          cached.parsed.entries,
          deps.snapshots.recipes,
          market,
          deps.snapshots.itemsById,
        );
        const cacheId = newCacheId();
        const next: CachedCleanup = {
          ...cached,
          cacheId,
          result,
          usesByItemId,
          lastTouchedAt: Date.now(),
        };
        deps.cache.set(btn.user.id, next);
        const totalRows = cached.parsed.entries.length + cached.parsed.unrecognized.length;
        const reply = formatCleanupReply(
          { result, usesByItemId, totalRows },
          { ownerId: btn.user.id, cacheId },
        );
        await btn.editReply({
          content: reply.summary,
          embeds: reply.embeds,
          files: reply.files,
          components: reply.components,
        });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        await btn.editReply({
          content: `No pude refrescar los precios ahora mismo 🌫️ El Mercado está esquivo. Inténtalo en un ratito. (${m})`,
          embeds: [],
          files: [],
          components: [],
        });
      }
      return;
    }
  }
}

export type { ButtonAction };
