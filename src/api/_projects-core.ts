import type { CraftStore } from '../bot/craftStore';
import type { StoredTask, TaskSource } from '../bot/craftTypes';

export function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowed(guildId: string): boolean {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}

export function computeTaskCounts(tasks: StoredTask[]) {
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

// User-name resolution. Cached per function instance.
const nameCache = new Map<string, string>();

async function fetchDisplayName(guildId: string, userId: string, botToken: string): Promise<string> {
  const cacheKey = `${guildId}:${userId}`;
  const cached = nameCache.get(cacheKey);
  if (cached) return cached;

  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (r.ok) {
      const m = (await r.json()) as { nick?: string | null; user?: { global_name?: string | null; username?: string | null } };
      const name = m.nick ?? m.user?.global_name ?? m.user?.username ?? userId;
      nameCache.set(cacheKey, name);
      return name;
    }
  } catch {
    // fall through to /users
  }

  try {
    const r = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (r.ok) {
      const u = (await r.json()) as { global_name?: string | null; username?: string | null };
      const name = u.global_name ?? u.username ?? userId;
      nameCache.set(cacheKey, name);
      return name;
    }
  } catch {
    // give up
  }

  nameCache.set(cacheKey, userId);
  return userId;
}

export async function resolveNames(guildId: string, userIds: Iterable<string>): Promise<Record<string, string>> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!token || unique.length === 0) return Object.fromEntries(unique.map((id) => [id, id]));
  const entries = await Promise.all(unique.map(async (id) => [id, await fetchDisplayName(guildId, id, token)] as const));
  return Object.fromEntries(entries);
}

export async function listProjectSummaries(store: CraftStore, guildId: string, statusFilter: string) {
  let projects = await store.listOpenProjects(guildId);
  if (statusFilter === 'closed') projects = [];

  const userIdSet = new Set<string>();
  const summaries = await Promise.all(projects.map(async (p) => {
    const tasks = await store.getTasks(p.id);
    userIdSet.add(p.createdBy);
    for (const t of tasks) if (t.assigneeId) userIdSet.add(t.assigneeId);
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
  const userNames = await resolveNames(guildId, userIdSet);
  return { projects: summaries, userNames };
}

/** Returns the detail payload, or null when the project doesn't exist or isn't allow-listed. */
export async function getProjectDetail(store: CraftStore, id: number) {
  const project = await store.getProject(id);
  if (!project || !isAllowed(project.guildId)) return null;

  const [tasks, rawProjectItems] = await Promise.all([
    store.getTasks(id),
    store.getProjectItems(id),
  ]);
  const userIds = [project.createdBy, ...tasks.map((t) => t.assigneeId).filter((x): x is string => x != null)];
  const userNames = await resolveNames(project.guildId, userIds);
  const projectItems = rawProjectItems.map(({ itemName, qty }) => ({ itemName, qty }));
  return {
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
    userNames,
    projectItems,
  };
}
