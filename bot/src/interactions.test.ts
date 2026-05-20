import { describe, it, expect, vi } from 'vitest';
import { handleInteraction, type InteractionDeps } from './interactions';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';
import { encodeCustomId } from './buttons';
import type { MarketBundle } from '../../src/features/watchlist/useMarketData';

interface FakeInteraction {
  customId: string;
  user: { id: string };
  isButton: () => boolean;
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
}

function fakeInteraction(customId: string, userId: string): FakeInteraction {
  return {
    customId,
    user: { id: userId },
    isButton: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeEntry(ownerId: string, cacheId: string): CachedCleanup {
  const now = Date.now();
  return {
    ownerId,
    cacheId,
    csv: 'fake-csv',
    parsed: { entries: [], unrecognized: [] },
    marketIds: [123],
    result: { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [] },
    usesByItemId: new Map(),
    createdAt: now,
    lastTouchedAt: now,
  };
}

function emptyMarket(): MarketBundle {
  return { phantom: {}, dc: {}, region: {} };
}

function fakeDeps(overrides: Partial<InteractionDeps> = {}): InteractionDeps {
  const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
  return {
    cache,
    snapshots: { itemsById: new Map(), namesById: new Map(), recipes: new Map() },
    cfg: { world: 'Phantom', dc: 'Chaos', region: 'Europe' },
    fetchMarket: vi.fn().mockResolvedValue(emptyMarket()),
    ...overrides,
  };
}

describe('handleInteraction', () => {
  it('ignores non-button interactions', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction('cleanup:abc:user1:craft', 'user1');
    i.isButton = () => false;
    await handleInteraction(i as any, deps);
    expect(i.reply).not.toHaveBeenCalled();
  });

  it('ignores customIds that are not ours', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction('unrelated-button', 'user1');
    await handleInteraction(i as any, deps);
    expect(i.reply).not.toHaveBeenCalled();
  });

  it('refuses owner-mismatched clicks', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'abcdef012345', action: 'craft' }),
      'user2',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('otro inventario'),
        ephemeral: true,
      }),
    );
  });

  it('returns cache-miss message when entry expired or evicted', async () => {
    const deps = fakeDeps();
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'abcdef012345', action: 'craft' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('descansa en paz'),
        ephemeral: true,
      }),
    );
  });

  it('returns cache-miss when cacheId does not match the cached entry', async () => {
    const deps = fakeDeps();
    deps.cache.set('user1', fakeEntry('user1', 'currentid0000'));
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'staleid000000', action: 'craft' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('descansa en paz'),
        ephemeral: true,
      }),
    );
  });

  it('craft action replies ephemerally with expanded craft embeds', async () => {
    const deps = fakeDeps();
    deps.cache.set('user1', fakeEntry('user1', 'abcdef012345'));
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'abcdef012345', action: 'craft' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        embeds: expect.any(Array),
      }),
    );
  });

  it('refresh action re-fetches market, inserts a new cache entry with new cacheId, and edits the deferred reply', async () => {
    const fetchMarket = vi.fn().mockResolvedValue(emptyMarket());
    const deps = fakeDeps({ fetchMarket });
    deps.cache.set('user1', fakeEntry('user1', 'oldcacheid12'));
    const i = fakeInteraction(
      encodeCustomId({ ownerId: 'user1', cacheId: 'oldcacheid12', action: 'refresh' }),
      'user1',
    );
    await handleInteraction(i as any, deps);
    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(fetchMarket).toHaveBeenCalledWith([123], deps.cfg);
    expect(i.editReply).toHaveBeenCalled();
    const fresh = deps.cache.get('user1');
    expect(fresh).not.toBeNull();
    expect(fresh!.cacheId).not.toBe('oldcacheid12');
  });
});
