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
          { type: 3, name: 'item', description: 'Item a craftear', required: true, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: true, min_value: 1 },
          { type: 3, name: 'name', description: 'Nombre del proyecto', required: false },
          { type: 5, name: 'intermediates', description: 'Incluir intermedios', required: false },
          { type: 8, name: 'ping_role', description: 'Rol a mencionar', required: false },
        ],
      },
      { type: 1, name: 'list', description: 'Ver proyectos abiertos' },
      { type: 1, name: 'show', description: 'Ver proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
      { type: 1, name: 'close', description: 'Cerrar proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
      { type: 1, name: 'setup', description: 'Configurar canal de craft (admin)' },
    ],
  },
  {
    name: 'cleanup',
    description: 'Analizar inventario CSV',
    options: [{ type: 11, name: 'csv', description: 'Archivo CSV de inventario', required: true }],
  },
  {
    name: 'purge',
    description: 'Borrar mensajes (admin)',
    options: [{ type: 4, name: 'amount', description: 'Cantidad (1-100)', required: false, min_value: 1, max_value: 100 }],
  },
  {
    name: 'craftable',
    description: 'Qué puedes craftear con tu inventario',
    options: [{ type: 11, name: 'csv', description: 'Archivo CSV de inventario', required: true }],
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
