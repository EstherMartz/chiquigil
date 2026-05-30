/** All user-facing Spanish copy for the craft coordinator. */

/** Discord snowflakes are 17–20 digit numeric strings. Plugin-created projects
 *  store a character name instead — render that as plain text, not a broken mention. */
export function mentionOrName(value: string): string {
  return /^\d{17,20}$/.test(value) ? `<@${value}>` : value;
}

// ── Board ──
export const BOARD_TITLE = '📋 Proyectos de crafteo activos';
export const BOARD_FOOTER = 'Se actualiza automáticamente';
export const BOARD_EMPTY = 'No hay proyectos de crafteo activos ahora mismo. ¡Empieza uno con `/craft new`!';
export const BOARD_TRUNCATED = '…más proyectos no mostrados';

// ── Project embed ──
export const PROJECT_STATUS_OPEN = 'abierto';
export const PROJECT_STATUS_CLOSED = '✅ Cerrado';
export const PROJECT_DONE_SUFFIX = 'hechas';   // "6/19 hechas"
export const PROJECT_TASKS_SUFFIX = 'tareas';   // "1/16 tareas"
export const PROJECT_TRUNCATED = '…truncado — usa /craft show para ver todo';

// ── Request prompt ──
export const REQUEST_TITLE = '🛠 Pedir un crafteo';
export const REQUEST_DESCRIPTION =
  '¿Necesitas craftear algo? Pulsa el botón de abajo para pedirlo y el bot lo desglosará en tareas que la guild podrá reclamar.';
export const REQUEST_BUTTON = 'Pedir un crafteo';

// ── Section headers ──
export const SECTION_CRAFT = 'CRAFTEAR';     // "CRAFTEAR — ⚗️ ALC"
export const SECTION_WORKSHOP = '🛠 TALLER DE LA GUILD';
export const SECTION_MARKET = '🪙 COMPRAR — Mercado';
export const SECTION_VENDOR = '🏪 COMPRAR — Vendedor PNJ';
export const SECTION_CURRENCY = '💠 COMPRAR — Divisa';
export const SECTION_GATHER = '⛏ RECOLECTAR';

// ── Task line details ──
export const UNCLAIMED = 'sin asignar';

// ── Components ──
export const SELECT_PLACEHOLDER = 'Reclamar tarea…';
export const PHASE_SELECT_PLACEHOLDER = 'Cambiar de fase…';
export const BTN_LOG_PROGRESS = 'Registrar progreso';
export const BTN_MARK_DONE = 'Marcar las mías como hechas';
export const BTN_UNCLAIM = 'Soltar tarea';
export const BTN_REFRESH = 'Actualizar precios';

// ── Modal ──
export const MODAL_REQUEST_TITLE = 'Pedir un crafteo';
export const MODAL_ITEM_LABEL = 'Objeto (nombre en inglés)';
export const MODAL_QTY_LABEL = 'Cantidad';
export const MODAL_NAME_LABEL = 'Nombre (opcional)';
export const MODAL_PROGRESS_DONE_LABEL = (done: number, needed: number) =>
  `¿Cuántos completaste? (${done}/${needed})`;

// ── Command replies ──
export const NO_OPEN_PROJECTS = 'No hay proyectos abiertos 🐀';
export const PROJECT_NOT_FOUND = (id: number) => `Proyecto #${id} no encontrado.`;
export const NO_PERMISSION = 'No tienes permisos para hacer eso.';
export const ITEM_NOT_FOUND = (q: string) => `No encontré el objeto "${q}" — intenta con el nombre en inglés.`;
export const NO_RECIPE = (name: string) => `No pude descomponer **${name}** — ¿tiene receta?`;
export const CHANNEL_NOT_FOUND = 'No pude publicar el proyecto en el canal — revisa los logs (puede ser permisos del bot o payload rechazado).';
export const PROJECT_CREATED = (id: number, channelId: string, taskCount: number) =>
  `✅ Proyecto **#${id}** creado en <#${channelId}> con ${taskCount} tareas.`;
export const PROJECT_CLOSED = (id: number) => `🔒 Proyecto #${id} cerrado.`;
// Browser-safe: this module is imported by client code (via craftRender), where
// `process` is undefined. Guard so Vite doesn't throw at module-eval time.
const PROJECTS_BASE_URL =
  (typeof process !== 'undefined' ? process.env.PROJECTS_BASE_URL : undefined) ?? 'https://qiqirn.tools';
export const NEW_PROJECT_CONTENT = (projectId: number) =>
  `🛠 Nuevo proyecto de crafteo:\n📋 ${PROJECTS_BASE_URL}/projects/${projectId}`;
export const SETUP_DONE = (channelId: string) =>
  `✅ Canal de crafteo configurado en <#${channelId}> — board y prompt pinneados.`;
export const SETUP_ADMIN_ONLY = 'Solo admins pueden ejecutar /craft setup.';
export const CLOSE_ADMIN_ONLY = 'Solo el creador o un admin puede cerrar un proyecto.';
export const INVALID_QTY = 'Cantidad inválida.';
export const INVALID_AMOUNT = 'Ingresa un número válido.';
export const TASK_ALREADY_TAKEN = 'No pude reclamar esa tarea — ya está tomada.';
export const NO_CLAIMED_TASKS = 'No tienes tareas reclamadas en este proyecto.';
export const NO_PENDING_TASKS = 'No tienes tareas pendientes en este proyecto.';
export const NO_TASKS_TO_UNCLAIM = 'No tienes tareas que soltar.';
export const PROGRESS_FAILED = 'No pude actualizar — ¿es tu tarea?';

// ── Thread notes ──
export const THREAD_PROJECT_CREATED = (userId: string, taskCount: number) =>
  `📋 Proyecto creado por ${mentionOrName(userId)} — ${taskCount} tareas. ¡Reclama las tuyas arriba!`;
export const THREAD_PROJECT_REQUESTED = (userId: string, taskCount: number) =>
  `📋 Proyecto solicitado por ${mentionOrName(userId)} — ${taskCount} tareas. ¡Reclama las tuyas arriba!`;
export const THREAD_CLAIMED = (userId: string, qty: number, item: string) =>
  `<@${userId}> ha reclamado ${qty}× **${item}**`;
export const THREAD_PROGRESS = (userId: string, item: string, done: number, needed: number, isDone: boolean) =>
  `<@${userId}> avanzó **${item}** → ${done}/${needed}${isDone ? ' ✅' : ''}`;
export const THREAD_DONE = (userId: string, count: number) =>
  `<@${userId}> marcó ${count} tarea(s) como completadas ✅`;

// ── Multi-craft ──
export const EMPTY_PROJECT_CREATED = (id: number) =>
  `Kyah~! Proyecto **#${id}** creado, nyeh. Usa \`/craft add-item id:${id}\` para añadir piezas, kukuru~!`;
export const ITEM_ADDED = (itemName: string, taskCount: number) =>
  `Nyeh~! **${itemName}** añadido al proyecto. ${taskCount} tareas en total, kukuru!`;
export const ADD_ITEM_PROJECT_CLOSED = 'Nyeh~! Ese proyecto ya está cerrado, kukuru.';
export const ADD_ITEM_WRONG_GUILD = 'Nyeh~! Ese proyecto no es de este servidor, kukuru.';

// ── Fuzzy match ──
export const DID_YOU_MEAN = (query: string) =>
  `No encontré "${query}" exacto, pero encontré estas opciones. Selecciona una:`;
export const NO_CLOSE_MATCHES = (query: string) =>
  `No encontré nada parecido a "${query}" — intenta con el nombre en inglés exacto.`;

// ── List subcommand ──
export const LIST_TITLE = '📋 Proyectos abiertos';

// ── Crafter job names (Spanish) ──
export const JOB_NAME: Record<string, string> = {
  CRP: 'Carpintero',
  BSM: 'Herrero',
  ARM: 'Armero',
  GSM: 'Orfebre',
  LTW: 'Peletero',
  WVR: 'Tejedor',
  ALC: 'Alquimista',
  CUL: 'Cocinero',
  ANY: 'Cualquiera',
};
