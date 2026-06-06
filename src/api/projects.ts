import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { requireSession } from './_auth';
import { isAllowed, listProjectSummaries, getProjectDetail } from './_projects-core';
import {
  handleCreateList, handleGetList, handleListLists, handleUpdateList, handleDeleteList,
} from './_lists-core';

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

async function handleLists(
  req: VercelRequest, res: VercelResponse, store: CraftStore, ownerId: string, url: string,
): Promise<VercelResponse> {
  const idMatch = /\/api\/lists\/([^/?]+)/.exec(url);
  const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (id) {
    if (req.method === 'GET') return send(res, await handleGetList(store, id));
    if (req.method === 'PUT') return send(res, await handleUpdateList(store, id, ownerId, body));
    if (req.method === 'DELETE') return send(res, await handleDeleteList(store, id, ownerId));
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'GET') return send(res, await handleListLists(store, ownerId));
  if (req.method === 'POST') return send(res, await handleCreateList(store, ownerId, body));
  return res.status(405).json({ error: 'Method not allowed' });
}

function send(res: VercelResponse, r: { status: number; body: unknown }): VercelResponse {
  return res.status(r.status).json(r.body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  res.setHeader('Cache-Control', 'no-store');
  const url = req.url ?? '';
  const store = await getStore();

  // ── Crafting Lists (personal, session-owned) ──────────────────────────────
  if (url.startsWith('/api/lists')) {
    return handleLists(req, res, store, session.sub, url);
  }

  // ── Projects (existing, guild-scoped, GET only) ───────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);
  if (detailMatch) {
    const detail = await getProjectDetail(store, Number(detailMatch[1]));
    if (!detail) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(detail);
  }

  const guildId = (req.query?.guild as string | undefined) ?? '';
  if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
  if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });

  const statusFilter = (req.query?.status as string | undefined) ?? 'open';
  const payload = await listProjectSummaries(store, guildId, statusFilter);
  return res.status(200).json(payload);
}
