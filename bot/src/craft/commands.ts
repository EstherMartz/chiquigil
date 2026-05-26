import {
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type TextChannel,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { searchItems, type NameIndex } from '../chat/nameIndex';
import type { CraftStore } from './store';
import type { BotSnapshots } from '../loadSnapshots';
import type { MarketBundle } from '../../../src/features/watchlist/useMarketData';
import { buildBreakdown } from './sourcing';
import { buildProjectMessage, buildBoardMessage, buildRequestPrompt } from './render';
import * as S from './strings';

export interface CraftCommandDeps {
  store: CraftStore;
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  cfg: { world: string; dc: string; region: string };
  craftChannelId: string | undefined;
  crafterRoleId: string | undefined;
  fetchMarket: (ids: number[], cfg: { world: string; dc: string; region: string }) => Promise<MarketBundle>;
}

export async function handleCraftAutocomplete(
  interaction: AutocompleteInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'item') return;

  const results = searchItems(deps.nameIndex, focused.value, 25);
  await interaction.respond(
    results.map((r) => ({ name: r.name.slice(0, 100), value: r.name })),
  );
}

export async function handleCraftCommand(
  interaction: ChatInputCommandInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'new': return handleNew(interaction, deps);
    case 'list': return handleList(interaction, deps);
    case 'show': return handleShow(interaction, deps);
    case 'close': return handleClose(interaction, deps);
    case 'setup': return handleSetup(interaction, deps);
  }
}

/** Refresh the pinned board in the craft channel (or the project's channel). */
export async function refreshBoard(
  deps: CraftCommandDeps,
  guildId: string,
  client: any,
): Promise<void> {
  const channelId = deps.craftChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (!channel) return;

    const projects = deps.store.listOpenProjects(guildId);
    const projectsWithTasks = projects.map((p) => ({
      project: p,
      tasks: deps.store.getTasks(p.id),
    }));

    const { embeds } = buildBoardMessage(projectsWithTasks);
    const state = deps.store.getChannelState(guildId, channelId);

    if (state?.boardMessageId) {
      try {
        const msg = await channel.messages.fetch(state.boardMessageId);
        await msg.edit({ embeds });
        return;
      } catch {
        // Message was deleted — fall through to create a new one
      }
    }

    // Create + pin a new board message
    const msg = await channel.send({ embeds });
    await msg.pin().catch(() => {});
    deps.store.upsertChannelState({
      guildId,
      channelId,
      boardMessageId: msg.id,
      requestMessageId: state?.requestMessageId ?? null,
    });
  } catch (e) {
    console.error('[craft] failed to refresh board:', e instanceof Error ? e.message : e);
  }
}

async function handleNew(
  interaction: ChatInputCommandInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const itemQuery = interaction.options.getString('item', true);
  const qty = interaction.options.getInteger('qty', true);
  const label = interaction.options.getString('name');
  const craftIntermediates = interaction.options.getBoolean('intermediates') ?? true;
  const pingRole = interaction.options.getRole('ping_role');

  await interaction.deferReply({ ephemeral: true });

  // Resolve item name
  const matches = searchItems(deps.nameIndex, itemQuery, 1);
  if (matches.length === 0) {
    await interaction.editReply(S.ITEM_NOT_FOUND(itemQuery));
    return;
  }

  const itemId = matches[0].id;
  const itemName = matches[0].name;
  const projectName = label ?? `${qty}× ${itemName}`;

  console.log(`[craft] new project: ${projectName} (item ${itemId}, qty ${qty})`);

  // Run breakdown
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;

  const preExplode = (await import('./explode')).explode(itemId, qty, recipes, { craftIntermediates });
  const allLeafIds = [...preExplode.leaves.keys()];

  console.log(`[craft] fetching market for ${allLeafIds.length} leaf items…`);
  const market = await deps.fetchMarket(allLeafIds, deps.cfg);

  const breakdown = buildBreakdown(
    itemId, qty, market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
    { craftIntermediates },
  );

  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    await interaction.editReply(S.NO_RECIPE(itemName));
    return;
  }

  // Determine target channel for the announcement
  const targetChannelId = deps.craftChannelId ?? interaction.channelId;
  const targetChannel = await interaction.client.channels.fetch(targetChannelId) as TextChannel;
  if (!targetChannel) {
    await interaction.editReply(S.CHANNEL_NOT_FOUND);
    return;
  }

  // Persist
  const projectId = deps.store.createProject({
    guildId: interaction.guildId!,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: qty,
    createdBy: interaction.user.id,
  });
  deps.store.addTasks(projectId, allTasks);

  const project = deps.store.getProject(projectId)!;
  const storedTasks = deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);

  // Build content with role ping
  const roleId = pingRole?.id ?? deps.crafterRoleId;
  let content = '';
  if (roleId) content = `<@&${roleId}> `;
  content += S.NEW_PROJECT_CONTENT;

  const announcementMsg = await targetChannel.send({
    content,
    embeds,
    components,
    allowedMentions: roleId ? { roles: [roleId] } : undefined,
  });
  deps.store.setProjectMessageId(projectId, announcementMsg.id);

  // Start a thread on the announcement
  try {
    const thread = await announcementMsg.startThread({
      name: projectName.slice(0, 100),
      autoArchiveDuration: 1440,
    });
    deps.store.setProjectThreadId(projectId, thread.id);
    await thread.send(S.THREAD_PROJECT_CREATED(interaction.user.id, storedTasks.length));
  } catch (e) {
    console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
  }

  // Refresh the pinned board
  await refreshBoard(deps, interaction.guildId!, interaction.client);

  await interaction.editReply(S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length));
  console.log(`[craft] project #${projectId} created with ${storedTasks.length} tasks`);
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const projects = deps.store.listOpenProjects(interaction.guildId!);
  if (projects.length === 0) {
    await interaction.reply({ content: S.NO_OPEN_PROJECTS, ephemeral: true });
    return;
  }

  const lines = projects.map((p) => {
    const tasks = deps.store.getTasks(p.id);
    const done = tasks.filter((t) => t.status === 'done').length;
    return `• **#${p.id}** ${p.name} — ${done}/${tasks.length} ${S.PROJECT_TASKS_SUFFIX}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xD4A958)
    .setTitle(S.LIST_TITLE)
    .setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleShow(
  interaction: ChatInputCommandInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const projectId = interaction.options.getInteger('id', true);
  const project = deps.store.getProject(projectId);

  if (!project || project.guildId !== interaction.guildId) {
    await interaction.reply({ content: S.PROJECT_NOT_FOUND(projectId), ephemeral: true });
    return;
  }

  const tasks = deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, tasks);
  await interaction.reply({ embeds, components });
}

async function handleClose(
  interaction: ChatInputCommandInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const projectId = interaction.options.getInteger('id', true);
  const project = deps.store.getProject(projectId);

  if (!project || project.guildId !== interaction.guildId) {
    await interaction.reply({ content: S.PROJECT_NOT_FOUND(projectId), ephemeral: true });
    return;
  }

  const isCreator = project.createdBy === interaction.user.id;
  const member = interaction.member;
  const perms = member && 'permissions' in member ? member.permissions : null;
  const isAdmin = perms && typeof perms !== 'string' && perms.has(PermissionFlagsBits.ManageMessages);

  if (!isCreator && !isAdmin) {
    await interaction.reply({ content: S.CLOSE_ADMIN_ONLY, ephemeral: true });
    return;
  }

  deps.store.closeProject(projectId);
  console.log(`[craft] project #${projectId} closed by ${interaction.user.tag}`);

  // Update the announcement message
  if (project.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(project.channelId) as TextChannel;
      if (channel) {
        const msg = await channel.messages.fetch(project.messageId);
        const updatedProject = deps.store.getProject(projectId)!;
        const tasks = deps.store.getTasks(projectId);
        const { embeds, components } = buildProjectMessage(updatedProject, tasks);
        await msg.edit({ embeds, components });
      }
    } catch { /* message may have been deleted */ }
  }

  // Refresh the pinned board
  await refreshBoard(deps, interaction.guildId!, interaction.client);

  await interaction.reply({ content: S.PROJECT_CLOSED(projectId), ephemeral: true });
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
  deps: CraftCommandDeps,
): Promise<void> {
  const member = interaction.member;
  const perms = member && 'permissions' in member ? member.permissions : null;
  if (!perms || typeof perms === 'string' || !perms.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: S.SETUP_ADMIN_ONLY, ephemeral: true });
    return;
  }

  const channelId = deps.craftChannelId ?? interaction.channelId;
  const channel = await interaction.client.channels.fetch(channelId) as TextChannel;
  if (!channel) {
    await interaction.reply({ content: S.CHANNEL_NOT_FOUND, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const existingState = deps.store.getChannelState(guildId, channelId);

  // 1. Create or refresh the board
  const projects = deps.store.listOpenProjects(guildId);
  const projectsWithTasks = projects.map((p) => ({
    project: p,
    tasks: deps.store.getTasks(p.id),
  }));
  const { embeds: boardEmbeds } = buildBoardMessage(projectsWithTasks);

  let boardMsgId = existingState?.boardMessageId ?? null;
  try {
    if (boardMsgId) {
      const msg = await channel.messages.fetch(boardMsgId);
      await msg.edit({ embeds: boardEmbeds });
    } else {
      throw new Error('no existing board');
    }
  } catch {
    const msg = await channel.send({ embeds: boardEmbeds });
    await msg.pin().catch(() => {});
    boardMsgId = msg.id;
  }

  // 2. Create or refresh the request prompt
  const { embeds: reqEmbeds, components: reqComponents } = buildRequestPrompt();

  let reqMsgId = existingState?.requestMessageId ?? null;
  try {
    if (reqMsgId) {
      const msg = await channel.messages.fetch(reqMsgId);
      await msg.edit({ embeds: reqEmbeds, components: reqComponents });
    } else {
      throw new Error('no existing prompt');
    }
  } catch {
    const msg = await channel.send({ embeds: reqEmbeds, components: reqComponents });
    await msg.pin().catch(() => {});
    reqMsgId = msg.id;
  }

  deps.store.upsertChannelState({
    guildId,
    channelId,
    boardMessageId: boardMsgId,
    requestMessageId: reqMsgId,
  });

  await interaction.editReply(S.SETUP_DONE(channelId));
  console.log(`[craft] setup complete in #${channelId}`);
}

/** On bot startup, ensure the pinned board + request prompt still exist. */
export async function ensureCraftChannel(
  deps: CraftCommandDeps,
  guildId: string,
  client: any,
): Promise<void> {
  const channelId = deps.craftChannelId;
  if (!channelId) return;

  const state = deps.store.getChannelState(guildId, channelId);
  if (!state) return; // /craft setup hasn't been run yet

  try {
    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (!channel) return;

    // Check board
    let boardOk = false;
    if (state.boardMessageId) {
      try {
        await channel.messages.fetch(state.boardMessageId);
        boardOk = true;
      } catch { /* deleted */ }
    }

    if (!boardOk) {
      const projects = deps.store.listOpenProjects(guildId);
      const projectsWithTasks = projects.map((p) => ({
        project: p,
        tasks: deps.store.getTasks(p.id),
      }));
      const { embeds } = buildBoardMessage(projectsWithTasks);
      const msg = await channel.send({ embeds });
      await msg.pin().catch(() => {});
      deps.store.upsertChannelState({
        ...state,
        boardMessageId: msg.id,
      });
      console.log('[craft] recreated pinned board (was deleted)');
    }

    // Check request prompt
    if (state.requestMessageId) {
      try {
        await channel.messages.fetch(state.requestMessageId);
      } catch {
        const { embeds, components } = buildRequestPrompt();
        const msg = await channel.send({ embeds, components });
        await msg.pin().catch(() => {});
        deps.store.upsertChannelState({
          ...state,
          boardMessageId: state.boardMessageId, // preserve the one we may have just fixed
          requestMessageId: msg.id,
        });
        console.log('[craft] recreated pinned request prompt (was deleted)');
      }
    }
  } catch (e) {
    console.error('[craft] ensureCraftChannel failed:', e instanceof Error ? e.message : e);
  }
}
