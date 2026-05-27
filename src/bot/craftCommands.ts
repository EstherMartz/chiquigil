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
 * Handle /craft new — create a new craft project
 */
export async function handleCraftNew(
  opts: { item: string; qty: number; name?: string | null; intermediates?: boolean; pingRole?: string | null },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // Resolve item name
  const matches = searchItems(deps.nameIndex, opts.item, 1);
  if (matches.length === 0) {
    return { content: S.ITEM_NOT_FOUND(opts.item), flags: 64 };
  }

  const itemId = matches[0].id;
  const itemName = matches[0].name;
  const projectName = opts.name ?? `${opts.qty}× ${itemName}`;
  const craftIntermediates = opts.intermediates ?? true;

  console.log(`[craft] new project: ${projectName} (item ${itemId}, qty ${opts.qty})`);

  // Run breakdown
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;

  const preExplode = explode(itemId, opts.qty, recipes, { craftIntermediates });
  const allLeafIds = [...preExplode.leaves.keys()];

  console.log(`[craft] using pre-fetched market for ${allLeafIds.length} leaf items…`);
  const market = deps.marketBundle;

  const breakdown = buildBreakdown(
    itemId,
    opts.qty,
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

  // Persist
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: opts.qty,
    createdBy: userId,
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
  content += S.NEW_PROJECT_CONTENT;

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
