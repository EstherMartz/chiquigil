import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { CleanupResult } from '../../src/features/cleanup/types';

export type ButtonAction = 'craft' | 'sell' | 'vendor' | 'refresh';

const ACTIONS: ReadonlySet<ButtonAction> = new Set(['craft', 'sell', 'vendor', 'refresh']);

export interface DecodedCustomId {
  ownerId: string;
  cacheId: string;
  action: ButtonAction;
}

export function encodeCustomId(parts: DecodedCustomId): string {
  return `cleanup:${parts.cacheId}:${parts.ownerId}:${parts.action}`;
}

export function decodeCustomId(customId: string): DecodedCustomId | null {
  const parts = customId.split(':');
  if (parts.length !== 4) return null;
  const [prefix, cacheId, ownerId, action] = parts;
  if (prefix !== 'cleanup') return null;
  if (!ACTIONS.has(action as ButtonAction)) return null;
  return { cacheId, ownerId, action: action as ButtonAction };
}

export function buildOverviewButtons(
  ownerId: string,
  cacheId: string,
  result: CleanupResult,
): ActionRowBuilder<ButtonBuilder> {
  const vendorAndDiscardCount = result.vendor.length + result.discard.length;

  const craft = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'craft' }))
    .setLabel(`🔨 Todas las recetas (${result.craft.length})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(result.craft.length === 0);

  const sell = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'sell' }))
    .setLabel(`🛒 Todo el Mercado (${result.sellMb.length})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(result.sellMb.length === 0);

  const vendor = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'vendor' }))
    .setLabel(`🗑️ Vendedor & Descartar (${vendorAndDiscardCount})`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(vendorAndDiscardCount === 0);

  const refresh = new ButtonBuilder()
    .setCustomId(encodeCustomId({ ownerId, cacheId, action: 'refresh' }))
    .setLabel('🔄 Refrescar precios')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(craft, sell, vendor, refresh);
}
