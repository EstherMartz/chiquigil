import { searchItems } from './nameIndex';
import type { NameIndex } from './nameIndex';
import type { CraftStore } from './craftStore';
import type { BotSnapshots } from './loadSnapshots';
import type { MarketBundle } from '../features/watchlist/useMarketData';
import { buildBreakdown } from './craftSourcing';
import { buildProjectMessage, buildBoardMessage, buildRequestPrompt } from './craftRender';
import { explode } from './craftExplode';
import * as discordApi from './discordApi';
import * as S from './craftStrings';
import type { CraftTask } from './craftTypes';

function initialDisplayPhase(tasks: CraftTask[]): { partKey: string; phaseIndex: number } | null {
  for (const t of tasks) {
    if (t.meta?.partKey != null && t.meta?.phaseIndex != null) {
      return { partKey: t.meta.partKey, phaseIndex: t.meta.phaseIndex };
    }
  }
  return null;
}

export interface CraftCommandDeps {
  store: CraftStore;
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  marketBundle: MarketBundle;
  botToken: string;
  appId: string;
  world: string;
  dc: string;
  region: string;
  craftChannelId?: string;
  crafterRoleId?: string;
}

export interface CommandResponse {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  flags?: number;
  projectId?: number;
  taskCount?: number;
  unmatched?: string[];
}

/**
 * Handle /craft new — create a new craft project.
 * When `item` is omitted, creates an empty multi-item project (no announcement yet).
 */
export async function handleCraftNew(
  opts: { item?: string | null; itemId?: number | null; qty?: number | null; name?: string | null; intermediates?: boolean; pingRole?: string | null },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // ── Empty project (no item provided) ──────────────────────────────────────
  if (!opts.item && opts.itemId == null) {
    if (!opts.name) {
      return { content: 'Nyeh~! Se requiere un nombre cuando no se especifica objeto, kukuru.', flags: 64 };
    }
    let targetChannelId = deps.craftChannelId ?? channelId;
    try {
      const guildConfig = await deps.store.getGuildConfig(guildId);
      if (guildConfig) {
        targetChannelId = guildConfig.craftChannelId;
      }
    } catch (e) {
      console.warn('[craft] failed to fetch guild config, using fallback', e instanceof Error ? e.message : e);
    }
    const projectId = await deps.store.createProject({
      guildId,
      channelId: targetChannelId,
      name: opts.name,
      targetItemId: 0,
      targetQty: 0,
      createdBy: userId,
    });
    return { content: S.EMPTY_PROJECT_CREATED(projectId), flags: 64 };
  }

  // ── Single-item project (existing flow) ───────────────────────────────────
  const qty = opts.qty ?? 1;

  // Resolve the target item. The plugin passes an exact itemId; the bot passes a
  // name to fuzzy-search.
  let itemId: number;
  let itemName: string;
  if (opts.itemId != null) {
    itemId = opts.itemId;
    itemName = deps.snapshots.namesById.get(opts.itemId) ?? `Item #${opts.itemId}`;
  } else {
    const matches = searchItems(deps.nameIndex, opts.item!, 1);
    if (matches.length === 0) {
      return { content: S.ITEM_NOT_FOUND(opts.item!), flags: 64 };
    }
    itemId = matches[0].id;
    itemName = matches[0].name;
  }
  const projectName = opts.name ?? `${qty}× ${itemName}`;
  const craftIntermediates = opts.intermediates ?? true;

  console.log(`[craft] new project: ${projectName} (item ${itemId}, qty ${qty})`);

  // Run breakdown
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;

  const preExplode = explode(itemId, qty, recipes, { craftIntermediates });
  const allLeafIds = [...preExplode.leaves.keys()];

  console.log(`[craft] using pre-fetched market for ${allLeafIds.length} leaf items…`);
  const market = deps.marketBundle;

  const breakdown = buildBreakdown(
    itemId,
    qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
    { craftIntermediates },
  );

  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { content: S.NO_RECIPE(itemName), flags: 64 };
  }

  // Determine target channel from guild config or env var, then detect if forum
  let targetChannelId = deps.craftChannelId ?? channelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) {
      targetChannelId = guildConfig.craftChannelId;
    }
  } catch (e) {
    console.warn('[craft] failed to fetch guild config, using fallback', e instanceof Error ? e.message : e);
  }

  const channelInfo = await discordApi.getChannel(deps.botToken, targetChannelId);
  const isForumChannel = channelInfo?.type === 15;

  // For CompanyCraft projects with multiple phases, default the embed to show
  // the first phase (Wall · Fase 1 etc.); standard recipes leave these null.
  const initial = initialDisplayPhase(allTasks);

  // Persist
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: qty,
    createdBy: userId,
    displayPartKey: initial?.partKey ?? null,
    displayPhaseIndex: initial?.phaseIndex ?? null,
  });
  await deps.store.addTasks(projectId, allTasks);

  const project = await deps.store.getProject(projectId);
  if (!project) {
    return { content: 'Failed to create project', flags: 64 };
  }

  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);

  // Build content with role ping
  const roleId = opts.pingRole ?? deps.crafterRoleId;
  let content = '';
  if (roleId) content = `<@&${roleId}> `;
  content += S.NEW_PROJECT_CONTENT(projectId);

  // ──────────────────────────────────────────────────────────────────
  // Forum vs Text channel flow
  // ──────────────────────────────────────────────────────────────────
  if (isForumChannel) {
    // Forum: create a post (which is a thread with a first message)
    let forumPost: Record<string, unknown> | null = null;
    try {
      forumPost = await discordApi.createForumPost(
        deps.botToken,
        targetChannelId,
        projectName.slice(0, 100),
        {
          content,
          embeds,
          components,
          allowed_mentions: roleId ? { roles: [roleId] } : undefined,
        },
      );
    } catch (e) {
      return { content: `No se pudo crear el post en el foro — ${e instanceof Error ? e.message : String(e)}`, flags: 64 };
    }

    if (!forumPost) {
      return { content: 'No se pudo crear el post en el foro', flags: 64 };
    }

    // In forum channels, the thread is the post itself
    const threadId = String(forumPost.id);
    await deps.store.setProjectThreadId(projectId, threadId);

    // Send welcome message to the forum post thread
    const threadMsg = S.THREAD_PROJECT_CREATED(userId, storedTasks.length);
    try {
      await discordApi.sendToChannel(deps.botToken, threadId, { content: threadMsg });
    } catch (e) {
      console.error('[craft] failed to send forum post message:', e instanceof Error ? e.message : e);
    }
  } else {
    // Text channel: create message and thread
    const announcementMsg = await discordApi.sendToChannel(deps.botToken, targetChannelId, {
      content,
      embeds,
      components,
      allowed_mentions: roleId ? { roles: [roleId] } : undefined,
    });

    if (!announcementMsg) {
      return { content: S.CHANNEL_NOT_FOUND, flags: 64 };
    }

    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(projectId, messageId);

    // Create thread on the announcement
    try {
      const thread = await discordApi.createThread(
        deps.botToken,
        targetChannelId,
        messageId,
        projectName.slice(0, 100),
      );
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(projectId, threadId);
        const threadMsg = S.THREAD_PROJECT_CREATED(userId, storedTasks.length);
        await discordApi.sendToChannel(deps.botToken, threadId, { content: threadMsg });
      }
    } catch (e) {
      console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
    }
  }

  // Refresh the pinned board (only for text channels, forums have native post list)
  if (!isForumChannel) {
    await refreshBoard(deps, guildId);
  }

  console.log(`[craft] project #${projectId} created with ${storedTasks.length} tasks`);
  return {
    content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
    projectId,
    taskCount: storedTasks.length,
  };
}

/**
 * Create a project from a pasted list of target items (plugin list-import).
 * Each entry is a target that gets broken down + merged into tasks, then the
 * project is announced to Discord like a normal /craft new.
 * NOTE: the announce/post sequence below intentionally mirrors handleCraftNew —
 * keep them in sync. (Not extracted: the posting path has no test coverage.)
 */
export async function handleCraftNewFromList(
  opts: { name: string; items: Array<{ name: string; qty: number }> },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // 1. Resolve names → item IDs
  const { resolved, unmatched } = resolveItemsByName(deps.nameIndex, opts.items);
  if (resolved.length === 0) {
    return { content: S.ITEM_NOT_FOUND(opts.items.map((i) => i.name).join(', ')), flags: 64, unmatched };
  }

  // 2. Determine target channel from guild config or fallback
  let targetChannelId = deps.craftChannelId ?? channelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) targetChannelId = guildConfig.craftChannelId;
  } catch (e) {
    console.warn('[craft] failed to fetch guild config, using fallback', e instanceof Error ? e.message : e);
  }

  // 3. Create the project (empty target — it is a multi-item list project)
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: opts.name,
    targetItemId: 0,
    targetQty: 0,
    createdBy: userId,
  });

  // 4. Record each resolved item + build merged tasks
  for (const r of resolved) {
    await deps.store.addProjectItem(projectId, r.itemId, r.itemName, r.qty);
  }
  const projectItems = await deps.store.getProjectItems(projectId);
  const tasks = buildTasksForProjectItems(projectItems, deps);
  if (tasks.length === 0) {
    return { content: S.NO_RECIPE(resolved[0].itemName), flags: 64, unmatched };
  }
  await deps.store.addTasks(projectId, tasks);

  // 5. Set the initial display phase (for multi-phase CompanyCraft items)
  const initial = initialDisplayPhase(tasks);
  if (initial) {
    await deps.store.setProjectDisplayPhase(projectId, initial.partKey, initial.phaseIndex);
  }

  // 6. Render + announce (mirrors handleCraftNew)
  const project = await deps.store.getProject(projectId);
  if (!project) return { content: 'Failed to create project', flags: 64, unmatched };
  const storedTasks = await deps.store.getTasks(projectId);
  const piSummary = projectItems.map((pi) => ({ itemName: pi.itemName, qty: pi.qty }));
  const { embeds, components } = buildProjectMessage(project, storedTasks, piSummary);

  const roleId = deps.crafterRoleId;
  let content = '';
  if (roleId) content = `<@&${roleId}> `;
  content += S.NEW_PROJECT_CONTENT(projectId);

  const channelInfo = await discordApi.getChannel(deps.botToken, targetChannelId);
  const isForumChannel = channelInfo?.type === 15;

  if (isForumChannel) {
    let forumPost: Record<string, unknown> | null = null;
    try {
      forumPost = await discordApi.createForumPost(deps.botToken, targetChannelId, opts.name.slice(0, 100), {
        content, embeds, components,
        allowed_mentions: roleId ? { roles: [roleId] } : undefined,
      });
    } catch (e) {
      return { content: `No se pudo crear el post en el foro — ${e instanceof Error ? e.message : String(e)}`, flags: 64, projectId, taskCount: storedTasks.length, unmatched };
    }
    if (forumPost) {
      const threadId = String(forumPost.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      try {
        await discordApi.sendToChannel(deps.botToken, threadId, { content: S.THREAD_PROJECT_CREATED(userId, storedTasks.length) });
      } catch (e) {
        console.error('[craft] failed to send forum post message:', e instanceof Error ? e.message : e);
      }
    }
  } else {
    const announcementMsg = await discordApi.sendToChannel(deps.botToken, targetChannelId, {
      content, embeds, components,
      allowed_mentions: roleId ? { roles: [roleId] } : undefined,
    });
    if (!announcementMsg) {
      return { content: S.CHANNEL_NOT_FOUND, flags: 64, projectId, taskCount: storedTasks.length, unmatched };
    }
    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(projectId, messageId);
    try {
      const thread = await discordApi.createThread(deps.botToken, targetChannelId, messageId, opts.name.slice(0, 100));
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(projectId, threadId);
        await discordApi.sendToChannel(deps.botToken, threadId, { content: S.THREAD_PROJECT_CREATED(userId, storedTasks.length) });
      }
    } catch (e) {
      console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
    }
  }

  if (!isForumChannel) {
    await refreshBoard(deps, guildId);
  }

  console.log(`[craft] list project #${projectId} created with ${storedTasks.length} tasks (${unmatched.length} unmatched)`);
  return {
    content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
    projectId,
    taskCount: storedTasks.length,
    unmatched,
  };
}

/** Merge CraftTask[] by (itemId, source) — sum qtyNeeded, keep first meta. */
function mergeTasks(tasks: CraftTask[]): CraftTask[] {
  const map = new Map<string, CraftTask>();
  for (const t of tasks) {
    const key = `${t.itemId}|${t.source}`;
    const existing = map.get(key);
    if (existing) {
      existing.qtyNeeded += t.qtyNeeded;
    } else {
      map.set(key, { ...t });
    }
  }
  return [...map.values()];
}

/** Build the merged task list for a set of project target items: run buildBreakdown
 *  for each and merge by (itemId, source). Shared by add-item and list-import. */
export function buildTasksForProjectItems(
  projectItems: Array<{ itemId: number; qty: number }>,
  deps: CraftCommandDeps,
): CraftTask[] {
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;
  const raw: CraftTask[] = [];
  for (const pi of projectItems) {
    const bd = buildBreakdown(
      pi.itemId,
      pi.qty,
      market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true },
    );
    raw.push(...bd.crafts, ...bd.acquire);
  }
  return mergeTasks(raw);
}

/** Resolve a list of {name, qty} to item IDs via the name index. Names with no
 *  fuzzy match are returned in `unmatched`. */
export function resolveItemsByName(
  nameIndex: NameIndex,
  items: Array<{ name: string; qty: number }>,
): { resolved: Array<{ itemId: number; itemName: string; qty: number }>; unmatched: string[] } {
  const resolved: Array<{ itemId: number; itemName: string; qty: number }> = [];
  const unmatched: string[] = [];
  for (const it of items) {
    const matches = searchItems(nameIndex, it.name, 1);
    if (matches.length === 0) { unmatched.push(it.name); continue; }
    resolved.push({ itemId: matches[0].id, itemName: matches[0].name, qty: it.qty });
  }
  return { resolved, unmatched };
}

/**
 * Handle /craft add-item — add an item to an existing (possibly empty) project
 */
export async function handleCraftAddItem(
  opts: { projectId: number; item: string; qty: number },
  guildId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // 1. Resolve item
  const matches = searchItems(deps.nameIndex, opts.item, 1);
  if (matches.length === 0) {
    return { content: S.ITEM_NOT_FOUND(opts.item), flags: 64 };
  }
  const itemId = matches[0].id;
  const itemName = matches[0].name;

  // 2. Load + validate project
  const project = await deps.store.getProject(opts.projectId);
  if (!project || project.guildId !== guildId) {
    return { content: S.PROJECT_NOT_FOUND(opts.projectId), flags: 64 };
  }
  if (project.status !== 'open') {
    return { content: S.ADD_ITEM_PROJECT_CLOSED, flags: 64 };
  }

  // 3. Record the item
  await deps.store.addProjectItem(opts.projectId, itemId, itemName, opts.qty);

  // 4. Load all project items and rebuild merged task list
  const projectItems = await deps.store.getProjectItems(opts.projectId);
  const mergedTasks = buildTasksForProjectItems(projectItems, deps);
  if (mergedTasks.length === 0) {
    return { content: S.NO_RECIPE(itemName), flags: 64 };
  }

  // 5. Atomically replace tasks
  await deps.store.replaceTasks(opts.projectId, mergedTasks);

  // 6. Fetch fresh project + tasks for rendering
  const updatedProject = await deps.store.getProject(opts.projectId);
  if (!updatedProject) return { content: S.PROJECT_NOT_FOUND(opts.projectId), flags: 64 };
  const storedTasks = await deps.store.getTasks(opts.projectId);
  const piSummary = projectItems.map((pi) => ({ itemName: pi.itemName, qty: pi.qty }));
  const { embeds, components } = buildProjectMessage(updatedProject, storedTasks, piSummary);

  const targetChannelId = updatedProject.channelId;

  // 7. Post or edit announcement
  if (!updatedProject.messageId) {
    // First item added — post fresh announcement
    const roleId = deps.crafterRoleId;
    let content = '';
    if (roleId) content = `<@&${roleId}> `;
    content += S.NEW_PROJECT_CONTENT(opts.projectId);

    const announcementMsg = await discordApi.sendToChannel(deps.botToken, targetChannelId, {
      content,
      embeds,
      components,
      allowed_mentions: roleId ? { roles: [roleId] } : undefined,
    });
    if (!announcementMsg) {
      return { content: S.CHANNEL_NOT_FOUND, flags: 64 };
    }
    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(opts.projectId, messageId);

    try {
      const thread = await discordApi.createThread(deps.botToken, targetChannelId, messageId, updatedProject.name.slice(0, 100));
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(opts.projectId, threadId);
        await discordApi.sendToChannel(deps.botToken, threadId, {
          content: S.THREAD_PROJECT_CREATED(userId, storedTasks.length),
        });
      }
    } catch (e) {
      console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
    }
  } else {
    // Subsequent item — edit existing announcement
    try {
      await discordApi.editMessage(deps.botToken, targetChannelId, updatedProject.messageId, { embeds, components });
    } catch (e) {
      console.error('[craft] failed to edit announcement:', e instanceof Error ? e.message : e);
    }
  }

  // 8. Refresh board
  await refreshBoard(deps, guildId);

  console.log(`[craft] add-item: project #${opts.projectId} now has ${storedTasks.length} tasks`);
  return { content: S.ITEM_ADDED(itemName, storedTasks.length), flags: 64 };
}

/**
 * Handle /craft list — show open projects
 */
export async function handleCraftList(guildId: string, deps: CraftCommandDeps): Promise<CommandResponse> {
  const projects = await deps.store.listOpenProjects(guildId);
  if (projects.length === 0) {
    return { content: S.NO_OPEN_PROJECTS, flags: 64 };
  }

  const lines = await Promise.all(
    projects.map(async (p) => {
      const tasks = await deps.store.getTasks(p.id);
      const done = tasks.filter((t) => t.status === 'done').length;
      return `• **#${p.id}** ${p.name} — ${done}/${tasks.length} ${S.PROJECT_TASKS_SUFFIX}`;
    }),
  );

  const embed = {
    color: 0xd4a958,
    title: S.LIST_TITLE,
    description: lines.join('\n'),
  };

  return { embeds: [embed], flags: 64 };
}

/**
 * Handle /craft claim — claim a task by autocomplete value (the task ID).
 * Escape hatch for projects with more than 25 open tasks where the select menu
 * can't reach every task. Mirrors the side-effects of the select-menu claim
 * path: edit announcement, post thread note, refresh board.
 */
export async function handleCraftClaim(
  projectId: number,
  taskIdRaw: string,
  guildId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  const project = await deps.store.getProject(projectId);
  if (!project || project.guildId !== guildId) {
    return { content: S.PROJECT_NOT_FOUND(projectId), flags: 64 };
  }
  const taskId = Number(taskIdRaw);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return { content: 'Selecciona una tarea del menú de autocompletar.', flags: 64 };
  }

  const claimed = await deps.store.claimTask(taskId, userId);
  if (!claimed) {
    return { content: S.TASK_ALREADY_TAKEN, flags: 64 };
  }

  const tasks = await deps.store.getTasks(projectId);
  const task = tasks.find((t) => t.id === taskId);
  const { embeds, components } = buildProjectMessage(project, tasks);

  if (project.messageId) {
    try {
      await discordApi.editMessage(deps.botToken, project.channelId, project.messageId, { embeds, components });
    } catch {
      // best effort — message may have been deleted
    }
  }
  await refreshBoard(deps, guildId);

  return {
    content: `✅ Reclamaste **${task?.itemName ?? 'la tarea'}**.`,
    flags: 64,
  };
}

/**
 * Handle /craft show — show a specific project
 */
export async function handleCraftShow(projectId: number, guildId: string, deps: CraftCommandDeps): Promise<CommandResponse> {
  const project = await deps.store.getProject(projectId);

  if (!project || project.guildId !== guildId) {
    return { content: S.PROJECT_NOT_FOUND(projectId), flags: 64 };
  }

  const tasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, tasks);
  return { embeds, components };
}

/**
 * Handle /craft close — close a project
 */
export async function handleCraftClose(
  projectId: number,
  guildId: string,
  userId: string,
  permissions: bigint,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  const project = await deps.store.getProject(projectId);

  if (!project || project.guildId !== guildId) {
    return { content: S.PROJECT_NOT_FOUND(projectId), flags: 64 };
  }

  const isCreator = project.createdBy === userId;
  const isAdmin = (permissions & 0x8n) !== 0n; // ADMINISTRATOR = 1 << 3

  if (!isCreator && !isAdmin) {
    return { content: S.CLOSE_ADMIN_ONLY, flags: 64 };
  }

  await deps.store.closeProject(projectId);
  console.log(`[craft] project #${projectId} closed by ${userId}`);

  // Update the announcement message
  if (project.messageId) {
    try {
      const updatedProject = await deps.store.getProject(projectId);
      if (updatedProject) {
        const tasks = await deps.store.getTasks(projectId);
        const { embeds, components } = buildProjectMessage(updatedProject, tasks);
        await discordApi.editMessage(deps.botToken, project.channelId, project.messageId, { embeds, components });
      }
    } catch (e) {
      console.error('[craft] failed to update announcement message:', e instanceof Error ? e.message : e);
    }
  }

  // Refresh the pinned board
  await refreshBoard(deps, guildId);

  return { content: S.PROJECT_CLOSED(projectId), flags: 64 };
}

/**
 * Handle /craft setup — configure the craft channel
 */
export async function handleCraftSetup(
  guildId: string,
  channelId: string,
  permissions: bigint,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // Check permissions
  const isAdmin = (permissions & 0x8n) !== 0n; // ADMINISTRATOR
  if (!isAdmin) {
    return { content: S.SETUP_ADMIN_ONLY, flags: 64 };
  }

  // Use guild config if available, otherwise fall back to env var or current channel
  let targetChannelId = deps.craftChannelId ?? channelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) {
      targetChannelId = guildConfig.craftChannelId;
    }
  } catch (e) {
    console.warn('[craft] failed to fetch guild config, using fallback', e instanceof Error ? e.message : e);
  }

  const existingState = await deps.store.getChannelState(guildId, targetChannelId);

  // 1. Create or refresh the board
  const projects = await deps.store.listOpenProjects(guildId);
  const projectsWithTasks = await Promise.all(
    projects.map(async (p) => ({
      project: p,
      tasks: await deps.store.getTasks(p.id),
    })),
  );
  const { embeds: boardEmbeds } = buildBoardMessage(projectsWithTasks);

  let boardMsgId = existingState?.boardMessageId ?? null;
  try {
    if (boardMsgId) {
      await discordApi.editMessage(deps.botToken, targetChannelId, boardMsgId, { embeds: boardEmbeds });
    } else {
      throw new Error('no existing board');
    }
  } catch {
    const msg = await discordApi.sendToChannel(deps.botToken, targetChannelId, { embeds: boardEmbeds });
    if (msg) {
      boardMsgId = String(msg.id);
    }
  }

  // 2. Create or refresh the request prompt
  const { embeds: reqEmbeds, components: reqComponents } = buildRequestPrompt();

  let reqMsgId = existingState?.requestMessageId ?? null;
  try {
    if (reqMsgId) {
      await discordApi.editMessage(deps.botToken, targetChannelId, reqMsgId, {
        embeds: reqEmbeds,
        components: reqComponents,
      });
    } else {
      throw new Error('no existing prompt');
    }
  } catch {
    const msg = await discordApi.sendToChannel(deps.botToken, targetChannelId, {
      embeds: reqEmbeds,
      components: reqComponents,
    });
    if (msg) {
      reqMsgId = String(msg.id);
    }
  }

  await deps.store.upsertChannelState({
    guildId,
    channelId: targetChannelId,
    boardMessageId: boardMsgId,
    requestMessageId: reqMsgId,
  });

  console.log(`[craft] setup complete in #${targetChannelId}`);
  return { content: S.SETUP_DONE(targetChannelId), flags: 64 };
}

/**
 * Refresh the pinned board in the craft channel (text channels only, not forums)
 */
async function refreshBoard(deps: CraftCommandDeps, guildId: string): Promise<void> {
  // Get channel from guild config or env var
  let channelId = deps.craftChannelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) {
      channelId = guildConfig.craftChannelId;
    }
  } catch (e) {
    console.warn('[craft] failed to fetch guild config in refreshBoard', e instanceof Error ? e.message : e);
  }

  if (!channelId) return;

  // Skip board refresh for forum channels (they have native post list)
  const channelInfo = await discordApi.getChannel(deps.botToken, channelId);
  if (channelInfo?.type === 15) {
    return; // Forum channel, skip board message
  }

  try {
    const projects = await deps.store.listOpenProjects(guildId);
    const projectsWithTasks = await Promise.all(
      projects.map(async (p) => ({
        project: p,
        tasks: await deps.store.getTasks(p.id),
      })),
    );

    const { embeds } = buildBoardMessage(projectsWithTasks);
    const state = await deps.store.getChannelState(guildId, channelId);

    if (state?.boardMessageId) {
      try {
        await discordApi.editMessage(deps.botToken, channelId, state.boardMessageId, { embeds });
        return;
      } catch {
        // Message was deleted — fall through to create a new one
      }
    }

    // Create a new board message
    const msg = await discordApi.sendToChannel(deps.botToken, channelId, { embeds });
    if (msg) {
      const msgId = String(msg.id);
      await deps.store.upsertChannelState({
        guildId,
        channelId,
        boardMessageId: msgId,
        requestMessageId: state?.requestMessageId ?? null,
      });
    }
  } catch (e) {
    console.error('[craft] failed to refresh board:', e instanceof Error ? e.message : e);
  }
}

/**
 * Post (or refresh) the setup messages in a craft channel after configuration.
 * Forum channels get a dedicated forum post with the request button.
 * Text channels get a board message + a standing request-prompt message.
 */
export async function postChannelSetup(
  guildId: string,
  channelId: string,
  botToken: string,
  store: CraftStore,
): Promise<{ portedProjects: number }> {
  const channelInfo = await discordApi.getChannel(botToken, channelId);
  const isForumChannel = channelInfo?.type === 15;
  const { embeds: reqEmbeds, components: reqComponents } = buildRequestPrompt();
  const existingState = await store.getChannelState(guildId, channelId);
  let portedProjects = 0;

  if (isForumChannel) {
    // For forum channels: create a pinned forum post with the request button.
    // createForumPost throws on failure with the Discord error detail.
    const forumPost = await discordApi.createForumPost(
      botToken,
      channelId,
      '🛠 Solicitar un crafteo',
      { embeds: reqEmbeds, components: reqComponents },
    );
    await store.upsertChannelState({
      guildId,
      channelId,
      boardMessageId: existingState?.boardMessageId ?? null,
      requestMessageId: String(forumPost!.id),
    });

    // Port any open projects that aren't already in this forum into forum posts.
    const openProjects = await store.listOpenProjects(guildId);
    for (const p of openProjects) {
      if (p.channelId === channelId) continue; // already lives in this forum
      try {
        const tasks = await store.getTasks(p.id);
        const projectItems = await store.getProjectItems(p.id);
        const piSummary = projectItems.length
          ? projectItems.map((pi) => ({ itemName: pi.itemName, qty: pi.qty }))
          : undefined;
        const { embeds, components } = buildProjectMessage(p, tasks, piSummary);
        const post = await discordApi.createForumPost(
          botToken,
          channelId,
          p.name.slice(0, 100),
          { embeds, components },
        );
        if (post) {
          // Forum post = thread; no separate board message, so clear messageId.
          await store.setProjectChannel(p.id, channelId, null, String(post.id));
          portedProjects++;
        }
      } catch (e) {
        console.error(`[setup] failed to port project #${p.id} to forum:`, e instanceof Error ? e.message : e);
      }
    }
  } else {
    // Text channel: post/refresh board + request prompt
    const projects = await store.listOpenProjects(guildId);
    const projectsWithTasks = await Promise.all(
      projects.map(async (p) => ({ project: p, tasks: await store.getTasks(p.id) })),
    );
    const { embeds: boardEmbeds } = buildBoardMessage(projectsWithTasks);

    let boardMsgId = existingState?.boardMessageId ?? null;
    try {
      if (boardMsgId) {
        await discordApi.editMessage(botToken, channelId, boardMsgId, { embeds: boardEmbeds });
      } else {
        throw new Error('no board');
      }
    } catch {
      const msg = await discordApi.sendToChannel(botToken, channelId, { embeds: boardEmbeds });
      if (msg) boardMsgId = String(msg.id);
      else throw new Error(`No se pudo publicar en <#${channelId}> — ¿tiene el bot permisos de escritura en ese canal?`);
    }

    let reqMsgId = existingState?.requestMessageId ?? null;
    try {
      if (reqMsgId) {
        await discordApi.editMessage(botToken, channelId, reqMsgId, { embeds: reqEmbeds, components: reqComponents });
      } else {
        throw new Error('no req');
      }
    } catch {
      const msg = await discordApi.sendToChannel(botToken, channelId, { embeds: reqEmbeds, components: reqComponents });
      if (msg) reqMsgId = String(msg.id);
      else throw new Error(`No se pudo publicar en <#${channelId}> — ¿tiene el bot permisos de escritura en ese canal?`);
    }

    await store.upsertChannelState({ guildId, channelId, boardMessageId: boardMsgId, requestMessageId: reqMsgId });
  }

  return { portedProjects };
}

/**
 * Handle /setup view — show current guild config
 */
export async function handleSetupView(
  guildId: string,
  permissions: bigint,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // Check permissions
  const isAdmin = (permissions & 0x8n) !== 0n;
  if (!isAdmin) {
    return { content: 'Solo administradores pueden ejecutar /setup', flags: 64 };
  }

  const config = await deps.store.getGuildConfig(guildId);

  if (!config) {
    return {
      content: 'No hay configuración aún. Usa `/setup modal` para configurar.',
      flags: 64,
    };
  }

  const embeds = [
    {
      title: '⚙️ Configuración del Bot',
      color: 3447003,
      fields: [
        {
          name: 'Canal de Crafteo',
          value: `<#${config.craftChannelId}>`,
          inline: true,
        },
        {
          name: 'Idioma',
          value: config.language === 'es' ? '🇪🇸 Español' : '🇬🇧 English',
          inline: true,
        },
      ],
    },
  ];

  return { embeds };
}

/**
 * Handle /setup modal submission — save guild config to database
 */
export async function handleSetupSubmit(
  guildId: string,
  formData: Record<string, string>,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  const craftChannelId = formData.craft_channel_id?.trim();

  if (!craftChannelId) {
    return { content: 'El ID del canal es requerido', flags: 64 };
  }

  // Validate it's a number
  if (!/^\d+$/.test(craftChannelId)) {
    return { content: 'El ID del canal debe ser un número válido', flags: 64 };
  }

  // Store config
  await deps.store.setGuildConfig({
    guildId,
    craftChannelId,
    language: 'es',
  });

  console.log(`[setup] configured guild ${guildId} with craft channel ${craftChannelId}`);

  return {
    content: `✅ Canal configurado: <#${craftChannelId}>`,
    flags: 64,
  };
}
