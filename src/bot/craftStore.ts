import { createClient } from '@libsql/client';
import type { CraftProject, StoredTask, CraftTask, ChannelState } from './craftTypes';

export interface CraftStore {
  createProject(p: {
    guildId: string;
    channelId: string;
    name: string;
    targetItemId: number;
    targetQty: number;
    createdBy: string;
    displayPartKey?: string | null;
    displayPhaseIndex?: number | null;
  }): Promise<number>;
  addTasks(projectId: number, tasks: CraftTask[]): Promise<void>;
  getProject(id: number): Promise<CraftProject | null>;
  getTasks(projectId: number): Promise<StoredTask[]>;
  listOpenProjects(guildId: string): Promise<CraftProject[]>;
  claimTask(taskId: number, userId: string): Promise<boolean>;
  logProgress(taskId: number, userId: string, amount: number): Promise<StoredTask | null>;
  unclaimTask(taskId: number, userId: string): Promise<boolean>;
  setProjectMessageId(projectId: number, messageId: string): Promise<void>;
  setProjectThreadId(projectId: number, threadId: string): Promise<void>;
  setProjectDisplayPhase(projectId: number, partKey: string, phaseIndex: number): Promise<void>;
  closeProject(projectId: number): Promise<void>;
  getChannelState(guildId: string, channelId: string): Promise<ChannelState | null>;
  upsertChannelState(state: ChannelState): Promise<void>;
  close(): Promise<void>;
}

export async function openCraftStore(url: string, authToken?: string): Promise<CraftStore> {
  const isLocal = url === ':memory:' || url.startsWith('file:');
  const client = createClient({
    url: url === ':memory:' ? 'file::memory:' : url,
    ...(isLocal ? {} : { authToken }),
  });

  // Initialize schema
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
  `;

  // Split by semicolon and execute each statement separately
  const statements = SCHEMA.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    await client.execute(stmt);
  }

  // Migration: add thread_id if upgrading from old schema
  try {
    await client.execute('ALTER TABLE projects ADD COLUMN thread_id TEXT');
  } catch {
    // already exists
  }

  // Migration: per-project display state for phase navigation (V2 CompanyCraft UX).
  try {
    await client.execute('ALTER TABLE projects ADD COLUMN display_part_key TEXT');
  } catch {
    // already exists
  }
  try {
    await client.execute('ALTER TABLE projects ADD COLUMN display_phase_index INTEGER');
  } catch {
    // already exists
  }

  function rowToProject(row: Record<string, any>): CraftProject {
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
      status: String(row.status) as 'open' | 'closed',
      createdAt: Number(row.created_at),
      displayPartKey: row.display_part_key ? String(row.display_part_key) : null,
      displayPhaseIndex: row.display_phase_index != null ? Number(row.display_phase_index) : null,
    };
  }

  function rowToTask(row: Record<string, any>): StoredTask {
    const meta = row.meta ? JSON.parse(String(row.meta)) : null;
    return {
      id: Number(row.id),
      projectId: Number(row.project_id),
      itemId: Number(row.item_id),
      itemName: String(row.item_name),
      qtyNeeded: Number(row.qty_needed),
      qtyDone: Number(row.qty_done),
      source: String(row.source) as any,
      meta,
      assigneeId: row.assignee_id ? String(row.assignee_id) : null,
      status: String(row.status) as 'open' | 'claimed' | 'done',
      updatedAt: Number(row.updated_at),
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
          p.displayPhaseIndex ?? null,
        ],
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
            now,
          ],
        });
      }
    },

    async getProject(id) {
      const result = await client.execute({
        sql: 'SELECT * FROM projects WHERE id = ?',
        args: [id],
      });
      const row = result.rows[0];
      return row ? rowToProject(row) : null;
    },

    async getTasks(projectId) {
      const result = await client.execute({
        sql: 'SELECT * FROM tasks WHERE project_id = ? ORDER BY source, item_name',
        args: [projectId],
      });
      return result.rows.map(rowToTask);
    },

    async listOpenProjects(guildId) {
      const result = await client.execute({
        sql: "SELECT * FROM projects WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC",
        args: [guildId],
      });
      return result.rows.map(rowToProject);
    },

    async claimTask(taskId, userId) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'",
        args: [userId, now, taskId],
      });
      return result.rowsAffected > 0;
    },

    async logProgress(taskId, userId, amount) {
      const result = await client.execute({
        sql: 'SELECT * FROM tasks WHERE id = ?',
        args: [taskId],
      });
      const row = result.rows[0];
      if (!row) return null;
      if (String(row.assignee_id) !== userId) return null;

      const qtyNeeded = Number(row.qty_needed);
      const qtyDone = Number(row.qty_done);
      const newDone = Math.min(qtyNeeded, qtyDone + amount);
      const newStatus = newDone >= qtyNeeded ? 'done' : 'claimed';
      const now = Date.now();
      await client.execute({
        sql: 'UPDATE tasks SET qty_done = ?, status = ?, updated_at = ? WHERE id = ?',
        args: [newDone, newStatus, now, taskId],
      });
      return rowToTask({ ...row, qty_done: newDone, status: newStatus, updated_at: now });
    },

    async unclaimTask(taskId, userId) {
      const now = Date.now();
      const result = await client.execute({
        sql: "UPDATE tasks SET assignee_id = NULL, status = 'open', updated_at = ? WHERE id = ? AND assignee_id = ?",
        args: [now, taskId, userId],
      });
      return result.rowsAffected > 0;
    },

    async setProjectMessageId(projectId, messageId) {
      await client.execute({
        sql: 'UPDATE projects SET message_id = ? WHERE id = ?',
        args: [messageId, projectId],
      });
    },

    async setProjectThreadId(projectId, threadId) {
      await client.execute({
        sql: 'UPDATE projects SET thread_id = ? WHERE id = ?',
        args: [threadId, projectId],
      });
    },

    async setProjectDisplayPhase(projectId, partKey, phaseIndex) {
      await client.execute({
        sql: 'UPDATE projects SET display_part_key = ?, display_phase_index = ? WHERE id = ?',
        args: [partKey, phaseIndex, projectId],
      });
    },

    async closeProject(projectId) {
      await client.execute({
        sql: "UPDATE projects SET status = 'closed' WHERE id = ?",
        args: [projectId],
      });
    },

    async getChannelState(guildId, channelId) {
      const result = await client.execute({
        sql: 'SELECT * FROM channel_state WHERE guild_id = ? AND channel_id = ?',
        args: [guildId, channelId],
      });
      const row = result.rows[0];
      if (!row) return null;
      return {
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        boardMessageId: row.board_message_id ? String(row.board_message_id) : null,
        requestMessageId: row.request_message_id ? String(row.request_message_id) : null,
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
          state.requestMessageId,
        ],
      });
    },

    async close() {
      await client.close();
    },
  };
}
