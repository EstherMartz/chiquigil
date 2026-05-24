import { REST, Routes, SlashCommandBuilder } from 'discord.js';

export async function registerCommands(token: string, clientId: string, guildIds: string[]): Promise<void> {
  const cleanup = new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Analiza tu inventario desde un CSV de Allagan Tools ✨')
    .addAttachmentOption((opt) =>
      opt.setName('csv').setDescription('Tu archivo CSV de Allagan Tools').setRequired(true),
    );

  const rest = new REST({ version: '10' }).setToken(token);

  for (const guildId of guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [cleanup.toJSON()] },
      );
      console.log(`Registered /cleanup in guild ${guildId}`);
    } catch (e) {
      console.error(`Failed to register commands in guild ${guildId}:`, e);
    }
  }
}
