import { REST, Routes, SlashCommandBuilder } from 'discord.js';

export async function registerCommands(token: string, clientId: string, guildIds: string[]): Promise<void> {
  const command = new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Pregúntale al asistente del mercado ✨')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('Tu pregunta').setRequired(true),
    );

  const rest = new REST({ version: '10' }).setToken(token);

  for (const guildId of guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [command.toJSON()] },
      );
      console.log(`Registered /chat in guild ${guildId}`);
    } catch (e) {
      console.error(`Failed to register commands in guild ${guildId}:`, e);
    }
  }
}
