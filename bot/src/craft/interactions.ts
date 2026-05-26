import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type Interaction,
  type TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from 'discord.js';
import type { CraftStore } from './store';
import type { BotSnapshots } from '../loadSnapshots';
import type { MarketBundle } from '../../../src/features/watchlist/useMarketData';
import type { NameIndex } from '../chat/nameIndex';
import { searchItems, fuzzySearchItems } from '../chat/nameIndex';
import { buildBreakdown } from './sourcing';
import { buildProjectMessage } from './render';
import { refreshBoard, type CraftCommandDeps } from './commands';
import * as S from './strings';

export interface CraftInteractionDeps {
  store: CraftStore;
  snapshots: BotSnapshots;
  nameIndex: NameIndex;
  cfg: { world: string; dc: string; region: string };
  craftChannelId: string | undefined;
  crafterRoleId: string | undefined;
  fetchMarket: (ids: number[], cfg: { world: string; dc: string; region: string }) => Promise<MarketBundle>;
}

/** Returns true if this interaction was handled as a craft-project interaction. */
export async function handleCraftInteraction(
  interaction: Interaction,
  deps: CraftInteractionDeps,
): Promise<boolean> {
  if (interaction.isModalSubmit() && interaction.customId.startsWith('cproj:')) {
    if (interaction.customId === 'cproj:requestmodal') {
      await handleRequestModal(interaction, deps);
    } else {
      await handleProgressModal(interaction, deps);
    }
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cproj:')) {
    if (interaction.customId.startsWith('cproj:requestpick:')) {
      await handleRequestPick(interaction as StringSelectMenuInteraction, deps);
    } else {
      await handleSelect(interaction as StringSelectMenuInteraction, deps);
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('cproj:')) {
    if (interaction.customId === 'cproj:request') {
      await handleRequestButton(interaction as ButtonInteraction);
      return true;
    }
    await handleButton(interaction as ButtonInteraction, deps);
    return true;
  }

  return false;
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

async function refreshEmbed(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  deps: CraftInteractionDeps,
  projectId: number,
): Promise<void> {
  const project = deps.store.getProject(projectId);
  if (!project) return;
  const tasks = deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, tasks);

  try {
    if (interaction.message) {
      await interaction.message.edit({ embeds, components });
    }
  } catch { /* best effort */ }
}

async function sendThreadNote(
  deps: CraftInteractionDeps,
  projectId: number,
  note: string,
  client: any,
): Promise<void> {
  const project = deps.store.getProject(projectId);
  if (!project?.threadId) return;
  try {
    const thread = await client.channels.fetch(project.threadId);
    if (thread && 'send' in thread) {
      await (thread as TextChannel).send(note);
    }
  } catch { /* thread may be archived/deleted */ }
}

async function refreshBoardFromInteraction(
  deps: CraftInteractionDeps,
  guildId: string,
  client: any,
): Promise<void> {
  // Reuse refreshBoard by building a compatible deps shape
  await refreshBoard(deps as any as CraftCommandDeps, guildId, client);
}

async function handleSelect(
  interaction: StringSelectMenuInteraction,
  deps: CraftInteractionDeps,
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  if (parsed.action === 'claim') {
    const taskId = parseInt(interaction.values[0], 10);
    if (isNaN(taskId)) return;

    const claimed = deps.store.claimTask(taskId, interaction.user.id);
    if (!claimed) {
      await interaction.reply({ content: S.TASK_ALREADY_TAKEN, ephemeral: true });
      return;
    }

    await interaction.deferUpdate();
    await refreshEmbed(interaction, deps, parsed.projectId);

    // Thread note
    const task = deps.store.getTasks(parsed.projectId).find((t) => t.id === taskId);
    if (task) {
      await sendThreadNote(deps, parsed.projectId, S.THREAD_CLAIMED(interaction.user.id, task.qtyNeeded, task.itemName), interaction.client);
    }

    // Refresh board
    const project = deps.store.getProject(parsed.projectId);
    if (project) await refreshBoardFromInteraction(deps, project.guildId, interaction.client);
  }
}

async function handleButton(
  interaction: ButtonInteraction,
  deps: CraftInteractionDeps,
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  switch (parsed.action) {
    case 'progress': {
      const tasks = deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === interaction.user.id && t.status === 'claimed');

      if (myTasks.length === 0) {
        await interaction.reply({ content: S.NO_CLAIMED_TASKS, ephemeral: true });
        return;
      }

      const task = myTasks[0];
      const modal = new ModalBuilder()
        .setCustomId(`cproj:${parsed.projectId}:progressmodal:${task.id}`)
        .setTitle(`Progreso: ${task.itemName}`.slice(0, 45))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('amount')
              .setLabel(S.MODAL_PROGRESS_DONE_LABEL(task.qtyDone, task.qtyNeeded))
              .setStyle(TextInputStyle.Short)
              .setPlaceholder(String(task.qtyNeeded - task.qtyDone))
              .setRequired(true),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    case 'done': {
      const tasks = deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === interaction.user.id && t.status === 'claimed');

      if (myTasks.length === 0) {
        await interaction.reply({ content: S.NO_PENDING_TASKS, ephemeral: true });
        return;
      }

      for (const t of myTasks) {
        deps.store.logProgress(t.id, interaction.user.id, t.qtyNeeded);
      }

      await interaction.deferUpdate();
      await refreshEmbed(interaction, deps, parsed.projectId);

      await sendThreadNote(deps, parsed.projectId, S.THREAD_DONE(interaction.user.id, myTasks.length), interaction.client);
      const project = deps.store.getProject(parsed.projectId);
      if (project) await refreshBoardFromInteraction(deps, project.guildId, interaction.client);
      return;
    }

    case 'unclaim': {
      const tasks = deps.store.getTasks(parsed.projectId);
      const myTasks = tasks.filter((t) => t.assigneeId === interaction.user.id && t.status !== 'done');
      let count = 0;
      for (const t of myTasks) {
        if (deps.store.unclaimTask(t.id, interaction.user.id)) count++;
      }

      if (count === 0) {
        await interaction.reply({ content: S.NO_TASKS_TO_UNCLAIM, ephemeral: true });
        return;
      }

      await interaction.deferUpdate();
      await refreshEmbed(interaction, deps, parsed.projectId);
      const project = deps.store.getProject(parsed.projectId);
      if (project) await refreshBoardFromInteraction(deps, project.guildId, interaction.client);
      return;
    }

    case 'refresh': {
      await interaction.deferUpdate();
      await refreshEmbed(interaction, deps, parsed.projectId);
      return;
    }
  }
}

/** "Request a craft" button — opens a modal. */
async function handleRequestButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('cproj:requestmodal')
    .setTitle(S.MODAL_REQUEST_TITLE)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('item')
          .setLabel(S.MODAL_ITEM_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('qty')
          .setLabel(S.MODAL_QTY_LABEL)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(S.MODAL_NAME_LABEL)
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );

  await interaction.showModal(modal);
}

/** Handle the "Request a craft" modal submission — runs the same new flow. */
async function handleRequestModal(
  interaction: any, // ModalSubmitInteraction
  deps: CraftInteractionDeps,
): Promise<void> {
  const itemQuery = interaction.fields.getTextInputValue('item');
  const qtyStr = interaction.fields.getTextInputValue('qty');
  const label = interaction.fields.getTextInputValue('name') || null;
  const qty = parseInt(qtyStr, 10);

  if (isNaN(qty) || qty <= 0) {
    await interaction.reply({ content: S.INVALID_QTY, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Try exact/substring first, then fuzzy
  let matches = searchItems(deps.nameIndex, itemQuery, 1);
  if (matches.length === 0) {
    const fuzzy = fuzzySearchItems(deps.nameIndex, itemQuery, 10);
    if (fuzzy.length === 0) {
      await interaction.editReply(S.NO_CLOSE_MATCHES(itemQuery));
      return;
    }
    // Show a "did you mean?" select menu
    const select = new StringSelectMenuBuilder()
      .setCustomId(`cproj:requestpick:${qty}:${encodeURIComponent(label ?? '')}`)
      .setPlaceholder(S.SELECT_PLACEHOLDER)
      .addOptions(
        fuzzy.map((r) => ({
          label: r.name.slice(0, 100),
          value: String(r.id),
        })),
      );
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
    await interaction.editReply({
      content: S.DID_YOU_MEAN(itemQuery),
      components: [row],
    });
    return;
  }

  const itemId = matches[0].id;
  const itemName = matches[0].name;
  const projectName = label ?? `${qty}× ${itemName}`;

  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;
  const { explode } = await import('./explode');
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates: true });
  const allLeafIds = [...preExplode.leaves.keys()];

  const market = await deps.fetchMarket(allLeafIds, deps.cfg);
  const breakdown = buildBreakdown(
    itemId, qty, market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
    { craftIntermediates: true },
  );

  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    await interaction.editReply(S.NO_RECIPE(itemName));
    return;
  }

  const targetChannelId = deps.craftChannelId ?? interaction.channelId;
  const targetChannel = await interaction.client.channels.fetch(targetChannelId) as TextChannel;
  if (!targetChannel) {
    await interaction.editReply(S.CHANNEL_NOT_FOUND);
    return;
  }

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

  const roleId = deps.crafterRoleId;
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

  try {
    const thread = await announcementMsg.startThread({
      name: projectName.slice(0, 100),
      autoArchiveDuration: 1440,
    });
    deps.store.setProjectThreadId(projectId, thread.id);
    await thread.send(S.THREAD_PROJECT_REQUESTED(interaction.user.id, storedTasks.length));
  } catch (e) {
    console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
  }

  await refreshBoard(deps as any, interaction.guildId!, interaction.client);
  await interaction.editReply(S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length));
}

/** Handle "did you mean?" select from the request modal fuzzy search. */
async function handleRequestPick(
  interaction: StringSelectMenuInteraction,
  deps: CraftInteractionDeps,
): Promise<void> {
  // customId = cproj:requestpick:<qty>:<encodedLabel>
  const parts = interaction.customId.split(':');
  const qty = parseInt(parts[2], 10);
  const label = decodeURIComponent(parts[3] ?? '') || null;

  if (isNaN(qty) || qty <= 0) return;

  const itemId = parseInt(interaction.values[0], 10);
  if (isNaN(itemId)) return;

  await interaction.deferUpdate();

  const itemName = deps.snapshots.namesById.get(itemId) ?? `Item #${itemId}`;
  const projectName = label ?? `${qty}× ${itemName}`;

  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;
  const { explode } = await import('./explode');
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates: true });
  const allLeafIds = [...preExplode.leaves.keys()];

  const market = await deps.fetchMarket(allLeafIds, deps.cfg);
  const breakdown = buildBreakdown(
    itemId, qty, market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
    { craftIntermediates: true },
  );

  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    await interaction.editReply({ content: S.NO_RECIPE(itemName), components: [] });
    return;
  }

  const targetChannelId = deps.craftChannelId ?? interaction.channelId;
  const targetChannel = await interaction.client.channels.fetch(targetChannelId) as TextChannel;
  if (!targetChannel) {
    await interaction.editReply({ content: S.CHANNEL_NOT_FOUND, components: [] });
    return;
  }

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

  const roleId = deps.crafterRoleId;
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

  try {
    const thread = await announcementMsg.startThread({
      name: projectName.slice(0, 100),
      autoArchiveDuration: 1440,
    });
    deps.store.setProjectThreadId(projectId, thread.id);
    await thread.send(S.THREAD_PROJECT_REQUESTED(interaction.user.id, storedTasks.length));
  } catch (e) {
    console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
  }

  await refreshBoard(deps as any, interaction.guildId!, interaction.client);
  await interaction.editReply({ content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length), components: [] });
}

async function handleProgressModal(
  interaction: any, // ModalSubmitInteraction
  deps: CraftInteractionDeps,
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.action !== 'progressmodal' || !parsed.taskId) return;

  const amountStr = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({ content: S.INVALID_AMOUNT, ephemeral: true });
    return;
  }

  const result = deps.store.logProgress(parsed.taskId, interaction.user.id, amount);
  if (!result) {
    await interaction.reply({ content: S.PROGRESS_FAILED, ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  // Thread note
  await sendThreadNote(deps, parsed.projectId, S.THREAD_PROGRESS(interaction.user.id, result.itemName, result.qtyDone, result.qtyNeeded, result.status === 'done'), interaction.client);

  // Refresh the announcement embed
  const project = deps.store.getProject(parsed.projectId);
  if (!project || !project.messageId) return;

  try {
    const channel = await interaction.client.channels.fetch(project.channelId) as TextChannel;
    if (channel) {
      const msg = await channel.messages.fetch(project.messageId);
      const tasks = deps.store.getTasks(parsed.projectId);
      const { embeds, components } = buildProjectMessage(project, tasks);
      await msg.edit({ embeds, components });
    }
  } catch { /* best effort */ }

  await refreshBoardFromInteraction(deps, project.guildId, interaction.client);
}
