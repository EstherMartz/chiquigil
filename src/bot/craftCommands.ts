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
}

/**
 * Handle /craft new — create a new craft project.
 * When `item` is omitted, creates an empty multi-item project (no announcement yet).
 */
export async function handleCraftNew(
  opts: { item?: string | null; qty?: number | null; name?: string | null; intermediates?: boolean; pingRole?: string | null },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // ── Empty project (no item provided) ──────────────────────────────────────
  if (!opts.item) {
    if (!opts.name) {
      return { content: 'Nyeh~! Se requiere un nombre cuando no se especifica objeto, kukuru.', flags: 64 };
    }
    const targetChannelId = deps.craftChannelId ?? channelId;
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

  // Resolve item name
  const matches = searchItems(deps.nameIndex, opts.item, 1);
  if (matches.length === 0) {
    return { content: S.ITEM_NOT_FOUND(opts.item), flags: 64 };
  }

  const itemId = matches[0].id;
  const itemName = matches[0].name;
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

  // Determine target channel for the announcement
  const targetChannelId = deps.craftChannelId ?? channelId;

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

  // Send announcement message
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
    const thread = await discordApi.createThread(deps.botToken, targetChannelId, messageId, projectName.slice(0, 100));
    if (thread) {
      const threadId = String(thread.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      const threadMsg = S.THREAD_PROJECT_CREATED(userId, storedTasks.length);
      await discordApi.sendToChannel(deps.botToken, threadId, { content: threadMsg });
    }
  } catch (e) {
    console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
  }

  // Refresh the pinned board
  await refreshBoard(deps, guildId);

  console.log(`[craft] project #${projectId} created with ${storedTasks.length} tasks`);
  return {
    content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
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
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;

  const allRawTasks: CraftTask[] = [];
  for (const pi of projectItems) {
    const bd = buildBreakdown(
      pi.itemId,
      pi.qty,
      market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true },
    );
    allRawTasks.push(...bd.crafts, ...bd.acquire);
  }

  const mergedTasks = mergeTasks(allRawTasks);
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
  if (task && project.threadId) {
    try {
      await discordApi.sendToChannel(deps.botToken, project.threadId, {
        content: S.THREAD_CLAIMED(userId, task.qtyNeeded, task.itemName),
      });
    } catch {
      // thread may be archived
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

  const targetChannelId = deps.craftChannelId ?? channelId;
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
 * Refresh the pinned board in the craft channel
 */
async function refreshBoard(deps: CraftCommandDeps, guildId: string): Promise<void> {
  const channelId = deps.craftChannelId;
  if (!channelId) return;

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
