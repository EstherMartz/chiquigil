import { Client, Events, GatewayIntentBits, Partials, type Message } from 'discord.js';
import { config } from './config';
import { loadSnapshots } from './loadSnapshots';
import { handleCsv } from './handleCsv';

async function main() {
  console.log('Loading snapshots…');
  const snapshots = await loadSnapshots(config.snapshotsDir);
  console.log(`Loaded ${snapshots.itemsById.size} items, ${snapshots.recipes.size} recipes.`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (msg: Message) => {
    if (msg.author.bot) return;
    if (!msg.guildId || !config.guildAllowlist.has(msg.guildId)) return;
    const attachment = msg.attachments.find((a) => a.name?.toLowerCase().endsWith('.csv'));
    if (!attachment) return;

    if (msg.channel.isTextBased() && 'sendTyping' in msg.channel) {
      await msg.channel.sendTyping();
    }
    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
      const csv = await res.text();
      const reply = await handleCsv(csv, snapshots, {
        world: config.world,
        dc: config.dc,
        region: config.region,
      });
      await msg.reply({ content: reply.summary, embeds: reply.embeds, files: reply.files });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await msg.reply(`Couldn't process CSV: \`${m}\``);
    }
  });

  await client.login(config.token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
