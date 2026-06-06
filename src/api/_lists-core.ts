import type { CraftStore } from '../bot/craftStore';
import type { NewListItem } from '../bot/craftTypes';

export interface CoreResult {
  status: number;
  body: unknown;
}

const MAX_NAME = 120;
const MAX_ITEMS = 200;

function sanitizeItems(raw: unknown): NewListItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const out: NewListItem[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const itemId = Number(o.itemId);
    const qty = Number(o.qty);
    const itemName = String(o.itemName ?? '').trim();
    if (!Number.isInteger(itemId) || itemId <= 0) return null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99999) return null;
    if (itemName.length === 0) return null;
    out.push({ itemId, itemName, qty, isHq: !!o.isHq });
  }
  return out;
}

function sanitizeName(raw: unknown): string | null {
  const name = String(raw ?? '').trim();
  if (name.length === 0 || name.length > MAX_NAME) return null;
  return name;
}

export async function handleCreateList(
  store: CraftStore, ownerId: string, body: { name?: unknown; items?: unknown },
): Promise<CoreResult> {
  const name = sanitizeName(body?.name);
  const items = sanitizeItems(body?.items);
  if (!name) return { status: 400, body: { error: 'List name is required' } };
  if (!items) return { status: 400, body: { error: 'List must have 1–200 valid items' } };
  const id = await store.createList(ownerId, name, items);
  return { status: 201, body: { id } };
}

export async function handleListLists(store: CraftStore, ownerId: string): Promise<CoreResult> {
  const lists = await store.listListsForOwner(ownerId);
  return { status: 200, body: { lists } };
}

export async function handleGetList(store: CraftStore, id: string): Promise<CoreResult> {
  const list = await store.getList(id);
  if (!list) return { status: 404, body: { error: 'List not found' } };
  return { status: 200, body: list };
}

export async function handleUpdateList(
  store: CraftStore, id: string, ownerId: string,
  body: { name?: unknown; items?: unknown },
): Promise<CoreResult> {
  const existing = await store.getList(id);
  if (!existing) return { status: 404, body: { error: 'List not found' } };
  if (existing.ownerId !== ownerId) return { status: 403, body: { error: 'Not your list' } };

  if (body?.name !== undefined) {
    const name = sanitizeName(body.name);
    if (!name) return { status: 400, body: { error: 'Invalid name' } };
    await store.updateListMeta(id, ownerId, name);
  }
  if (body?.items !== undefined) {
    const items = sanitizeItems(body.items);
    if (!items) return { status: 400, body: { error: 'Invalid items' } };
    await store.replaceListItems(id, ownerId, items);
  }
  const updated = await store.getList(id);
  return { status: 200, body: updated };
}

export async function handleDeleteList(
  store: CraftStore, id: string, ownerId: string,
): Promise<CoreResult> {
  const existing = await store.getList(id);
  if (!existing) return { status: 404, body: { error: 'List not found' } };
  if (existing.ownerId !== ownerId) return { status: 403, body: { error: 'Not your list' } };
  await store.deleteList(id, ownerId);
  return { status: 200, body: { ok: true } };
}
