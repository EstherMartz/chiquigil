import { Client, Events, GatewayIntentBits, Partials, type Message } from 'discord.js';
import { config } from './config';
import { loadSnapshots } from './loadSnapshots';
import { handleCsv } from './handleCsv';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';
import { handleInteraction, newCacheId } from './interactions';
import { fetchMarketForOutputs } from './fetchMarketForOutputs';
import { registerCommands } from './registerCommands';
import { handleChatMessage, type ChatDeps } from './chat/chatRouter';
import { buildNameIndex } from './chat/nameIndex';

const TTL_MS = 30 * 60_000;       // 30-min sliding TTL
const MAX_ENTRIES = 100;
const SWEEP_MS = 5 * 60_000;      // sweep every 5 minutes

const GREETINGS = [
  'Gracias por confiarme tu inventario ✨ Voy a saludar a cada objeto y descubrir cuáles te traen alegría. Dame un par de minutos para ordenarlo todo con cariño.',
  '¡Qué tesoros tan bonitos! 🌸 Permíteme un momento para sentarme con cada uno y agradecerle su servicio antes de decidir su lugar.',
  'Hola, qué colección tan adorable ✨ Voy a tomar mi tiempo para saludar a cada objeto y preguntarle si aún chispea alegría en tu corazón.',
  'Gracias por compartir tus pertenencias conmigo 🌷 Voy a ordenar con cariño — dame un ratito mientras saludo a cada una y descubro cuáles te siguen dando alegría.',
];

function pickGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

async function main() {
  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`Loaded ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes, ${snapshots.vendorMap.size} vendor prices.`);

  const cache = createCleanupCache({ ttlMs: TTL_MS, maxEntries: MAX_ENTRIES });
  const sweepTimer = setInterval(() => cache.evictExpired(), SWEEP_MS);
  sweepTimer.unref?.();

  const nameIndex = buildNameIndex(snapshots.namesById);

  const chatDeps: ChatDeps | null = config.openrouterApiKey ? {
    apiKey: config.openrouterApiKey,
    model: config.chatModel,
    toolCtx: {
      snapshots,
      nameIndex,
      cfg: { world: config.world, dc: config.dc, region: config.region },
    },
  } : null;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    await registerCommands(config.token, c.user.id, [...config.guildAllowlist]);

    if (chatDeps && config.chatChannelId) {
      console.log(`Chat enabled in channel ${config.chatChannelId}`);
    } else if (!config.openrouterApiKey) {
      console.log('Chat disabled (no OPENROUTER_API_KEY)');
    } else if (!config.chatChannelId) {
      console.log('Chat disabled (no CHAT_CHANNEL_ID)');
    }
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    if (!msg.guildId || !config.guildAllowlist.has(msg.guildId)) return;

    // Chat channel — route to AI
    if (chatDeps && config.chatChannelId && msg.channelId === config.chatChannelId) {
      if (!msg.content.trim()) return;
      await handleChatMessage(msg, chatDeps);
      return;
    }

    // Legacy CSV via message attachment (still works outside chat channel)
    const attachment = msg.attachments.find((a) => a.name?.toLowerCase().endsWith('.csv'));
    if (!attachment) return;

    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }
    await msg.reply(pickGreeting());

    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
      const csv = await res.text();
      const cacheId = newCacheId();
      const out = await handleCsv(csv, snapshots, {
        world: config.world,
        dc: config.dc,
        region: config.region,
      }, { ownerId: msg.author.id, cacheId });
      await msg.reply({
        content: out.reply.summary,
        embeds: out.reply.embeds,
        files: out.reply.files,
        components: out.reply.components,
      });
      const entry: CachedCleanup = {
        ownerId: msg.author.id,
        cacheId,
        csv,
        parsed: out.parsed,
        marketIds: out.marketIds,
        result: out.result,
        usesByItemId: out.usesByItemId,
        createdAt: Date.now(),
        lastTouchedAt: Date.now(),
      };
      cache.set(msg.author.id, entry);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await msg.reply(`Couldn't process CSV: \`${m}\``);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // Handle /cleanup slash command
    if (interaction.isChatInputCommand() && interaction.commandName === 'cleanup') {
      const attachment = interaction.options.getAttachment('csv', true);
      if (!attachment.name?.toLowerCase().endsWith('.csv')) {
        await interaction.reply({ content: 'Necesito un archivo .csv ✨', ephemeral: true });
        return;
      }

      await interaction.deferReply();
      console.log(`[cleanup] ${interaction.user.tag} uploaded ${attachment.name} (${attachment.size} bytes)`);

      try {
        console.log('[cleanup] fetching attachment…');
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
        const csv = await res.text();
        console.log(`[cleanup] CSV loaded (${csv.length} chars, ${csv.split('\n').length} lines)`);

        const cacheId = newCacheId();
        console.log('[cleanup] running handleCsv…');
        const startTime = Date.now();
        const out = await handleCsv(csv, snapshots, {
          world: config.world,
          dc: config.dc,
          region: config.region,
        }, { ownerId: interaction.user.id, cacheId });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[cleanup] done in ${elapsed}s — ${out.parsed.entries.length} items parsed`);

        await interaction.editReply({
          content: out.reply.summary,
          embeds: out.reply.embeds,
          files: out.reply.files,
          components: out.reply.components,
        });
        console.log('[cleanup] reply sent');

        const entry: CachedCleanup = {
          ownerId: interaction.user.id,
          cacheId,
          csv,
          parsed: out.parsed,
          marketIds: out.marketIds,
          result: out.result,
          usesByItemId: out.usesByItemId,
          createdAt: Date.now(),
          lastTouchedAt: Date.now(),
        };
        cache.set(interaction.user.id, entry);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.error(`[cleanup] error: ${m}`);
        await interaction.editReply(`No pude procesar el CSV: \`${m}\``).catch(() => {});
      }
      return;
    }

    // Handle button interactions (existing cleanup flow)
    handleInteraction(interaction, {
      cache,
      snapshots,
      cfg: { world: config.world, dc: config.dc, region: config.region },
      fetchMarket: fetchMarketForOutputs,
    }).catch((err) => console.error('Interaction handler error:', err));
  });

  await client.login(config.token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
