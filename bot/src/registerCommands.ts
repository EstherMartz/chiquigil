import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

export async function registerCommands(token: string, clientId: string, guildIds: string[]): Promise<void> {
  const cleanup = new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Analiza tu inventario desde un CSV de Allagan Tools ✨')
    .addAttachmentOption((opt) =>
      opt.setName('csv').setDescription('Tu archivo CSV de Allagan Tools').setRequired(true),
    );

  const purge = new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Borra mensajes del canal (solo admins) 🧹')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt.setName('amount')
        .setDescription('Cantidad de mensajes a borrar (1-100)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100),
    );

  const craft = new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Coordina proyectos de crafteo en grupo 🛠')
    .addSubcommand((sub) =>
      sub.setName('new')
        .setDescription('Crea un nuevo proyecto de crafteo')
        .addStringOption((opt) =>
          opt.setName('item').setDescription('Item a craftear (nombre en inglés)').setRequired(true).setAutocomplete(true),
        )
        .addIntegerOption((opt) =>
          opt.setName('qty').setDescription('Cantidad a craftear').setRequired(true).setMinValue(1),
        )
        .addStringOption((opt) =>
          opt.setName('name').setDescription('Nombre del proyecto (opcional)').setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt.setName('intermediates').setDescription('¿Craftear intermedios? (default: sí)').setRequired(false),
        )
        .addRoleOption((opt) =>
          opt.setName('ping_role').setDescription('Rol a mencionar en el anuncio').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('Lista proyectos abiertos'),
    )
    .addSubcommand((sub) =>
      sub.setName('show')
        .setDescription('Muestra un proyecto')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID del proyecto').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('close')
        .setDescription('Cierra un proyecto (creador o admin)')
        .addIntegerOption((opt) =>
          opt.setName('id').setDescription('ID del proyecto').setRequired(true),
        ),
    );

  const setup = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura el bot 🔧')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('modal')
        .setDescription('Abre el formulario de configuración'),
    )
    .addSubcommand((sub) =>
      sub.setName('view')
        .setDescription('Muestra la configuración actual'),
    );

  const rest = new REST({ version: '10' }).setToken(token);

  for (const guildId of guildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [cleanup.toJSON(), purge.toJSON(), craft.toJSON(), setup.toJSON()] },
      );
      console.log(`Registered /cleanup, /purge, /craft, /setup in guild ${guildId}`);
    } catch (e) {
      console.error(`Failed to register commands in guild ${guildId}:`, e);
    }
  }
}
