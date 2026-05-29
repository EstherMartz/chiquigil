import type { NameIndex } from './nameIndex';
import { searchItems, fuzzySearchItems } from './nameIndex';
import type { CraftStore } from './craftStore';
import type { BotSnapshots } from './loadSnapshots';
import type { MarketBundle } from '../features/watchlist/useMarketData';
import { buildBreakdown } from './craftSourcing';
import { buildProjectMessage, buildBoardMessage, collectPhases, findNextIncompletePhase } from './craftRender';
import { explode } from './craftExplode';
import * as discordApi from './discordApi';
import * as S from './craftStrings';
import type { CraftProject, CraftTask, StoredTask } from './craftTypes';

function initialDisplayPhase(tasks: CraftTask[]): { partKey: string; phaseIndex: number } | null {
  for (const t of tasks) {
    if (t.meta?.partKey != null && t.meta?.phaseIndex != null) {
      return { partKey: t.meta.partKey, phaseIndex: t.meta.phaseIndex };
    }
  }
  return null;
}

/**
 * If the project's currently-displayed phase is fully done, persist a switch to
 * the next incomplete phase and return the updated project snapshot. No-op for
 * non-phase projects and for phases that still have outstanding tasks.
 */
async function maybeAdvancePhase(
  project: CraftProject,
  tasks: StoredTask[],
  store: CraftInteractionDeps['store'],
): Promise<CraftProject> {
  if (project.displayPartKey == null || project.displayPhaseIndex == null) return project;
  const phases = collectPhases(tasks);
  const current = phases.find(
    (p) => p.partKey === project.displayPartKey && p.phaseIndex === project.displayPhaseIndex,
  );
  if (!current || current.done < current.total) return project;
  const next = findNextIncompletePhase(phases, project.displayPartKey, project.displayPhaseIndex);
  if (!next) return project;
  await store.setProjectDisplayPhase(project.id, next.partKey, next.phaseIndex);
  return { ...project, displayPartKey: next.partKey, displayPhaseIndex: next.phaseIndex };
}

export interface CraftInteractionDeps {
  store: CraftStore;
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  botToken: string;
  world: string;
  dc: string;
  region: string;
  craftChannelId?: string;
  crafterRoleId?: string;
  fetchMarket: (ids: number[], cfg: { world: string; dc: string; region: string }) => Promise<MarketBundle>;
}

export interface InteractionResponse {
  type?: number; // 4 for CHANNEL_MESSAGE_WITH_SOURCE, 5 for DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, 6 for DEFERRED_UPDATE_MESSAGE, 7 for UPDATE_MESSAGE, 9 for MODAL
  data?: {
    content?: string;
    embeds?: unknown[];
    components?: unknown[];
    flags?: number;
    custom_id?: string;
    title?: string;
  };
}

function parseCustomId(customId: string): { projectId: number; action: string; taskId?: number } | null {
  const parts = customId.split(':');
  if (parts.length < 3 || parts[0] !== 'cproj') return null;
  const projectId = parseInt(parts[1], 10);
  const action = parts[2];
  const taskId = parts[3] ? parseInt(parts[3], 10) : undefined;
  if (isNaN(projectId)) return null;
  return { projectId, action, taskId };
}

async function refreshBoard(deps: CraftInteractionDeps, guildId: string): Promise<void> {
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

/**
 * Handle button interactions for craft projects.
 * customIds: cproj:{projectId}:progress, cproj:{projectId}:done, cproj:{projectId}:unclaim, cproj:{projectId}:refresh
 */
export async function handleCraftButton(
  customId: string,
  userId: string,
  guildId: string,
  messageId: string,
  channelId: string,
  deps: CraftInteractionDeps,
): Promise<InteractionResponse> {
  const parsed = parseCustomId(customId);
  if (!parsed) return { type: 4, data: { content: 'Invalid button', flags: 64 } };

  switch (parsed.action) {
    case 'progress': {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === userId && t.status === 'claimed');

      if (myTasks.length === 0) {
        return { type: 4, data: { content: S.NO_CLAIMED_TASKS, flags: 64 } };
      }

      const task = myTasks[0];
      return {
        type: 9, // MODAL
        data: {
          custom_id: `cproj:${parsed.projectId}:progressmodal:${task.id}`,
          title: `Progreso: ${task.itemName}`.slice(0, 45),
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: 'amount',
                  label: S.MODAL_PROGRESS_DONE_LABEL(task.qtyDone, task.qtyNeeded),
                  style: 1,
                  placeholder: String(task.qtyNeeded - task.qtyDone),
                  required: true,
                },
              ],
            },
          ],
        },
      };
    }

    case 'done': {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === userId && t.status === 'claimed');

      if (myTasks.length === 0) {
        return { type: 4, data: { content: S.NO_PENDING_TASKS, flags: 64 } };
      }

      for (const t of myTasks) {
        await deps.store.logProgress(t.id, userId, t.qtyNeeded);
      }

      const project = await deps.store.getProject(parsed.projectId);
      if (project) {
        const updatedTasks = await deps.store.getTasks(parsed.projectId);
        // Auto-advance to the next incomplete phase if the current one's now done.
        const advanced = await maybeAdvancePhase(project, updatedTasks, deps.store);
        const { embeds, components } = buildProjectMessage(advanced, updatedTasks);
        try {
          await discordApi.editMessage(deps.botToken, channelId, messageId, { embeds, components });
        } catch {
          // best effort
        }

        // Send thread note
        const msg = S.THREAD_DONE(userId, myTasks.length);
        if (project.threadId) {
          try {
            await discordApi.sendToChannel(deps.botToken, project.threadId, { content: msg });
          } catch {
            // thread may be archived/deleted
          }
        }

        // Refresh board
        await refreshBoard(deps, guildId);
      }

      return { type: 6 }; // DEFERRED_UPDATE_MESSAGE
    }

    case 'unclaim': {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === userId && t.status !== 'done');
      let count = 0;
      for (const t of myTasks) {
        if (await deps.store.unclaimTask(t.id, userId)) count++;
      }

      if (count === 0) {
        return { type: 4, data: { content: S.NO_TASKS_TO_UNCLAIM, flags: 64 } };
      }

      const project = await deps.store.getProject(parsed.projectId);
      if (project) {
        const updatedTasks = await deps.store.getTasks(parsed.projectId);
        const { embeds, components } = buildProjectMessage(project, updatedTasks);
        try {
          await discordApi.editMessage(deps.botToken, channelId, messageId, { embeds, components });
        } catch {
          // best effort
        }

        // Refresh board
        await refreshBoard(deps, guildId);
      }

      return { type: 6 }; // DEFERRED_UPDATE_MESSAGE
    }

    case 'refresh': {
      const project = await deps.store.getProject(parsed.projectId);
      if (project) {
        const tasks = await deps.store.getTasks(parsed.projectId);
        const { embeds, components } = buildProjectMessage(project, tasks);
        try {
          await discordApi.editMessage(deps.botToken, channelId, messageId, { embeds, components });
        } catch {
          // best effort
        }
      }

      return { type: 6 }; // DEFERRED_UPDATE_MESSAGE
    }

    default:
      return { type: 4, data: { content: 'Unknown action', flags: 64 } };
  }
}

/**
 * Handle select menu interactions for craft projects.
 * customIds: cproj:{projectId}:claim or cproj:requestpick:{qty}:{encodedLabel}
 */
export async function handleCraftSelect(
  customId: string,
  values: string[],
  userId: string,
  guildId: string,
  messageId: string,
  channelId: string,
  deps: CraftInteractionDeps,
): Promise<InteractionResponse> {
  if (customId.startsWith('cproj:requestpick:')) {
    return handleRequestPick(customId, values, userId, guildId, channelId, deps);
  }

  const parsed = parseCustomId(customId);
  if (!parsed) {
    return { type: 4, data: { content: 'Invalid select', flags: 64 } };
  }

  // Phase navigation — updates the project's display state and re-renders.
  if (parsed.action === 'phase') {
    const raw = values[0] ?? '';
    const hashIdx = raw.lastIndexOf('#');
    if (hashIdx <= 0) {
      return { type: 4, data: { content: 'Invalid phase selection', flags: 64 } };
    }
    const partKey = raw.slice(0, hashIdx);
    const phaseIndex = parseInt(raw.slice(hashIdx + 1), 10);
    if (!partKey || isNaN(phaseIndex)) {
      return { type: 4, data: { content: 'Invalid phase selection', flags: 64 } };
    }
    await deps.store.setProjectDisplayPhase(parsed.projectId, partKey, phaseIndex);
    const project = await deps.store.getProject(parsed.projectId);
    if (project) {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const { embeds, components } = buildProjectMessage(project, tasks);
      try {
        await discordApi.editMessage(deps.botToken, channelId, messageId, { embeds, components });
      } catch {
        // best effort
      }
    }
    return { type: 6 }; // DEFERRED_UPDATE_MESSAGE
  }

  if (parsed.action !== 'claim') {
    return { type: 4, data: { content: 'Invalid select', flags: 64 } };
  }

  const taskId = parseInt(values[0], 10);
  if (isNaN(taskId)) return { type: 4, data: { content: 'Invalid task', flags: 64 } };

  const claimed = await deps.store.claimTask(taskId, userId);
  if (!claimed) {
    return { type: 4, data: { content: S.TASK_ALREADY_TAKEN, flags: 64 } };
  }

  const project = await deps.store.getProject(parsed.projectId);
  if (project) {
    const tasks = await deps.store.getTasks(parsed.projectId);
    const { embeds, components } = buildProjectMessage(project, tasks);
    try {
      await discordApi.editMessage(deps.botToken, channelId, messageId, { embeds, components });
    } catch {
      // best effort
    }

    // Refresh board
    await refreshBoard(deps, guildId);
  }

  return { type: 6 }; // DEFERRED_UPDATE_MESSAGE
}

/**
 * Handle the "Request a craft" button — opens a modal.
 */
export function handleCraftRequestButton(): InteractionResponse {
  return {
    type: 9, // MODAL
    data: {
      custom_id: 'cproj:requestmodal',
      title: S.MODAL_REQUEST_TITLE,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'item',
              label: S.MODAL_ITEM_LABEL,
              style: 1,
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'qty',
              label: S.MODAL_QTY_LABEL,
              style: 1,
              placeholder: '1',
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'name',
              label: S.MODAL_NAME_LABEL,
              style: 1,
              required: false,
            },
          ],
        },
      ],
    },
  };
}

/**
 * Handle the "Request a craft" modal submission — creates a new project.
 */
export async function handleCraftRequestModal(
  fields: Record<string, string>,
  userId: string,
  guildId: string,
  channelId: string,
  deps: CraftInteractionDeps,
): Promise<InteractionResponse> {
  const itemQuery = fields['item'];
  const qtyStr = fields['qty'];
  const label = fields['name'] || null;
  const qty = parseInt(qtyStr, 10);

  if (isNaN(qty) || qty <= 0) {
    return { type: 4, data: { content: S.INVALID_QTY, flags: 64 } };
  }

  // Try exact/substring first, then fuzzy
  let matches = searchItems(deps.nameIndex, itemQuery, 1);
  if (matches.length === 0) {
    const fuzzy = fuzzySearchItems(deps.nameIndex, itemQuery, 10);
    if (fuzzy.length === 0) {
      return { type: 4, data: { content: S.NO_CLOSE_MATCHES(itemQuery), flags: 64 } };
    }
    // Show a "did you mean?" select menu
    const select = {
      type: 3,
      custom_id: `cproj:requestpick:${qty}:${encodeURIComponent(label ?? '')}`,
      placeholder: S.SELECT_PLACEHOLDER,
      options: fuzzy.map((r) => ({
        label: r.name.slice(0, 100),
        value: String(r.id),
      })),
    };
    return {
      type: 4,
      data: {
        content: S.DID_YOU_MEAN(itemQuery),
        components: [{ type: 1, components: [select] }],
        flags: 64,
      },
    };
  }

  return createCraftProjectFromModal(itemQuery, matches[0].id, qty, label, userId, guildId, channelId, deps);
}

async function createCraftProjectFromModal(
  _itemQuery: string,
  itemId: number,
  qty: number,
  label: string | null,
  userId: string,
  guildId: string,
  channelId: string,
  deps: CraftInteractionDeps,
): Promise<InteractionResponse> {
  const itemName = deps.snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const projectName = label ?? `${qty}× ${itemName}`;

  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates: true });
  const allLeafIds = [...preExplode.leaves.keys()];

  const market = await deps.fetchMarket(allLeafIds, { world: deps.world, dc: deps.dc, region: deps.region });
  const breakdown = buildBreakdown(
    itemId,
    qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
    { craftIntermediates: true },
  );

  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { type: 4, data: { content: S.NO_RECIPE(itemName), flags: 64 } };
  }

  const targetChannelId = deps.craftChannelId ?? channelId;

  const initial = initialDisplayPhase(allTasks);

  // Create project
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
    return { type: 4, data: { content: 'Failed to create project', flags: 64 } };
  }

  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);

  // Build content with role ping
  const roleId = deps.crafterRoleId;
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
    return { type: 4, data: { content: S.CHANNEL_NOT_FOUND, flags: 64 } };
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

  // Refresh board
  await refreshBoard(deps, guildId);

  return {
    type: 4,
    data: {
      content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
      flags: 64,
    },
  };
}

/**
 * Handle "did you mean?" select from the request modal fuzzy search.
 */
async function handleRequestPick(
  customId: string,
  values: string[],
  userId: string,
  guildId: string,
  channelId: string,
  deps: CraftInteractionDeps,
): Promise<InteractionResponse> {
  // customId = cproj:requestpick:<qty>:<encodedLabel>
  const parts = customId.split(':');
  const qty = parseInt(parts[2], 10);
  const label = decodeURIComponent(parts[3] ?? '') || null;

  if (isNaN(qty) || qty <= 0) {
    return { type: 4, data: { content: S.INVALID_QTY, flags: 64 } };
  }

  const itemId = parseInt(values[0], 10);
  if (isNaN(itemId)) {
    return { type: 4, data: { content: 'Invalid item', flags: 64 } };
  }

  const itemName = deps.snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const projectName = label ?? `${qty}× ${itemName}`;

  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates: true });
  const allLeafIds = [...preExplode.leaves.keys()];

  const market = await deps.fetchMarket(allLeafIds, { world: deps.world, dc: deps.dc, region: deps.region });
  const breakdown = buildBreakdown(
    itemId,
    qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
    { craftIntermediates: true },
  );

  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { type: 7, data: { content: S.NO_RECIPE(itemName), components: [] } };
  }

  const targetChannelId = deps.craftChannelId ?? channelId;

  const initial = initialDisplayPhase(allTasks);

  // Create project
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
    return { type: 7, data: { content: 'Failed to create project', components: [] } };
  }

  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);

  // Build content with role ping
  const roleId = deps.crafterRoleId;
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
    return { type: 7, data: { content: S.CHANNEL_NOT_FOUND, components: [] } };
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

  // Refresh board
  await refreshBoard(deps, guildId);

  return {
    type: 7,
    data: {
      content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
      components: [],
    },
  };
}

/**
 * Handle progress modal submission.
 * customId: cproj:{projectId}:progressmodal:{taskId}
 */
export async function handleCraftProgressModal(
  customId: string,
  fields: Record<string, string>,
  userId: string,
  guildId: string,
  _messageId: string,
  _channelId: string,
  deps: CraftInteractionDeps,
): Promise<InteractionResponse> {
  const parsed = parseCustomId(customId);
  if (!parsed || parsed.action !== 'progressmodal' || !parsed.taskId) {
    return { type: 4, data: { content: 'Invalid modal', flags: 64 } };
  }

  const amountStr = fields['amount'];
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    return { type: 4, data: { content: S.INVALID_AMOUNT, flags: 64 } };
  }

  const result = await deps.store.logProgress(parsed.taskId, userId, amount);
  if (!result) {
    return { type: 4, data: { content: S.PROGRESS_FAILED, flags: 64 } };
  }

  const project = await deps.store.getProject(parsed.projectId);
  if (!project) {
    return { type: 4, data: { content: 'Project not found', flags: 64 } };
  }

  // Send thread note
  if (project.threadId) {
    const msg = S.THREAD_PROGRESS(userId, result.itemName, result.qtyDone, result.qtyNeeded, result.status === 'done');
    try {
      await discordApi.sendToChannel(deps.botToken, project.threadId, { content: msg });
    } catch {
      // thread may be archived/deleted
    }
  }

  // Refresh the announcement embed (with auto-advance if the current phase
  // just finished).
  if (project.messageId) {
    try {
      const tasks = await deps.store.getTasks(parsed.projectId);
      const advanced = await maybeAdvancePhase(project, tasks, deps.store);
      const { embeds, components } = buildProjectMessage(advanced, tasks);
      await discordApi.editMessage(deps.botToken, project.channelId, project.messageId, { embeds, components });
    } catch {
      // best effort
    }
  }

  // Refresh board
  await refreshBoard(deps, guildId);

  return { type: 6 }; // DEFERRED_UPDATE_MESSAGE
}
