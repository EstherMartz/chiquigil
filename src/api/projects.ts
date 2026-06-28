import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { requireSession } from './_auth';
import { isAllowed, listProjectSummaries, getProjectDetail } from './_projects-core';
import {
  handleCreateList, handleGetList, handleListLists, handleUpdateList, handleDeleteList,
} from './_lists-core';
import { postFeedback as realPostFeedback, type FeedbackCategory, type FeedbackInput } from './_feedback-core';

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

async function handleLists(
  req: VercelRequest, res: VercelResponse, store: CraftStore, ownerId: string, url: string,
): Promise<VercelResponse> {
  const idMatch = /\/api\/lists\/([^/?]+)/.exec(url);
  const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (id) {
    if (req.method === 'GET') return send(res, await handleGetList(store, id));
    if (req.method === 'PUT') return send(res, await handleUpdateList(store, id, ownerId, body));
    if (req.method === 'DELETE') return send(res, await handleDeleteList(store, id, ownerId));
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'GET') return send(res, await handleListLists(store, ownerId));
  if (req.method === 'POST') return send(res, await handleCreateList(store, ownerId, body));
  return res.status(405).json({ error: 'Method not allowed' });
}

function send(res: VercelResponse, r: { status: number; body: unknown }): VercelResponse {
  return res.status(r.status).json(r.body);
}

const FEEDBACK_WINDOW_MS = 60_000;
const FEEDBACK_MAX = 5;
const feedbackHits = new Map<string, number[]>();

function feedbackRateLimited(sub: string): boolean {
  const now = Date.now();
  const recent = (feedbackHits.get(sub) ?? []).filter((t) => now - t < FEEDBACK_WINDOW_MS);
  if (recent.length >= FEEDBACK_MAX) {
    feedbackHits.set(sub, recent);
    return true;
  }
  recent.push(now);
  feedbackHits.set(sub, recent);
  return false;
}

function normalizeCategory(v: unknown): FeedbackCategory {
  return v === 'idea' || v === 'feedback' ? v : 'bug';
}

async function handleFeedback(
  req: VercelRequest, res: VercelResponse, session: { sub: string; username: string },
): Promise<VercelResponse> {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Message is required' });
  if (message.length > 1000) return res.status(400).json({ error: 'Message too long' });
  if (feedbackRateLimited(session.sub)) return res.status(429).json({ error: 'Too many reports — slow down' });

  const channelId = process.env.FEEDBACK_CHANNEL_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) return res.status(500).json({ error: 'Feedback channel not configured' });

  const ctx = (body.context ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const input: FeedbackInput = {
    category: normalizeCategory(body.category),
    message,
    context: {
      path: str(ctx.path, 200),
      build: str(ctx.build, 40),
      userAgent: str(ctx.userAgent, 300),
      viewport: str(ctx.viewport, 20),
    },
    reporter: { sub: session.sub, username: session.username },
  };

  const post = (globalThis as any).__testPostFeedback ?? realPostFeedback;
  try {
    await post({ botToken, channelId }, input);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[feedback] post failed:', e);
    return res.status(502).json({ error: 'Could not send feedback' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  res.setHeader('Cache-Control', 'no-store');
  const url = req.url ?? '';

  // ── Feedback (session-gated, no Turso needed) ──────────────────────────────
  if (url.startsWith('/api/feedback')) {
    return handleFeedback(req, res, session);
  }

  const store = await getStore();

  // ── Crafting Lists (personal, session-owned) ──────────────────────────────
  if (url.startsWith('/api/lists')) {
    return handleLists(req, res, store, session.sub, url);
  }

  // ── Projects (existing, guild-scoped, GET only) ───────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);
  if (detailMatch) {
    const detail = await getProjectDetail(store, Number(detailMatch[1]));
    if (!detail) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(detail);
  }

  const guildId = (req.query?.guild as string | undefined) ?? '';
  if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
  if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });

  const statusFilter = (req.query?.status as string | undefined) ?? 'open';
  const payload = await listProjectSummaries(store, guildId, statusFilter);
  return res.status(200).json(payload);
}
