// src/bot/craftStore.ts
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
function genListId() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}
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

    CREATE TABLE IF NOT EXISTS lists (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      item_id   INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      qty       INTEGER NOT NULL,
      is_hq     INTEGER NOT NULL DEFAULT 0,
      position  INTEGER NOT NULL DEFAULT 0
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
    async createList(ownerId, name, items) {
      const id = genListId();
      const now = Date.now();
      const statements2 = [
        {
          sql: "INSERT INTO lists (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          args: [id, ownerId, name, now, now]
        },
        ...items.map((it, i) => ({
          sql: "INSERT INTO list_items (list_id, item_id, item_name, qty, is_hq, position) VALUES (?, ?, ?, ?, ?, ?)",
          args: [id, it.itemId, it.itemName, it.qty, it.isHq ? 1 : 0, i]
        }))
      ];
      await client.batch(statements2, "write");
      return id;
    },
    async getList(id) {
      const head = await client.execute({ sql: "SELECT * FROM lists WHERE id = ?", args: [id] });
      const row = head.rows[0];
      if (!row) return null;
      const itemRows = await client.execute({
        sql: "SELECT * FROM list_items WHERE list_id = ? ORDER BY position ASC",
        args: [id]
      });
      return {
        id: String(row.id),
        ownerId: String(row.owner_id),
        name: String(row.name),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        items: itemRows.rows.map((r) => ({
          id: Number(r.id),
          itemId: Number(r.item_id),
          itemName: String(r.item_name),
          qty: Number(r.qty),
          isHq: Number(r.is_hq) === 1,
          position: Number(r.position)
        }))
      };
    },
    async listListsForOwner(ownerId) {
      const result = await client.execute({
        sql: `
          SELECT l.id, l.name, l.created_at, l.updated_at,
                 (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS item_count
          FROM lists l
          WHERE l.owner_id = ?
          ORDER BY l.updated_at DESC
        `,
        args: [ownerId]
      });
      return result.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        itemCount: Number(r.item_count),
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at)
      }));
    },
    async updateListMeta(id, ownerId, name) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE lists SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
        args: [name, now, id, ownerId]
      });
      return result.rowsAffected > 0;
    },
    async replaceListItems(id, ownerId, items) {
      const owned = await client.execute({
        sql: "SELECT id FROM lists WHERE id = ? AND owner_id = ?",
        args: [id, ownerId]
      });
      if (owned.rows.length === 0) return false;
      const now = Date.now();
      const statements2 = [
        { sql: "DELETE FROM list_items WHERE list_id = ?", args: [id] },
        ...items.map((it, i) => ({
          sql: "INSERT INTO list_items (list_id, item_id, item_name, qty, is_hq, position) VALUES (?, ?, ?, ?, ?, ?)",
          args: [id, it.itemId, it.itemName, it.qty, it.isHq ? 1 : 0, i]
        })),
        { sql: "UPDATE lists SET updated_at = ? WHERE id = ?", args: [now, id] }
      ];
      await client.batch(statements2, "write");
      return true;
    },
    async deleteList(id, ownerId) {
      const owned = await client.execute({
        sql: "SELECT id FROM lists WHERE id = ? AND owner_id = ?",
        args: [id, ownerId]
      });
      if (owned.rows.length === 0) return false;
      await client.batch([
        { sql: "DELETE FROM list_items WHERE list_id = ?", args: [id] },
        { sql: "DELETE FROM lists WHERE id = ?", args: [id] }
      ], "write");
      return true;
    },
    async close() {
      await client.close();
    }
  };
}

// src/api/plugin-claim.ts
function getAllowList() {
  return (process.env.GUILD_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function isAllowed(guildId) {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}
var storePromise = null;
function getStore() {
  const injected = globalThis.__testCraftStore;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { projectId, taskId, characterName, guildId, action, amount } = req.body ?? {};
  if (!projectId || !taskId || !characterName || !guildId) {
    return res.status(400).json({ error: "Missing required fields: projectId, taskId, characterName, guildId" });
  }
  const act = action == null ? "claim" : String(action);
  if (act !== "claim" && act !== "progress" && act !== "complete" && act !== "set") {
    return res.status(400).json({ error: "Invalid action: expected 'claim', 'progress', 'set', or 'complete'" });
  }
  if (act === "progress") {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) {
      return res.status(400).json({ error: "Progress requires a positive integer amount" });
    }
  }
  if (act === "set") {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({ error: "Set requires a non-negative integer amount" });
    }
  }
  if (!isAllowed(String(guildId))) {
    return res.status(403).json({ error: "Guild not in allow-list" });
  }
  const store = await getStore();
  const project = await store.getProject(Number(projectId));
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (project.guildId !== String(guildId)) {
    return res.status(403).json({ error: "Project does not belong to this guild" });
  }
  if (act === "claim") {
    const task2 = await store.claimTaskByCharacter(Number(taskId), String(characterName));
    if (!task2) {
      return res.status(409).json({ error: "Task not found or already claimed" });
    }
    return res.status(200).json({ ok: true, task: task2 });
  }
  const tasks = await store.getTasks(Number(projectId));
  const current = tasks.find((t) => t.id === Number(taskId));
  if (!current) {
    return res.status(404).json({ error: "Task not found in project" });
  }
  const task = act === "set" ? await store.setProgress(Number(taskId), String(characterName), Number(amount)) : await store.logProgress(
    Number(taskId),
    String(characterName),
    act === "complete" ? Math.max(0, current.qtyNeeded - current.qtyDone) : Number(amount)
  );
  if (!task) {
    return res.status(409).json({ error: "Task not claimed by this character" });
  }
  return res.status(200).json({ ok: true, task });
}
export {
  handler as default
};
