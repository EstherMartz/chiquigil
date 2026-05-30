import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { loadSnapshots } from '../bot/loadSnapshots';
import { buildNameIndex } from '../bot/nameIndex';
import { handleCraftNew, type CraftCommandDeps } from '../bot/craftCommands';
import { isAllowed, listProjectSummaries, getProjectDetail } from './_projects-core';

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

async function loadMarketCache(): Promise<Record<string, Record<string, unknown>>> {
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {}, region: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return { phantom: {}, dc: {}, region: {} };
    return (await res.json()) as Record<string, Record<string, unknown>>;
  } catch {
    return { phantom: {}, dc: {}, region: {} };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const url = req.url ?? '';

  // ── GET: list or detail ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const store = await getStore();
    const detailMatch = /\/api\/plugin\/projects\/(\d+)/.exec(url);
    if (detailMatch) {
      const detail = await getProjectDetail(store, Number(detailMatch[1]));
      if (!detail) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(detail);
    }
    const guildId = (req.query?.guild as string | undefined) ?? '';
    if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
    if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });
    const statusFilter = (req.query?.status as string | undefined) ?? 'open';
    return res.status(200).json(await listProjectSummaries(store, guildId, statusFilter));
  }

  // ── POST: create ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { guildId, itemId, qty, name, characterName, intermediates } = req.body ?? {};

    // Validate BEFORE assembling create deps (so bad requests never load snapshots).
    if (!guildId || itemId == null || qty == null || !characterName) {
      return res.status(400).json({ error: 'Missing required fields: guildId, itemId, qty, characterName' });
    }
    if (!isAllowed(String(guildId))) {
      return res.status(403).json({ error: 'Guild not in allow-list' });
    }
    const qtyNum = Number(qty);
    const itemIdNum = Number(itemId);
    if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 99999) {
      return res.status(400).json({ error: 'qty must be between 1 and 99999' });
    }

    const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'qiqirn.tools';
    const baseUrl = `${proto}://${host}`;

    const [store, snapshots, cache] = await Promise.all([
      getStore(),
      loadSnapshots(baseUrl),
      loadMarketCache(),
    ]);
    const nameIndex = buildNameIndex(snapshots.namesById);
    const marketBundle = { phantom: cache.phantom ?? {}, dc: cache.dc ?? {}, region: cache.region ?? {} };

    const deps: CraftCommandDeps = {
      store,
      snapshots,
      nameIndex,
      marketBundle: marketBundle as any,
      botToken: process.env.DISCORD_BOT_TOKEN ?? '',
      appId: process.env.DISCORD_APP_ID ?? '',
      world: process.env.HOME_WORLD ?? 'Phantom',
      dc: process.env.HOME_DC ?? 'Chaos',
      region: process.env.REGION ?? 'Europe',
      craftChannelId: process.env.CRAFT_CHANNEL_ID || undefined,
      crafterRoleId: process.env.CRAFTER_ROLE_ID || undefined,
    };

    // channelId '' → handleCraftNew falls back to the guild's configured craft channel.
    // characterName is the createdBy/userId (rendered mention-safe downstream).
    const result = await handleCraftNew(
      { itemId: itemIdNum, qty: qtyNum, name: name ?? null, intermediates: intermediates ?? true },
      String(guildId),
      '',
      String(characterName),
      deps,
    );

    if (typeof result.projectId === 'number') {
      return res.status(200).json({
        ok: true,
        projectId: result.projectId,
        taskCount: result.taskCount ?? 0,
      });
    }
    return res.status(200).json({ ok: false, error: result.content ?? 'Could not create project' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
