import Database from 'better-sqlite3';
import type { CraftProject, StoredTask, CraftTask, CraftTaskMeta, ChannelState } from './types';

export interface CraftStore {
  createProject(p: {
    guildId: string;
    channelId: string;
    name: string;
    targetItemId: number;
    targetQty: number;
    createdBy: string;
  }): number;
  addTasks(projectId: number, tasks: CraftTask[]): void;
  getProject(id: number): CraftProject | null;
  getTasks(projectId: number): StoredTask[];
  listOpenProjects(guildId: string): CraftProject[];
  claimTask(taskId: number, userId: string): boolean;
  logProgress(taskId: number, userId: string, amount: number): StoredTask | null;
  unclaimTask(taskId: number, userId: string): boolean;
  setProjectMessageId(projectId: number, messageId: string): void;
  setProjectThreadId(projectId: number, threadId: string): void;
  closeProject(projectId: number): void;
  getChannelState(guildId: string, channelId: string): ChannelState | null;
  upsertChannelState(state: ChannelState): void;
  close(): void;
}

export function openCraftStore(dbPath: string): CraftStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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
  `);

  // Migration: add thread_id if upgrading from old schema
  try { db.exec('ALTER TABLE projects ADD COLUMN thread_id TEXT'); } catch { /* already exists */ }

  const insertProject = db.prepare(`
    INSERT INTO projects (guild_id, channel_id, name, target_item_id, target_qty, created_by, created_at)
    VALUES (@guildId, @channelId, @name, @targetItemId, @targetQty, @createdBy, @createdAt)
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (project_id, item_id, item_name, qty_needed, source, meta, updated_at)
    VALUES (@projectId, @itemId, @itemName, @qtyNeeded, @source, @meta, @updatedAt)
  `);

  const selectProject = db.prepare(`SELECT * FROM projects WHERE id = ?`);
  const selectTasks = db.prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY source, item_name`);
  const selectOpenProjects = db.prepare(`SELECT * FROM projects WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC`);
  const updateClaim = db.prepare(`UPDATE tasks SET assignee_id = ?, status = 'claimed', updated_at = ? WHERE id = ? AND status = 'open'`);
  const updateProgress = db.prepare(`UPDATE tasks SET qty_done = ?, status = ?, updated_at = ? WHERE id = ?`);
  const updateUnclaim = db.prepare(`UPDATE tasks SET assignee_id = NULL, status = 'open', updated_at = ? WHERE id = ? AND assignee_id = ?`);
  const updateMessageId = db.prepare(`UPDATE projects SET message_id = ? WHERE id = ?`);
  const updateThreadId = db.prepare(`UPDATE projects SET thread_id = ? WHERE id = ?`);
  const updateClose = db.prepare(`UPDATE projects SET status = 'closed' WHERE id = ?`);
  const selectTask = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const selectChannelState = db.prepare(`SELECT * FROM channel_state WHERE guild_id = ? AND channel_id = ?`);
  const upsertChannelStateStmt = db.prepare(`
    INSERT INTO channel_state (guild_id, channel_id, board_message_id, request_message_id)
    VALUES (@guildId, @channelId, @boardMessageId, @requestMessageId)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET
      board_message_id = @boardMessageId,
      request_message_id = @requestMessageId
  `);

  function rowToProject(row: any): CraftProject {
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      messageId: row.message_id,
      name: row.name,
      targetItemId: row.target_item_id,
      targetQty: row.target_qty,
      createdBy: row.created_by,
      threadId: row.thread_id ?? null,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  function rowToTask(row: any): StoredTask {
    return {
      id: row.id,
      projectId: row.project_id,
      itemId: row.item_id,
      itemName: row.item_name,
      qtyNeeded: row.qty_needed,
      qtyDone: row.qty_done,
      source: row.source,
      meta: row.meta ? JSON.parse(row.meta) : null,
      assigneeId: row.assignee_id,
      status: row.status,
      updatedAt: row.updated_at,
    };
  }

  return {
    createProject(p) {
      const result = insertProject.run({
        guildId: p.guildId,
        channelId: p.channelId,
        name: p.name,
        targetItemId: p.targetItemId,
        targetQty: p.targetQty,
        createdBy: p.createdBy,
        createdAt: Date.now(),
      });
      return Number(result.lastInsertRowid);
    },

    addTasks(projectId, tasks) {
      const now = Date.now();
      const insertMany = db.transaction(() => {
        for (const t of tasks) {
          insertTask.run({
            projectId,
            itemId: t.itemId,
            itemName: t.itemName,
            qtyNeeded: t.qtyNeeded,
            source: t.source,
            meta: t.meta ? JSON.stringify(t.meta) : null,
            updatedAt: now,
          });
        }
      });
      insertMany();
    },

    getProject(id) {
      const row = selectProject.get(id);
      return row ? rowToProject(row) : null;
    },

    getTasks(projectId) {
      return (selectTasks.all(projectId) as any[]).map(rowToTask);
    },

    listOpenProjects(guildId) {
      return (selectOpenProjects.all(guildId) as any[]).map(rowToProject);
    },

    claimTask(taskId, userId) {
      const result = updateClaim.run(userId, Date.now(), taskId);
      return result.changes > 0;
    },

    logProgress(taskId, userId, amount) {
      const row = selectTask.get(taskId) as any;
      if (!row) return null;
      if (row.assignee_id !== userId) return null;

      const newDone = Math.min(row.qty_needed, row.qty_done + amount);
      const newStatus = newDone >= row.qty_needed ? 'done' : 'claimed';
      updateProgress.run(newDone, newStatus, Date.now(), taskId);
      return rowToTask({ ...row, qty_done: newDone, status: newStatus, updated_at: Date.now() });
    },

    unclaimTask(taskId, userId) {
      const result = updateUnclaim.run(Date.now(), taskId, userId);
      return result.changes > 0;
    },

    setProjectMessageId(projectId, messageId) {
      updateMessageId.run(messageId, projectId);
    },

    setProjectThreadId(projectId, threadId) {
      updateThreadId.run(threadId, projectId);
    },

    closeProject(projectId) {
      updateClose.run(projectId);
    },

    getChannelState(guildId, channelId) {
      const row = selectChannelState.get(guildId, channelId) as any;
      if (!row) return null;
      return {
        guildId: row.guild_id,
        channelId: row.channel_id,
        boardMessageId: row.board_message_id,
        requestMessageId: row.request_message_id,
      };
    },

    upsertChannelState(state) {
      upsertChannelStateStmt.run({
        guildId: state.guildId,
        channelId: state.channelId,
        boardMessageId: state.boardMessageId,
        requestMessageId: state.requestMessageId,
      });
    },

    close() {
      db.close();
    },
  };
}
