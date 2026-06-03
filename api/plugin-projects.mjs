// src/bot/craftStore.ts
import { createClient } from "@libsql/client";
async function openCraftStore(url, authToken) {
  const isLocal = url === ":memory:" || url.startsWith("file:");
  const client = createClient({
    url: url === ":memory:" ? "file::memory:" : url,
    ...isLocal ? {} : { authToken }
  });
  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS projects (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id        TEXT NOT NULL,
      channel_id      TEXT NOT NULL,
      message_id      TEXT,
      name            TEXT NOT NULL,
      target_item_id  INTEGER NOT NULL,
      target_qty      INTEGER NOT NULL,
      created_by      TEXT NOT NULL,
      thread_id       TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      item_id     INTEGER NOT NULL,
      item_name   TEXT NOT NULL,
      qty_needed  INTEGER NOT NULL,
      qty_done    INTEGER NOT NULL DEFAULT 0,
      source      TEXT NOT NULL,
      meta        TEXT,
      assignee_id TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_state (
      guild_id           TEXT NOT NULL,
      channel_id         TEXT NOT NULL,
      board_message_id   TEXT,
      request_message_id TEXT,
      PRIMARY KEY (guild_id, channel_id)
    );

    CREATE TABLE IF NOT EXISTS project_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      item_id     INTEGER NOT NULL,
      item_name   TEXT NOT NULL,
      qty         INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chistes (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      joke  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id       TEXT PRIMARY KEY,
      craft_channel_id TEXT NOT NULL,
      language       TEXT NOT NULL DEFAULT 'es'
    );

    CREATE TABLE IF NOT EXISTS app_users (
      discord_id  TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      avatar      TEXT,
      guilds      TEXT NOT NULL DEFAULT '[]',
      access      TEXT NOT NULL DEFAULT 'default',
      first_seen  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL
    );
  `;
  const statements = SCHEMA.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN thread_id TEXT");
  } catch {
  }
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN display_part_key TEXT");
  } catch {
  }
  try {
    await client.execute("ALTER TABLE projects ADD COLUMN display_phase_index INTEGER");
  } catch {
  }
  function rowToProject(row) {
    return {
      id: Number(row.id),
      guildId: String(row.guild_id),
      channelId: String(row.channel_id),
      messageId: row.message_id ? String(row.message_id) : null,
      name: String(row.name),
      targetItemId: Number(row.target_item_id),
      targetQty: Number(row.target_qty),
      createdBy: String(row.created_by),
      threadId: row.thread_id ? String(row.thread_id) : null,
      status: String(row.status),
      createdAt: Number(row.created_at),
      displayPartKey: row.display_part_key ? String(row.display_part_key) : null,
      displayPhaseIndex: row.display_phase_index != null ? Number(row.display_phase_index) : null
    };
  }
  function rowToTask(row) {
    const meta = row.meta ? JSON.parse(String(row.meta)) : null;
    return {
      id: Number(row.id),
      projectId: Number(row.project_id),
      itemId: Number(row.item_id),
      itemName: String(row.item_name),
      qtyNeeded: Number(row.qty_needed),
      qtyDone: Number(row.qty_done),
      source: String(row.source),
      meta,
      assigneeId: row.assignee_id ? String(row.assignee_id) : null,
      status: String(row.status),
      updatedAt: Number(row.updated_at)
    };
  }
  function rowToAppUser(row) {
    return {
      discordId: String(row.discord_id),
      username: String(row.username),
      avatar: row.avatar ? String(row.avatar) : null,
      guilds: row.guilds ? JSON.parse(String(row.guilds)) : [],
      access: String(row.access),
      firstSeen: Number(row.first_seen),
      lastSeen: Number(row.last_seen)
    };
  }
  return {
    async createProject(p) {
      const createdAt = Date.now();
      const result = await client.execute({
        sql: `
          INSERT INTO projects (guild_id, channel_id, name, target_item_id, target_qty, created_by, created_at, display_part_key, display_phase_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          p.guildId,
          p.channelId,
          p.name,
          p.targetItemId,
          p.targetQty,
          p.createdBy,
          createdAt,
          p.displayPartKey ?? null,
          p.displayPhaseIndex ?? null
        ]
      });
      return Number(result.lastInsertRowid);
    },
    async addTasks(projectId, tasks) {
      const now = Date.now();
      for (const t of tasks) {
        await client.execute({
          sql: `
            INSERT INTO tasks (project_id, item_id, item_name, qty_needed, source, meta, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            projectId,
            t.itemId,
            t.itemName,
            t.qtyNeeded,
            t.source,
            t.meta ? JSON.stringify(t.meta) : null,
            now
          ]
        });
      }
    },
    async getProject(id) {
      const result = await client.execute({
        sql: "SELECT * FROM projects WHERE id = ?",
        args: [id]
      });
      const row = result.rows[0];
      return row ? rowToProject(row) : null;
    },
    async getTasks(projectId) {
      const result = await client.execute({
        sql: "SELECT * FROM tasks WHERE project_id = ? ORDER BY source, item_name",
        args: [projectId]
      });
      return result.rows.map(rowToTask);
    },
    async listOpenProjects(guildId) {
      const result = await client.execute({
        sql: "SELECT * FROM projects WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC",
        args: [guildId]
      });
      return result.rows.map(rowToProject);
    },
    async claimTask(taskId, userId) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'",
        args: [userId, now, taskId]
      });
      return result.rowsAffected > 0;
    },
    async claimTaskByCharacter(taskId, characterName) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'",
        args: [characterName, now, taskId]
      });
      if (result.rowsAffected === 0) return null;
      const row = await client.execute({
        sql: "SELECT * FROM tasks WHERE id = ?",
        args: [taskId]
      });
      return row.rows[0] ? rowToTask(row.rows[0]) : null;
    },
    async logProgress(taskId, userId, amount) {
      const result = await client.execute({
        sql: "SELECT * FROM tasks WHERE id = ?",
        args: [taskId]
      });
      const row = result.rows[0];
      if (!row) return null;
      if (String(row.assignee_id) !== userId) return null;
      const qtyNeeded = Number(row.qty_needed);
      const qtyDone = Number(row.qty_done);
      const newDone = Math.min(qtyNeeded, qtyDone + amount);
      const newStatus = newDone >= qtyNeeded ? "done" : "claimed";
      const now = Date.now();
      await client.execute({
        sql: "UPDATE tasks SET qty_done = ?, status = ?, updated_at = ? WHERE id = ?",
        args: [newDone, newStatus, now, taskId]
      });
      return rowToTask({ ...row, qty_done: newDone, status: newStatus, updated_at: now });
    },
    async setProgress(taskId, userId, qtyDone) {
      const result = await client.execute({
        sql: "SELECT * FROM tasks WHERE id = ?",
        args: [taskId]
      });
      const row = result.rows[0];
      if (!row) return null;
      if (String(row.assignee_id) !== userId) return null;
      const qtyNeeded = Number(row.qty_needed);
      const newDone = Math.max(0, Math.min(qtyNeeded, Math.trunc(qtyDone)));
      const newStatus = newDone >= qtyNeeded ? "done" : "claimed";
      const now = Date.now();
      await client.execute({
        sql: "UPDATE tasks SET qty_done = ?, status = ?, updated_at = ? WHERE id = ?",
        args: [newDone, newStatus, now, taskId]
      });
      return rowToTask({ ...row, qty_done: newDone, status: newStatus, updated_at: now });
    },
    async unclaimTask(taskId, userId) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = NULL, status = 'open', updated_at = ? WHERE id = ? AND assignee_id = ?",
        args: [now, taskId, userId]
      });
      return result.rowsAffected > 0;
    },
    async setProjectMessageId(projectId, messageId) {
      await client.execute({
        sql: "UPDATE projects SET message_id = ? WHERE id = ?",
        args: [messageId, projectId]
      });
    },
    async setProjectThreadId(projectId, threadId) {
      await client.execute({
        sql: "UPDATE projects SET thread_id = ? WHERE id = ?",
        args: [threadId, projectId]
      });
    },
    async setProjectChannel(projectId, channelId, messageId, threadId) {
      await client.execute({
        sql: "UPDATE projects SET channel_id = ?, message_id = ?, thread_id = ? WHERE id = ?",
        args: [channelId, messageId, threadId, projectId]
      });
    },
    async setProjectDisplayPhase(projectId, partKey, phaseIndex) {
      await client.execute({
        sql: "UPDATE projects SET display_part_key = ?, display_phase_index = ? WHERE id = ?",
        args: [partKey, phaseIndex, projectId]
      });
    },
    async closeProject(projectId) {
      await client.execute({
        sql: "UPDATE projects SET status = 'closed' WHERE id = ?",
        args: [projectId]
      });
    },
    async getChannelState(guildId, channelId) {
      const result = await client.execute({
        sql: "SELECT * FROM channel_state WHERE guild_id = ? AND channel_id = ?",
        args: [guildId, channelId]
      });
      const row = result.rows[0];
      if (!row) return null;
      return {
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        boardMessageId: row.board_message_id ? String(row.board_message_id) : null,
        requestMessageId: row.request_message_id ? String(row.request_message_id) : null
      };
    },
    async upsertChannelState(state) {
      await client.execute({
        sql: `
          INSERT INTO channel_state (guild_id, channel_id, board_message_id, request_message_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id, channel_id) DO UPDATE SET
            board_message_id = ?,
            request_message_id = ?
        `,
        args: [
          state.guildId,
          state.channelId,
          state.boardMessageId,
          state.requestMessageId,
          state.boardMessageId,
          state.requestMessageId
        ]
      });
    },
    async addProjectItem(projectId, itemId, itemName, qty) {
      const createdAt = Date.now();
      await client.execute({
        sql: "INSERT INTO project_items (project_id, item_id, item_name, qty, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [projectId, itemId, itemName, qty, createdAt]
      });
    },
    async getProjectItems(projectId) {
      const result = await client.execute({
        sql: "SELECT * FROM project_items WHERE project_id = ? ORDER BY created_at ASC",
        args: [projectId]
      });
      return result.rows.map((row) => ({
        id: Number(row.id),
        itemId: Number(row.item_id),
        itemName: String(row.item_name),
        qty: Number(row.qty)
      }));
    },
    async replaceTasks(projectId, tasks) {
      const now = Date.now();
      const statements2 = [
        { sql: "DELETE FROM tasks WHERE project_id = ?", args: [projectId] },
        ...tasks.map((t) => ({
          sql: "INSERT INTO tasks (project_id, item_id, item_name, qty_needed, source, meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [projectId, t.itemId, t.itemName, t.qtyNeeded, t.source, t.meta ? JSON.stringify(t.meta) : null, now]
        }))
      ];
      await client.batch(statements2, "write");
    },
    async getRandomChistes(n) {
      const result = await client.execute({
        sql: "SELECT joke FROM chistes ORDER BY RANDOM() LIMIT ?",
        args: [n]
      });
      return result.rows.map((r) => String(r.joke));
    },
    async getGuildConfig(guildId) {
      const result = await client.execute({
        sql: "SELECT * FROM guild_config WHERE guild_id = ?",
        args: [guildId]
      });
      const row = result.rows[0];
      if (!row) return null;
      return {
        guildId: String(row.guild_id),
        craftChannelId: String(row.craft_channel_id),
        language: String(row.language)
      };
    },
    async setGuildConfig(config) {
      await client.execute({
        sql: `
          INSERT INTO guild_config (guild_id, craft_channel_id, language)
          VALUES (?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET
            craft_channel_id = ?,
            language = ?
        `,
        args: [config.guildId, config.craftChannelId, config.language, config.craftChannelId, config.language]
      });
    },
    async upsertAppUser(u) {
      const now = Date.now();
      await client.execute({
        sql: `
          INSERT INTO app_users (discord_id, username, avatar, guilds, access, first_seen, last_seen)
          VALUES (?, ?, ?, ?, 'default', ?, ?)
          ON CONFLICT(discord_id) DO UPDATE SET
            username = excluded.username,
            avatar = excluded.avatar,
            guilds = excluded.guilds,
            last_seen = excluded.last_seen
        `,
        args: [u.discordId, u.username, u.avatar, JSON.stringify(u.guilds), now, now]
      });
    },
    async listAppUsers() {
      const result = await client.execute("SELECT * FROM app_users ORDER BY last_seen DESC");
      return result.rows.map(rowToAppUser);
    },
    async getAppUser(discordId) {
      const result = await client.execute({
        sql: "SELECT * FROM app_users WHERE discord_id = ?",
        args: [discordId]
      });
      return result.rows.length ? rowToAppUser(result.rows[0]) : null;
    },
    async setUserAccess(discordId, access) {
      await client.execute({
        sql: "UPDATE app_users SET access = ? WHERE discord_id = ?",
        args: [access, discordId]
      });
    },
    async close() {
      await client.close();
    }
  };
}

// src/bot/loadSnapshots.ts
var cached = null;
async function loadSnapshots(baseUrl) {
  if (cached) return cached;
  const [itemsRaw, recipesRaw, vendorRaw, specialRaw, gatherRaw, companyCraftRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/specialShop.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then((r) => r.json()),
    fetch(`${baseUrl}/data/snapshots/companyCraft.json`).then((r) => r.json())
  ]);
  const itemsById = /* @__PURE__ */ new Map();
  const namesById = /* @__PURE__ */ new Map();
  for (const item of itemsRaw.items) {
    itemsById.set(item.id, item);
    namesById.set(item.id, item.name);
  }
  const recipes = /* @__PURE__ */ new Map();
  for (const [id, recipe] of recipesRaw.entries) {
    recipes.set(id, recipe);
  }
  const vendorMap = /* @__PURE__ */ new Map();
  for (const [id, price] of vendorRaw.entries) {
    vendorMap.set(id, price);
  }
  const specialShop = {
    byCurrency: new Map(
      specialRaw.byCurrency.map(
        ([currency, entries]) => [currency, entries]
      )
    )
  };
  const gatheringCatalog = /* @__PURE__ */ new Map();
  for (const [id, info] of gatherRaw.entries) {
    gatheringCatalog.set(id, info);
  }
  const companyCraft = /* @__PURE__ */ new Map();
  for (const [id, recipe] of companyCraftRaw.entries) {
    companyCraft.set(id, recipe);
  }
  cached = { itemsById, namesById, recipes, vendorMap, specialShop, gatheringCatalog, companyCraft };
  return cached;
}

// src/bot/nameIndex.ts
function buildNameIndex(namesById) {
  const map = /* @__PURE__ */ new Map();
  const entries = [];
  for (const [id, name] of namesById) {
    const lower = name.toLowerCase();
    map.set(lower, id);
    entries.push({ id, name, lower });
  }
  entries.sort((a, b) => a.lower.localeCompare(b.lower));
  map._entries = entries;
  return map;
}
function searchItems(index, query, limit = 5) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const exactId = index.get(q);
  if (exactId != null) {
    const entry = index._entries.find((e) => e.id === exactId);
    return [{ id: entry.id, name: entry.name }];
  }
  const results = [];
  for (const entry of index._entries) {
    if (entry.lower.includes(q)) {
      results.push({ id: entry.id, name: entry.name });
      if (results.length >= limit) break;
    }
  }
  return results;
}

// src/lib/currencies.ts
var CURRENCIES = [
  { id: "poetics", label: "Allagan Tomestone of Poetics", shortLabel: "Poetics", itemId: 28 },
  { id: "mathematics", label: "Allagan Tomestone of Mathematics", shortLabel: "Mathematics", itemId: 48 },
  { id: "heliometry", label: "Allagan Tomestone of Heliometry", shortLabel: "Heliometry", itemId: 47 },
  { id: "mnemonics", label: "Allagan Tomestone of Mnemonics", shortLabel: "Mnemonics", itemId: 49 },
  { id: "whiteCrafter", label: "White Crafters' Scrip", shortLabel: "W-Craft", itemId: 25199 },
  { id: "purpleCrafter", label: "Purple Crafters' Scrip", shortLabel: "P-Craft", itemId: 33913 },
  { id: "orangeCrafter", label: "Orange Crafters' Scrip", shortLabel: "O-Craft", itemId: 41784 },
  { id: "whiteGatherer", label: "White Gatherers' Scrip", shortLabel: "W-Gather", itemId: 25200 },
  { id: "purpleGatherer", label: "Purple Gatherers' Scrip", shortLabel: "P-Gather", itemId: 33914 },
  { id: "orangeGatherer", label: "Orange Gatherers' Scrip", shortLabel: "O-Gather", itemId: 41785 },
  { id: "mgp", label: "MGP", shortLabel: "MGP", itemId: 29 },
  { id: "wolfMarks", label: "Wolf Marks", shortLabel: "Wolf", itemId: 25 },
  { id: "bicolor", label: "Bicolor Gemstone", shortLabel: "Bicolor", itemId: 26807 }
];
function getCurrencyById(id) {
  return CURRENCIES.find((c) => c.id === id);
}
var currencyByItemId = new Map(
  CURRENCIES.map((c) => [c.itemId, c.id])
);

// src/lib/europeWorlds.ts
var CHAOS_WORLDS = /* @__PURE__ */ new Set([
  "Cerberus",
  "Louisoix",
  "Moogle",
  "Omega",
  "Phantom",
  "Ragnarok",
  "Sagittarius",
  "Spriggan"
]);
var LIGHT_WORLDS = /* @__PURE__ */ new Set([
  "Alpha",
  "Lich",
  "Odin",
  "Phoenix",
  "Raiden",
  "Shiva",
  "Twintania",
  "Zodiark"
]);
var EU_WORLDS = /* @__PURE__ */ new Set([
  ...CHAOS_WORLDS,
  ...LIGHT_WORLDS
]);
function dcOf(world) {
  if (CHAOS_WORLDS.has(world)) return "Chaos";
  if (LIGHT_WORLDS.has(world)) return "Light";
  return null;
}

// src/features/shoppingList/shoppingListSurvey.ts
function cheapestEuNq(m) {
  if (!m) return null;
  let best = null;
  for (const l of m.worldListings) {
    if (l.hq) continue;
    if (!EU_WORLDS.has(l.world)) continue;
    if (!best || l.price < best.price) best = { world: l.world, price: l.price };
  }
  if (!best) return null;
  return { ...best, count: m.listingCount, isLightDc: dcOf(best.world) === "Light" };
}
function findCheapestCurrency(itemId, shopSnapshot) {
  let best = null;
  for (const [currencyId, entries] of shopSnapshot.byCurrency.entries()) {
    for (const entry of entries) {
      if (entry.itemId !== itemId) continue;
      if (!best || entry.costPerUnit < best.costPerUnit || entry.costPerUnit === best.costPerUnit && currencyId < best.id) {
        best = { id: currencyId, costPerUnit: entry.costPerUnit };
      }
    }
  }
  if (!best) return null;
  const def = getCurrencyById(best.id);
  if (!def) return null;
  return { id: best.id, label: def.label, shortLabel: def.shortLabel, costPerUnit: best.costPerUnit };
}
function surveyIngredients(demand, prices, vendorMap, shopSnapshot) {
  const out = [];
  const sortedIds = [...demand.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const qty = demand.get(id);
    const mb = cheapestEuNq(prices[id]);
    const npcPrice = vendorMap.get(id);
    const npc = npcPrice != null ? { price: npcPrice } : null;
    const currency = findCheapestCurrency(id, shopSnapshot);
    let autoSource = null;
    if (mb && npc) autoSource = mb.price <= npc.price ? "mb" : "npc";
    else if (mb) autoSource = "mb";
    else if (npc) autoSource = "npc";
    out.push({ id, qty, mb, npc, currency, autoSource });
  }
  return out;
}

// src/bot/craftExplode.ts
function explode(targetId, targetQty, recipes, opts = {}) {
  const craftIntermediates = opts.craftIntermediates ?? true;
  const maxDepth = opts.maxDepth ?? 20;
  const crafts = /* @__PURE__ */ new Map();
  const leaves = /* @__PURE__ */ new Map();
  function walk(id, qty, depth, path) {
    if (depth > maxDepth) {
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
      return;
    }
    if (path.has(id)) {
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
      return;
    }
    const recipe = recipes.get(id);
    const forcedLeaf = id !== targetId && (opts.forceLeaf?.(id) ?? false);
    if (recipe && !forcedLeaf && (id === targetId || craftIntermediates)) {
      const yieldPerCraft = recipe.amountResult ?? 1;
      const craftCount = Math.ceil(qty / yieldPerCraft);
      const existing = crafts.get(id);
      if (existing) {
        existing.outputQty += qty;
        existing.craftCount += craftCount;
      } else {
        crafts.set(id, { outputQty: qty, craftCount, job: recipe.classJob });
      }
      path.add(id);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, depth + 1, path);
      }
      path.delete(id);
    } else {
      leaves.set(id, (leaves.get(id) ?? 0) + qty);
    }
  }
  walk(targetId, targetQty, 0, /* @__PURE__ */ new Set());
  return { crafts, leaves };
}

// src/bot/craftSourcing.ts
function sourceLeaves(leaves, market, deps, cheapVendorThreshold) {
  const survey = surveyIngredients(leaves, market.dc, deps.vendorMap, deps.specialShop);
  const acquire = [];
  for (const s of survey) {
    const name = deps.namesById.get(s.id) ?? `Item #${s.id}`;
    const gatherInfo = deps.gatheringCatalog.get(s.id);
    const vendorPrice = deps.vendorMap.get(s.id);
    if (gatherInfo && !(vendorPrice != null && vendorPrice <= cheapVendorThreshold) && !s.currency) {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "gather",
        meta: { gatherLevel: gatherInfo.level, timed: gatherInfo.timed }
      });
    } else if (s.currency) {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "currency",
        meta: { currency: s.currency.shortLabel, currencyId: s.currency.id, costPerUnit: s.currency.costPerUnit }
      });
    } else if (s.npc && s.autoSource === "npc") {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "vendor",
        meta: { price: s.npc.price }
      });
    } else {
      acquire.push({
        itemId: s.id,
        itemName: name,
        qtyNeeded: s.qty,
        source: "market",
        meta: s.mb ? { world: s.mb.world, price: s.mb.price } : {}
      });
    }
  }
  return acquire;
}
function buildBreakdown(targetId, targetQty, market, deps, opts = {}) {
  const cheapVendorThreshold = opts.cheapVendorThreshold ?? 100;
  if (deps.recipes.get(targetId)) {
    const { crafts: craftMap, leaves } = explode(targetId, targetQty, deps.recipes, opts);
    const acquire = sourceLeaves(leaves, market, deps, cheapVendorThreshold);
    const crafts = [];
    for (const [itemId, info] of craftMap) {
      const name = deps.namesById.get(itemId) ?? `Item #${itemId}`;
      crafts.push({
        itemId,
        itemName: name,
        qtyNeeded: info.outputQty,
        source: "craft",
        meta: { job: info.job }
      });
    }
    return { crafts, acquire };
  }
  const cc = deps.companyCraft.get(targetId);
  if (cc) {
    const craftIntermediates = opts.craftIntermediates ?? true;
    const crafts = [{
      itemId: cc.resultItemId,
      itemName: deps.namesById.get(cc.resultItemId) ?? cc.resultName,
      qtyNeeded: targetQty,
      source: "workshop",
      meta: {}
    }];
    const acquire = [];
    for (const part of cc.parts) {
      const partKey = part.name || void 0;
      for (let phaseIndex = 0; phaseIndex < part.phases.length; phaseIndex++) {
        const phase = part.phases[phaseIndex];
        const phaseCrafts = /* @__PURE__ */ new Map();
        const phaseLeaves = /* @__PURE__ */ new Map();
        for (const ing of phase.ingredients) {
          const qty = ing.qty * targetQty;
          if (craftIntermediates && deps.recipes.has(ing.itemId)) {
            const result = explode(ing.itemId, qty, deps.recipes, opts);
            for (const [id, c] of result.crafts) {
              const existing = phaseCrafts.get(id);
              if (existing) {
                existing.outputQty += c.outputQty;
                existing.craftCount += c.craftCount;
              } else {
                phaseCrafts.set(id, { ...c });
              }
            }
            for (const [id, q] of result.leaves) {
              phaseLeaves.set(id, (phaseLeaves.get(id) ?? 0) + q);
            }
          } else {
            phaseLeaves.set(ing.itemId, (phaseLeaves.get(ing.itemId) ?? 0) + qty);
          }
        }
        const phaseTag = { ...partKey ? { partKey } : {}, phaseIndex };
        for (const t of sourceLeaves(phaseLeaves, market, deps, cheapVendorThreshold)) {
          acquire.push({ ...t, meta: { ...t.meta, ...phaseTag } });
        }
        for (const [itemId, info] of phaseCrafts) {
          crafts.push({
            itemId,
            itemName: deps.namesById.get(itemId) ?? `Item #${itemId}`,
            qtyNeeded: info.outputQty,
            source: "craft",
            meta: { job: info.job, ...phaseTag }
          });
        }
      }
    }
    return { crafts, acquire };
  }
  return { crafts: [], acquire: [] };
}

// src/bot/craftStrings.ts
function mentionOrName(value) {
  return /^\d{17,20}$/.test(value) ? `<@${value}>` : value;
}
var BOARD_TITLE = "\u{1F4CB} Proyectos de crafteo activos";
var BOARD_FOOTER = "Se actualiza autom\xE1ticamente";
var BOARD_EMPTY = "No hay proyectos de crafteo activos ahora mismo. \xA1Empieza uno con `/craft new`!";
var BOARD_TRUNCATED = "\u2026m\xE1s proyectos no mostrados";
var PROJECT_STATUS_OPEN = "abierto";
var PROJECT_STATUS_CLOSED = "\u2705 Cerrado";
var PROJECT_DONE_SUFFIX = "hechas";
var PROJECT_TASKS_SUFFIX = "tareas";
var PROJECT_TRUNCATED = "\u2026truncado \u2014 usa /craft show para ver todo";
var SECTION_CRAFT = "CRAFTEAR";
var SECTION_WORKSHOP = "\u{1F6E0} TALLER DE LA GUILD";
var SECTION_MARKET = "\u{1FA99} COMPRAR \u2014 Mercado";
var SECTION_VENDOR = "\u{1F3EA} COMPRAR \u2014 Vendedor PNJ";
var SECTION_CURRENCY = "\u{1F4A0} COMPRAR \u2014 Divisa";
var SECTION_GATHER = "\u26CF RECOLECTAR";
var UNCLAIMED = "sin asignar";
var SELECT_PLACEHOLDER = "Reclamar tarea\u2026";
var PHASE_SELECT_PLACEHOLDER = "Cambiar de fase\u2026";
var BTN_LOG_PROGRESS = "Registrar progreso";
var BTN_MARK_DONE = "Marcar las m\xEDas como hechas";
var BTN_UNCLAIM = "Soltar tarea";
var BTN_REFRESH = "Actualizar precios";
var ITEM_NOT_FOUND = (q) => `No encontr\xE9 el objeto "${q}" \u2014 intenta con el nombre en ingl\xE9s.`;
var NO_RECIPE = (name) => `No pude descomponer **${name}** \u2014 \xBFtiene receta?`;
var CHANNEL_NOT_FOUND = "No pude publicar el proyecto en el canal \u2014 revisa los logs (puede ser permisos del bot o payload rechazado).";
var PROJECT_CREATED = (id, channelId, taskCount) => `\u2705 Proyecto **#${id}** creado en <#${channelId}> con ${taskCount} tareas.`;
var PROJECTS_BASE_URL = (typeof process !== "undefined" ? process.env.PROJECTS_BASE_URL : void 0) ?? "https://qiqirn.tools";
var NEW_PROJECT_CONTENT = (projectId) => `\u{1F6E0} Nuevo proyecto de crafteo:
\u{1F4CB} ${PROJECTS_BASE_URL}/projects/${projectId}`;
var THREAD_PROJECT_CREATED = (userId, taskCount) => `\u{1F4CB} Proyecto creado por ${mentionOrName(userId)} \u2014 ${taskCount} tareas. \xA1Reclama las tuyas arriba!`;
var EMPTY_PROJECT_CREATED = (id) => `Kyah~! Proyecto **#${id}** creado, nyeh. Usa \`/craft add-item id:${id}\` para a\xF1adir piezas, kukuru~!`;
var JOB_NAME = {
  CRP: "Carpintero",
  BSM: "Herrero",
  ARM: "Armero",
  GSM: "Orfebre",
  LTW: "Peletero",
  WVR: "Tejedor",
  ALC: "Alquimista",
  CUL: "Cocinero",
  ANY: "Cualquiera"
};

// src/bot/craftRender.ts
var ITEMS_BASE_URL = (typeof process !== "undefined" ? process.env.PROJECTS_BASE_URL : void 0) ?? "https://qiqirn.tools";
var JOB_EMOJI = {
  CRP: "\u{1FA9A}",
  BSM: "\u2692\uFE0F",
  ARM: "\u{1F6E1}\uFE0F",
  GSM: "\u{1F48E}",
  LTW: "\u{1F9F5}",
  WVR: "\u{1F9F6}",
  ALC: "\u2697\uFE0F",
  CUL: "\u{1F373}",
  ANY: "\u{1F528}"
};
var SOURCE_EMOJI = {
  craft: "\u{1F528}",
  workshop: "\u{1F6E0}",
  market: "\u{1FA99}",
  vendor: "\u{1F3EA}",
  currency: "\u{1F4A0}",
  gather: "\u26CF"
};
function fmtPrice(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function taskLine(t) {
  const done = t.status === "done" ? "\u2705" : "";
  const assignee = t.assigneeId ? mentionOrName(t.assigneeId) : `_${UNCLAIMED}_`;
  const progress = `(${t.qtyDone}/${t.qtyNeeded})`;
  let detail = "";
  if (t.source === "craft" && t.meta?.job) {
    detail = "";
  } else if (t.source === "market" && t.meta?.price) {
    detail = ` \xB7 ~${fmtPrice(t.meta.price)}g`;
    if (t.meta.world) detail += ` \xB7 ${t.meta.world}`;
  } else if (t.source === "vendor" && t.meta?.price) {
    detail = ` \xB7 ${fmtPrice(t.meta.price)}g PNJ`;
  } else if (t.source === "currency" && t.meta?.currency) {
    detail = ` \xB7 ${t.meta.costPerUnit} ${t.meta.currency} c/u`;
  } else if (t.source === "gather" && t.meta?.gatherLevel) {
    detail = ` \xB7 Nv${t.meta.gatherLevel}`;
    if (t.meta.timed) detail += " \u23F0";
  }
  const itemLink = `[**${t.itemName}**](${ITEMS_BASE_URL}/item/${t.itemId})`;
  return `${done} ${t.qtyNeeded}\xD7 ${itemLink} \u2014 ${assignee} ${progress}${detail}`;
}
function sectionKeyFor(t) {
  if (t.source === "craft") {
    const job = t.meta?.job ?? "ANY";
    const jobName = JOB_NAME[job] ?? job;
    return `${SECTION_CRAFT} \u2014 ${JOB_EMOJI[job] ?? "\u{1F528}"} ${jobName}`;
  }
  if (t.source === "workshop") return SECTION_WORKSHOP;
  if (t.source === "market") return SECTION_MARKET;
  if (t.source === "vendor") return SECTION_VENDOR;
  if (t.source === "currency") return SECTION_CURRENCY;
  return SECTION_GATHER;
}
function groupBySection(tasks) {
  const map = /* @__PURE__ */ new Map();
  for (const t of tasks) {
    const sec = sectionKeyFor(t);
    let arr = map.get(sec);
    if (!arr) {
      arr = [];
      map.set(sec, arr);
    }
    arr.push(t);
  }
  return map;
}
function collectPhases(tasks) {
  const map = /* @__PURE__ */ new Map();
  const partOrder = /* @__PURE__ */ new Map();
  const phasesPerPart = /* @__PURE__ */ new Map();
  let nextPartOrder = 0;
  for (const t of tasks) {
    const pk = t.meta?.partKey;
    const pi = t.meta?.phaseIndex;
    if (pk == null || pi == null) continue;
    if (!partOrder.has(pk)) partOrder.set(pk, nextPartOrder++);
    let phaseSet = phasesPerPart.get(pk);
    if (!phaseSet) {
      phaseSet = /* @__PURE__ */ new Set();
      phasesPerPart.set(pk, phaseSet);
    }
    phaseSet.add(pi);
    const key = `${pk}#${pi}`;
    const existing = map.get(key);
    if (existing) {
      existing.total++;
      if (t.status === "done") existing.done++;
    } else {
      map.set(key, {
        partKey: pk,
        phaseIndex: pi,
        total: 1,
        done: t.status === "done" ? 1 : 0
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    const ao = partOrder.get(a.partKey);
    const bo = partOrder.get(b.partKey);
    if (ao !== bo) return ao - bo;
    return a.phaseIndex - b.phaseIndex;
  }).map((p) => ({
    ...p,
    label: `${p.partKey} \xB7 Fase ${p.phaseIndex + 1} de ${phasesPerPart.get(p.partKey).size}`
  }));
}
function filterToPhase(tasks, partKey, phaseIndex) {
  return tasks.filter((t) => {
    if (t.meta?.partKey == null || t.meta?.phaseIndex == null) return true;
    return t.meta.partKey === partKey && t.meta.phaseIndex === phaseIndex;
  });
}
function buildProjectMessage(project, tasks, projectItems) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const isClosed = project.status === "closed";
  const statusTag = isClosed ? PROJECT_STATUS_CLOSED : `${PROJECT_STATUS_OPEN} \xB7 ${doneTasks}/${totalTasks} ${PROJECT_DONE_SUFFIX}`;
  const phases = collectPhases(tasks);
  const hasPhaseNav = phases.length > 1;
  const activePartKey = hasPhaseNav ? project.displayPartKey ?? phases[0].partKey : null;
  const activePhaseIndex = hasPhaseNav ? project.displayPhaseIndex ?? phases[0].phaseIndex : null;
  const visibleTasks = hasPhaseNav && activePartKey != null && activePhaseIndex != null ? filterToPhase(tasks, activePartKey, activePhaseIndex) : tasks;
  const activePhaseLabel = hasPhaseNav ? phases.find((p) => p.partKey === activePartKey && p.phaseIndex === activePhaseIndex)?.label : null;
  const sections = groupBySection(visibleTasks);
  let description = "";
  if (activePhaseLabel) {
    description += `
\u{1F4CD} **${activePhaseLabel}**
`;
  }
  for (const [header, sectionTasks] of sections) {
    description += `
**${header}**
`;
    for (const t of sectionTasks) {
      description += taskLine(t) + "\n";
    }
  }
  let itemsSummary = "";
  if (projectItems && projectItems.length >= 2) {
    itemsSummary = "Items: " + projectItems.map((pi) => `${pi.itemName} \xD7${pi.qty}`).join(" \xB7 ") + "\n";
  }
  const title = isClosed ? `\u2705 [Cerrado] ${project.name}` : `\u{1F6E0}  ${project.name}`;
  const fullDescription = `\`[${statusTag}]\`
${itemsSummary}${description}`;
  const color = isClosed ? 6710886 : 13936984;
  const footer = { text: `Proyecto #${project.id}` };
  const timestamp = new Date(project.createdAt).toISOString();
  const chunks = chunkDescription(fullDescription);
  const builtEmbeds = chunks.map((chunk, i) => {
    const e = { color, description: chunk };
    if (i === 0) e.title = title;
    if (i === chunks.length - 1) {
      e.footer = footer;
      e.timestamp = timestamp;
    }
    return e;
  });
  const components = [];
  if (!isClosed) {
    if (hasPhaseNav) {
      const phaseSelect = {
        type: 3,
        custom_id: `cproj:${project.id}:phase`,
        placeholder: PHASE_SELECT_PLACEHOLDER,
        options: phases.slice(0, 25).map((p) => {
          const isDone = p.total > 0 && p.done === p.total;
          const checkmark = isDone ? " \u2713" : "";
          return {
            label: `${p.label}${checkmark}`.slice(0, 100),
            description: `${p.done}/${p.total} ${PROJECT_DONE_SUFFIX}`.slice(0, 100),
            value: `${p.partKey}#${p.phaseIndex}`,
            default: p.partKey === activePartKey && p.phaseIndex === activePhaseIndex
          };
        })
      };
      components.push({ type: 1, components: [phaseSelect] });
    }
    const claimable = visibleTasks.filter((t) => t.status === "open").slice(0, 25);
    if (claimable.length > 0) {
      const selectComponent = {
        type: 3,
        custom_id: `cproj:${project.id}:claim`,
        placeholder: SELECT_PLACEHOLDER,
        options: claimable.map((t) => ({
          label: `${t.qtyNeeded}\xD7 ${t.itemName}`.slice(0, 100),
          description: `${SOURCE_EMOJI[t.source] ?? ""} ${t.source}`.slice(0, 100),
          value: String(t.id)
        }))
      };
      components.push({
        type: 1,
        components: [selectComponent]
      });
    }
    const buttons = {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `cproj:${project.id}:progress`,
          label: BTN_LOG_PROGRESS,
          style: 1
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:done`,
          label: BTN_MARK_DONE,
          style: 3
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:unclaim`,
          label: BTN_UNCLAIM,
          style: 2
        },
        {
          type: 2,
          custom_id: `cproj:${project.id}:refresh`,
          label: BTN_REFRESH,
          style: 2
        }
      ]
    };
    components.push(buttons);
  }
  return { embeds: builtEmbeds, components };
}
var PER_CHUNK_LIMIT = 3900;
var TOTAL_LIMIT = 5500;
function chunkDescription(text) {
  if (text.length <= PER_CHUNK_LIMIT) return [text];
  const lines = text.split("\n");
  const chunks = [];
  let current = "";
  let pushed = 0;
  let truncated = false;
  for (const line of lines) {
    const candidate = current ? `${current}
${line}` : line;
    if (candidate.length <= PER_CHUNK_LIMIT && pushed + candidate.length <= TOTAL_LIMIT) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      pushed += current.length;
    }
    if (pushed + line.length > TOTAL_LIMIT) {
      truncated = true;
      break;
    }
    current = line;
  }
  if (current && !truncated) chunks.push(current);
  if (truncated) {
    const marker = `

_${PROJECT_TRUNCATED}_`;
    if (chunks.length === 0) {
      chunks.push(marker.trimStart());
    } else {
      const lastIdx = chunks.length - 1;
      const otherPushed = pushed - chunks[lastIdx].length;
      const budget = Math.min(
        PER_CHUNK_LIMIT - marker.length,
        TOTAL_LIMIT - otherPushed - marker.length
      );
      if (chunks[lastIdx].length > budget) {
        chunks[lastIdx] = chunks[lastIdx].slice(0, Math.max(0, budget));
      }
      chunks[lastIdx] = chunks[lastIdx] + marker;
    }
  }
  return chunks;
}
function buildBoardMessage(openProjects) {
  let description;
  if (openProjects.length === 0) {
    description = `_${BOARD_EMPTY}_`;
  } else {
    const lines = openProjects.map(({ project, tasks }) => {
      const done = tasks.filter((t) => t.status === "done").length;
      const total = tasks.length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const bar = "\u2588".repeat(Math.round(pct / 10)) + "\u2591".repeat(10 - Math.round(pct / 10));
      const thread = project.threadId ? ` \xB7 <#${project.threadId}>` : "";
      const requester = ` \xB7 ${mentionOrName(project.createdBy)}`;
      return `**#${project.id}** ${project.name}
${bar} ${pct}% (${done}/${total} ${PROJECT_TASKS_SUFFIX})${thread}${requester}`;
    });
    description = lines.join("\n\n");
  }
  if (description.length > 4e3) {
    description = description.slice(0, 3950) + `

_${BOARD_TRUNCATED}_`;
  }
  const embed = {
    color: 13936984,
    title: BOARD_TITLE,
    description,
    footer: { text: BOARD_FOOTER },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { embeds: [embed], components: [] };
}

// src/bot/discordApi.ts
var BASE = "https://discord.com/api/v10";
function headers(botToken) {
  return { "Content-Type": "application/json", Authorization: `Bot ${botToken}` };
}
async function sendToChannel(botToken, channelId, payload) {
  const res = await fetch(`${BASE}/channels/${channelId}/messages`, { method: "POST", headers: headers(botToken), body: JSON.stringify(payload) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[discord] sendToChannel ${channelId} \u2192 ${res.status}:`, detail.slice(0, 800));
    return null;
  }
  return res.json();
}
async function editMessage(botToken, channelId, messageId, payload) {
  await fetch(`${BASE}/channels/${channelId}/messages/${messageId}`, { method: "PATCH", headers: headers(botToken), body: JSON.stringify(payload) });
}
async function createThread(botToken, channelId, messageId, name) {
  const res = await fetch(`${BASE}/channels/${channelId}/messages/${messageId}/threads`, { method: "POST", headers: headers(botToken), body: JSON.stringify({ name, auto_archive_duration: 10080 }) });
  if (!res.ok) return null;
  return res.json();
}
async function getChannel(botToken, channelId) {
  const res = await fetch(`${BASE}/channels/${channelId}`, { headers: headers(botToken) });
  if (!res.ok) {
    console.error(`[discord] getChannel ${channelId} \u2192 ${res.status}`);
    return null;
  }
  const data = await res.json();
  return { id: data.id, type: data.type, name: data.name };
}
async function createForumPost(botToken, channelId, name, payload) {
  const threadPayload = {
    name,
    auto_archive_duration: 10080,
    message: payload
  };
  const res = await fetch(`${BASE}/channels/${channelId}/threads`, {
    method: "POST",
    headers: headers(botToken),
    body: JSON.stringify(threadPayload)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[discord] createForumPost ${channelId} \u2192 ${res.status}:`, detail.slice(0, 800));
    throw new Error(`Discord ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

// src/bot/craftCommands.ts
function initialDisplayPhase(tasks) {
  for (const t of tasks) {
    if (t.meta?.partKey != null && t.meta?.phaseIndex != null) {
      return { partKey: t.meta.partKey, phaseIndex: t.meta.phaseIndex };
    }
  }
  return null;
}
async function handleCraftNew(opts, guildId, channelId, userId, deps) {
  if (!opts.item && opts.itemId == null) {
    if (!opts.name) {
      return { content: "Nyeh~! Se requiere un nombre cuando no se especifica objeto, kukuru.", flags: 64 };
    }
    let targetChannelId2 = deps.craftChannelId ?? channelId;
    try {
      const guildConfig = await deps.store.getGuildConfig(guildId);
      if (guildConfig) {
        targetChannelId2 = guildConfig.craftChannelId;
      }
    } catch (e) {
      console.warn("[craft] failed to fetch guild config, using fallback", e instanceof Error ? e.message : e);
    }
    const projectId2 = await deps.store.createProject({
      guildId,
      channelId: targetChannelId2,
      name: opts.name,
      targetItemId: 0,
      targetQty: 0,
      createdBy: userId
    });
    return { content: EMPTY_PROJECT_CREATED(projectId2), flags: 64 };
  }
  const qty = opts.qty ?? 1;
  let itemId;
  let itemName;
  if (opts.itemId != null) {
    itemId = opts.itemId;
    itemName = deps.snapshots.namesById.get(opts.itemId) ?? `Item #${opts.itemId}`;
  } else {
    const matches = searchItems(deps.nameIndex, opts.item, 1);
    if (matches.length === 0) {
      return { content: ITEM_NOT_FOUND(opts.item), flags: 64 };
    }
    itemId = matches[0].id;
    itemName = matches[0].name;
  }
  const projectName = opts.name ?? `${qty}\xD7 ${itemName}`;
  const craftIntermediates = opts.intermediates ?? true;
  console.log(`[craft] new project: ${projectName} (item ${itemId}, qty ${qty})`);
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const preExplode = explode(itemId, qty, recipes, { craftIntermediates });
  const allLeafIds = [...preExplode.leaves.keys()];
  console.log(`[craft] using pre-fetched market for ${allLeafIds.length} leaf items\u2026`);
  const market = deps.marketBundle;
  const breakdown = buildBreakdown(
    itemId,
    qty,
    market,
    { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
    { craftIntermediates }
  );
  const allTasks = [...breakdown.crafts, ...breakdown.acquire];
  if (allTasks.length === 0) {
    return { content: NO_RECIPE(itemName), flags: 64 };
  }
  let targetChannelId = deps.craftChannelId ?? channelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) {
      targetChannelId = guildConfig.craftChannelId;
    }
  } catch (e) {
    console.warn("[craft] failed to fetch guild config, using fallback", e instanceof Error ? e.message : e);
  }
  const channelInfo = await getChannel(deps.botToken, targetChannelId);
  const isForumChannel = channelInfo?.type === 15;
  const initial = initialDisplayPhase(allTasks);
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: projectName,
    targetItemId: itemId,
    targetQty: qty,
    createdBy: userId,
    displayPartKey: initial?.partKey ?? null,
    displayPhaseIndex: initial?.phaseIndex ?? null
  });
  await deps.store.addTasks(projectId, allTasks);
  const project = await deps.store.getProject(projectId);
  if (!project) {
    return { content: "Failed to create project", flags: 64 };
  }
  const storedTasks = await deps.store.getTasks(projectId);
  const { embeds, components } = buildProjectMessage(project, storedTasks);
  const roleId = opts.pingRole ?? deps.crafterRoleId;
  let content = "";
  if (roleId) content = `<@&${roleId}> `;
  content += NEW_PROJECT_CONTENT(projectId);
  if (isForumChannel) {
    let forumPost = null;
    try {
      forumPost = await createForumPost(
        deps.botToken,
        targetChannelId,
        projectName.slice(0, 100),
        {
          content,
          embeds,
          components,
          allowed_mentions: roleId ? { roles: [roleId] } : void 0
        }
      );
    } catch (e) {
      return { content: `No se pudo crear el post en el foro \u2014 ${e instanceof Error ? e.message : String(e)}`, flags: 64 };
    }
    if (!forumPost) {
      return { content: "No se pudo crear el post en el foro", flags: 64 };
    }
    const threadId = String(forumPost.id);
    await deps.store.setProjectThreadId(projectId, threadId);
    const threadMsg = THREAD_PROJECT_CREATED(userId, storedTasks.length);
    try {
      await sendToChannel(deps.botToken, threadId, { content: threadMsg });
    } catch (e) {
      console.error("[craft] failed to send forum post message:", e instanceof Error ? e.message : e);
    }
  } else {
    const announcementMsg = await sendToChannel(deps.botToken, targetChannelId, {
      content,
      embeds,
      components,
      allowed_mentions: roleId ? { roles: [roleId] } : void 0
    });
    if (!announcementMsg) {
      return { content: CHANNEL_NOT_FOUND, flags: 64 };
    }
    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(projectId, messageId);
    try {
      const thread = await createThread(
        deps.botToken,
        targetChannelId,
        messageId,
        projectName.slice(0, 100)
      );
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(projectId, threadId);
        const threadMsg = THREAD_PROJECT_CREATED(userId, storedTasks.length);
        await sendToChannel(deps.botToken, threadId, { content: threadMsg });
      }
    } catch (e) {
      console.error("[craft] failed to create thread:", e instanceof Error ? e.message : e);
    }
  }
  if (!isForumChannel) {
    await refreshBoard(deps, guildId);
  }
  console.log(`[craft] project #${projectId} created with ${storedTasks.length} tasks`);
  return {
    content: PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
    projectId,
    taskCount: storedTasks.length
  };
}
async function handleCraftNewFromList(opts, guildId, channelId, userId, deps) {
  const { resolved, unmatched } = resolveItemsByName(deps.nameIndex, opts.items);
  if (resolved.length === 0) {
    return { content: ITEM_NOT_FOUND(opts.items.map((i) => i.name).join(", ")), flags: 64, unmatched };
  }
  let targetChannelId = deps.craftChannelId ?? channelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) targetChannelId = guildConfig.craftChannelId;
  } catch (e) {
    console.warn("[craft] failed to fetch guild config, using fallback", e instanceof Error ? e.message : e);
  }
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: opts.name,
    targetItemId: 0,
    targetQty: 0,
    createdBy: userId
  });
  for (const r of resolved) {
    await deps.store.addProjectItem(projectId, r.itemId, r.itemName, r.qty);
  }
  const projectItems = await deps.store.getProjectItems(projectId);
  const tasks = buildTasksForProjectItems(projectItems, deps);
  if (tasks.length === 0) {
    return { content: NO_RECIPE(resolved[0].itemName), flags: 64, unmatched };
  }
  await deps.store.addTasks(projectId, tasks);
  const initial = initialDisplayPhase(tasks);
  if (initial) {
    await deps.store.setProjectDisplayPhase(projectId, initial.partKey, initial.phaseIndex);
  }
  const project = await deps.store.getProject(projectId);
  if (!project) return { content: "Failed to create project", flags: 64, unmatched };
  const storedTasks = await deps.store.getTasks(projectId);
  const piSummary = projectItems.map((pi) => ({ itemName: pi.itemName, qty: pi.qty }));
  const { embeds, components } = buildProjectMessage(project, storedTasks, piSummary);
  const roleId = deps.crafterRoleId;
  let content = "";
  if (roleId) content = `<@&${roleId}> `;
  content += NEW_PROJECT_CONTENT(projectId);
  const channelInfo = await getChannel(deps.botToken, targetChannelId);
  const isForumChannel = channelInfo?.type === 15;
  if (isForumChannel) {
    let forumPost = null;
    try {
      forumPost = await createForumPost(deps.botToken, targetChannelId, opts.name.slice(0, 100), {
        content,
        embeds,
        components,
        allowed_mentions: roleId ? { roles: [roleId] } : void 0
      });
    } catch (e) {
      return { content: `No se pudo crear el post en el foro \u2014 ${e instanceof Error ? e.message : String(e)}`, flags: 64, projectId, taskCount: storedTasks.length, unmatched };
    }
    if (forumPost) {
      const threadId = String(forumPost.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      try {
        await sendToChannel(deps.botToken, threadId, { content: THREAD_PROJECT_CREATED(userId, storedTasks.length) });
      } catch (e) {
        console.error("[craft] failed to send forum post message:", e instanceof Error ? e.message : e);
      }
    }
  } else {
    const announcementMsg = await sendToChannel(deps.botToken, targetChannelId, {
      content,
      embeds,
      components,
      allowed_mentions: roleId ? { roles: [roleId] } : void 0
    });
    if (!announcementMsg) {
      return { content: CHANNEL_NOT_FOUND, flags: 64, projectId, taskCount: storedTasks.length, unmatched };
    }
    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(projectId, messageId);
    try {
      const thread = await createThread(deps.botToken, targetChannelId, messageId, opts.name.slice(0, 100));
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(projectId, threadId);
        await sendToChannel(deps.botToken, threadId, { content: THREAD_PROJECT_CREATED(userId, storedTasks.length) });
      }
    } catch (e) {
      console.error("[craft] failed to create thread:", e instanceof Error ? e.message : e);
    }
  }
  if (!isForumChannel) {
    await refreshBoard(deps, guildId);
  }
  console.log(`[craft] list project #${projectId} created with ${storedTasks.length} tasks (${unmatched.length} unmatched)`);
  return {
    content: PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
    projectId,
    taskCount: storedTasks.length,
    unmatched
  };
}
function mergeTasks(tasks) {
  const map = /* @__PURE__ */ new Map();
  for (const t of tasks) {
    const key = `${t.itemId}|${t.source}`;
    const existing = map.get(key);
    if (existing) {
      existing.qtyNeeded += t.qtyNeeded;
    } else {
      map.set(key, { ...t });
    }
  }
  return [...map.values()];
}
function buildTasksForProjectItems(projectItems, deps) {
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;
  const raw = [];
  for (const pi of projectItems) {
    const bd = buildBreakdown(
      pi.itemId,
      pi.qty,
      market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true }
    );
    raw.push(...bd.crafts, ...bd.acquire);
  }
  return mergeTasks(raw);
}
function resolveItemsByName(nameIndex, items) {
  const resolved = [];
  const unmatched = [];
  for (const it of items) {
    const matches = searchItems(nameIndex, it.name, 1);
    if (matches.length === 0) {
      unmatched.push(it.name);
      continue;
    }
    resolved.push({ itemId: matches[0].id, itemName: matches[0].name, qty: it.qty });
  }
  return { resolved, unmatched };
}
async function refreshBoard(deps, guildId) {
  let channelId = deps.craftChannelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) {
      channelId = guildConfig.craftChannelId;
    }
  } catch (e) {
    console.warn("[craft] failed to fetch guild config in refreshBoard", e instanceof Error ? e.message : e);
  }
  if (!channelId) return;
  const channelInfo = await getChannel(deps.botToken, channelId);
  if (channelInfo?.type === 15) {
    return;
  }
  try {
    const projects = await deps.store.listOpenProjects(guildId);
    const projectsWithTasks = await Promise.all(
      projects.map(async (p) => ({
        project: p,
        tasks: await deps.store.getTasks(p.id)
      }))
    );
    const { embeds } = buildBoardMessage(projectsWithTasks);
    const state = await deps.store.getChannelState(guildId, channelId);
    if (state?.boardMessageId) {
      try {
        await editMessage(deps.botToken, channelId, state.boardMessageId, { embeds });
        return;
      } catch {
      }
    }
    const msg = await sendToChannel(deps.botToken, channelId, { embeds });
    if (msg) {
      const msgId = String(msg.id);
      await deps.store.upsertChannelState({
        guildId,
        channelId,
        boardMessageId: msgId,
        requestMessageId: state?.requestMessageId ?? null
      });
    }
  } catch (e) {
    console.error("[craft] failed to refresh board:", e instanceof Error ? e.message : e);
  }
}

// src/api/_projects-core.ts
function getAllowList() {
  return (process.env.GUILD_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function isAllowed(guildId) {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}
function computeTaskCounts(tasks) {
  const byStatus = { open: 0, claimed: 0, done: 0 };
  const bySource = {
    craft: 0,
    workshop: 0,
    market: 0,
    vendor: 0,
    currency: 0,
    gather: 0
  };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    bySource[t.source] = (bySource[t.source] ?? 0) + 1;
  }
  return { byStatus, bySource };
}
var nameCache = /* @__PURE__ */ new Map();
async function fetchDisplayName(guildId, userId, botToken) {
  const cacheKey = `${guildId}:${userId}`;
  const cached2 = nameCache.get(cacheKey);
  if (cached2) return cached2;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` }
    });
    if (r.ok) {
      const m = await r.json();
      const name = m.nick ?? m.user?.global_name ?? m.user?.username ?? userId;
      nameCache.set(cacheKey, name);
      return name;
    }
  } catch {
  }
  try {
    const r = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` }
    });
    if (r.ok) {
      const u = await r.json();
      const name = u.global_name ?? u.username ?? userId;
      nameCache.set(cacheKey, name);
      return name;
    }
  } catch {
  }
  nameCache.set(cacheKey, userId);
  return userId;
}
async function resolveNames(guildId, userIds) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!token || unique.length === 0) return Object.fromEntries(unique.map((id) => [id, id]));
  const entries = await Promise.all(unique.map(async (id) => [id, await fetchDisplayName(guildId, id, token)]));
  return Object.fromEntries(entries);
}
async function listProjectSummaries(store, guildId, statusFilter) {
  let projects = await store.listOpenProjects(guildId);
  if (statusFilter === "closed") projects = [];
  const userIdSet = /* @__PURE__ */ new Set();
  const summaries = await Promise.all(projects.map(async (p) => {
    const tasks = await store.getTasks(p.id);
    userIdSet.add(p.createdBy);
    for (const t of tasks) if (t.assigneeId) userIdSet.add(t.assigneeId);
    return {
      id: p.id,
      name: p.name,
      targetItemId: p.targetItemId,
      targetQty: p.targetQty,
      createdBy: p.createdBy,
      threadId: p.threadId,
      status: p.status,
      createdAt: p.createdAt,
      taskCounts: computeTaskCounts(tasks)
    };
  }));
  const userNames = await resolveNames(guildId, userIdSet);
  return { projects: summaries, userNames };
}
async function getProjectDetail(store, id) {
  const project = await store.getProject(id);
  if (!project || !isAllowed(project.guildId)) return null;
  const [tasks, rawProjectItems] = await Promise.all([
    store.getTasks(id),
    store.getProjectItems(id)
  ]);
  const userIds = [project.createdBy, ...tasks.map((t) => t.assigneeId).filter((x) => x != null)];
  const userNames = await resolveNames(project.guildId, userIds);
  const projectItems = rawProjectItems.map(({ itemName, qty }) => ({ itemName, qty }));
  return {
    project: {
      id: project.id,
      name: project.name,
      targetItemId: project.targetItemId,
      targetQty: project.targetQty,
      createdBy: project.createdBy,
      threadId: project.threadId,
      status: project.status,
      createdAt: project.createdAt
    },
    tasks,
    userNames,
    projectItems
  };
}

// src/api/plugin-projects.ts
var storePromise = null;
function getStore() {
  const injected = globalThis.__testCraftStore;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}
async function loadMarketCache() {
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {}, region: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return { phantom: {}, dc: {}, region: {} };
    return await res.json();
  } catch {
    return { phantom: {}, dc: {}, region: {} };
  }
}
async function buildCreateDeps(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "qiqirn.tools";
  const baseUrl = `${proto}://${host}`;
  const [store, snapshots, cache] = await Promise.all([
    getStore(),
    loadSnapshots(baseUrl),
    loadMarketCache()
  ]);
  const nameIndex = buildNameIndex(snapshots.namesById);
  const marketBundle = { phantom: cache.phantom ?? {}, dc: cache.dc ?? {}, region: cache.region ?? {} };
  return {
    store,
    snapshots,
    nameIndex,
    marketBundle,
    botToken: process.env.DISCORD_BOT_TOKEN ?? "",
    appId: process.env.DISCORD_APP_ID ?? "",
    world: process.env.HOME_WORLD ?? "Phantom",
    dc: process.env.HOME_DC ?? "Chaos",
    region: process.env.REGION ?? "Europe",
    craftChannelId: process.env.CRAFT_CHANNEL_ID || void 0,
    crafterRoleId: process.env.CRAFTER_ROLE_ID || void 0
  };
}
async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const url = req.url ?? "";
  if (req.method === "GET") {
    const store = await getStore();
    const detailMatch = /\/api\/plugin\/projects\/(\d+)/.exec(url);
    if (detailMatch) {
      const detail = await getProjectDetail(store, Number(detailMatch[1]));
      if (!detail) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(detail);
    }
    const guildId = req.query?.guild ?? "";
    if (!guildId) return res.status(400).json({ error: "Missing guild query param" });
    if (!isAllowed(guildId)) return res.status(403).json({ error: "Guild not in allow-list" });
    const statusFilter = req.query?.status ?? "open";
    return res.status(200).json(await listProjectSummaries(store, guildId, statusFilter));
  }
  if (req.method === "POST") {
    const { guildId, itemId, qty, name, characterName, intermediates, items } = req.body ?? {};
    if (Array.isArray(items)) {
      if (!guildId || !characterName || !name) {
        return res.status(400).json({ error: "Missing required fields: guildId, name, characterName" });
      }
      if (!isAllowed(String(guildId))) {
        return res.status(403).json({ error: "Guild not in allow-list" });
      }
      const validItems = items.map((it) => ({ name: String(it?.name ?? "").trim(), qty: Number(it?.qty) })).filter((it) => it.name.length > 0 && Number.isInteger(it.qty) && it.qty >= 1 && it.qty <= 99999);
      if (validItems.length === 0) {
        return res.status(400).json({ error: "No valid items in list" });
      }
      const deps2 = await buildCreateDeps(req);
      const result2 = await handleCraftNewFromList(
        { name: String(name), items: validItems },
        String(guildId),
        "",
        String(characterName),
        deps2
      );
      if (typeof result2.projectId === "number") {
        return res.status(200).json({ ok: true, projectId: result2.projectId, taskCount: result2.taskCount ?? 0, unmatched: result2.unmatched ?? [] });
      }
      return res.status(200).json({ ok: false, error: result2.content ?? "Could not create project", unmatched: result2.unmatched ?? [] });
    }
    if (!guildId || itemId == null || qty == null || !characterName) {
      return res.status(400).json({ error: "Missing required fields: guildId, itemId, qty, characterName" });
    }
    if (!isAllowed(String(guildId))) {
      return res.status(403).json({ error: "Guild not in allow-list" });
    }
    const qtyNum = Number(qty);
    const itemIdNum = Number(itemId);
    if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) {
      return res.status(400).json({ error: "Invalid itemId" });
    }
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 99999) {
      return res.status(400).json({ error: "qty must be between 1 and 99999" });
    }
    const deps = await buildCreateDeps(req);
    const result = await handleCraftNew(
      { itemId: itemIdNum, qty: qtyNum, name: name ?? null, intermediates: intermediates ?? true },
      String(guildId),
      "",
      String(characterName),
      deps
    );
    if (typeof result.projectId === "number") {
      return res.status(200).json({
        ok: true,
        projectId: result.projectId,
        taskCount: result.taskCount ?? 0
      });
    }
    return res.status(200).json({ ok: false, error: result.content ?? "Could not create project" });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
export {
  handler as default
};
