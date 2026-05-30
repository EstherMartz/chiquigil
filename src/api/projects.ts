import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { requireSession } from './_auth';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  res.setHeader('Cache-Control', 'no-store');

  const url = req.url ?? '';
  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);
  const store = await getStore();

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

export const config = { api: { bodyParser: false } };
