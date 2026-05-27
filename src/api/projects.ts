import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import type { StoredTask, TaskSource } from '../bot/craftTypes';

function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  // Test hook so unit tests can supply their own in-memory store.
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

function isAllowed(guildId: string): boolean {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}

function computeTaskCounts(tasks: StoredTask[]) {
  const byStatus = { open: 0, claimed: 0, done: 0 };
  const bySource: Record<TaskSource, number> = {
    craft: 0, workshop: 0, market: 0, vendor: 0, currency: 0, gather: 0,
  };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    bySource[t.source] = (bySource[t.source] ?? 0) + 1;
  }
  return { byStatus, bySource };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store');

  const url = req.url ?? '';
  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);

  const store = await getStore();

  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const project = await store.getProject(id);
    if (!project || !isAllowed(project.guildId)) {
      // Return 404 in both branches to avoid revealing whether the ID exists.
      return res.status(404).json({ error: 'Not found' });
    }
    const tasks = await store.getTasks(id);
    return res.status(200).json({
      project: {
        id: project.id,
        name: project.name,
        targetItemId: project.targetItemId,
        targetQty: project.targetQty,
        createdBy: project.createdBy,
        threadId: project.threadId,
        status: project.status,
        createdAt: project.createdAt,
      },
      tasks,
    });
  }

  const guildId = (req.query?.guild as string | undefined) ?? '';
  if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
  if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });

  const statusFilter = (req.query?.status as string | undefined) ?? 'open';
  let projects = await store.listOpenProjects(guildId);
  if (statusFilter === 'closed') projects = [];

  const summaries = await Promise.all(projects.map(async (p) => {
    const tasks = await store.getTasks(p.id);
    return {
      id: p.id,
      name: p.name,
      targetItemId: p.targetItemId,
      targetQty: p.targetQty,
      createdBy: p.createdBy,
      threadId: p.threadId,
      status: p.status,
      createdAt: p.createdAt,
      taskCounts: computeTaskCounts(tasks),
    };
  }));
  return res.status(200).json({ projects: summaries });
}

export const config = { api: { bodyParser: false } };
