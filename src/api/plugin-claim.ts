import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';

function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowed(guildId: string): boolean {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId, taskId, characterName, guildId } = req.body ?? {};

  if (!projectId || !taskId || !characterName || !guildId) {
    return res.status(400).json({ error: 'Missing required fields: projectId, taskId, characterName, guildId' });
  }

  if (!isAllowed(String(guildId))) {
    return res.status(403).json({ error: 'Guild not in allow-list' });
  }

  const store = await getStore();

  // Verify the task belongs to a project owned by this guild.
  const project = await store.getProject(Number(projectId));
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (project.guildId !== String(guildId)) {
    return res.status(403).json({ error: 'Project does not belong to this guild' });
  }

  const task = await store.claimTaskByCharacter(Number(taskId), String(characterName));
  if (!task) {
    return res.status(409).json({ error: 'Task not found or already claimed' });
  }

  return res.status(200).json({ ok: true, task });
}
