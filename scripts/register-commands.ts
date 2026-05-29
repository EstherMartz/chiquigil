// Run: npx tsx --env-file=.env scripts/register-commands.ts

const APP_ID = process.env.DISCORD_APP_ID!;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN');
  process.exit(1);
}

const commands = [
  {
    name: 'oye',
    description: 'Pregunta a Qiqirn sobre el mercado',
    options: [{ type: 3, name: 'question', description: 'Tu pregunta', required: true }],
  },
  {
    name: 'craft',
    description: 'Coordinar proyectos de crafteo',
    options: [
      {
        type: 1, name: 'new', description: 'Crear proyecto',
        options: [
          { type: 3, name: 'item', description: 'Item a craftear', required: false, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: false, min_value: 1 },
          { type: 3, name: 'name', description: 'Nombre del proyecto', required: false },
          { type: 5, name: 'intermediates', description: 'Incluir intermedios (por defecto: sí)', required: false },
          { type: 8, name: 'ping_role', description: 'Rol a mencionar', required: false },
        ],
      },
      {
        type: 1, name: 'add-item', description: 'Añadir item a un proyecto multi-craft',
        options: [
          { type: 4, name: 'id', description: 'ID del proyecto', required: true },
          { type: 3, name: 'item', description: 'Item a añadir', required: true, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: false, min_value: 1 },
        ],
      },
      { type: 1, name: 'list', description: 'Ver proyectos abiertos' },
      { type: 1, name: 'show', description: 'Ver proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
      {
        type: 1, name: 'claim',
        description: 'Reclamar una tarea por nombre (cuando no aparece en el menú)',
        options: [
          { type: 4, name: 'id', description: 'ID del proyecto', required: true },
          { type: 3, name: 'item', description: 'Item a reclamar', required: true, autocomplete: true },
        ],
      },
      { type: 1, name: 'close', description: 'Cerrar proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
    ],
  },
  {
    name: 'setup',
    description: 'Configura el bot',
    default_member_permissions: '8', // ADMINISTRATOR
    options: [
      { type: 1, name: 'modal', description: 'Abre el formulario de configuración' },
      { type: 1, name: 'view', description: 'Muestra la configuración actual' },
    ],
  },
  {
    name: 'craftable',
    description: 'Qué puedes craftear con tu inventario',
    options: [{ type: 11, name: 'csv', description: 'Archivo CSV de inventario', required: true }],
  },
  {
    name: 'prune',
    description: 'Elimina los últimos mensajes del canal (requiere Gestionar mensajes)',
    default_member_permissions: '8192', // MANAGE_MESSAGES
    options: [
      {
        type: 4, name: 'amount', description: 'Número de mensajes a borrar (1-100, por defecto 10)',
        required: false, min_value: 1, max_value: 100,
      },
    ],
  },
];

async function main() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${BOT_TOKEN}` },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    console.error('Failed:', res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Registered ${(data as unknown[]).length} commands globally.`);
}

main();
