import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, isAdmin } from '../_auth';
import { getStore } from '../_store';
import type { AccessLevel } from '../_access';

const ACCESS_VALUES: AccessLevel[] = ['default', 'allow', 'block'];

function readBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!isAdmin(user.sub)) return res.status(403).json({ error: 'Forbidden' });

  const store = await getStore();
  const path = (req.url ?? '').split('?')[0];

  if (req.method === 'GET' && path.endsWith('/admin/users')) {
    return res.status(200).json({ users: await store.listAppUsers() });
  }

  if (req.method === 'POST' && path.endsWith('/admin/access')) {
    let body: { discordId?: unknown; access?: unknown };
    try { body = JSON.parse(await readBody(req)); }
    catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    const discordId = typeof body.discordId === 'string' ? body.discordId : '';
    const access = body.access as AccessLevel;
    if (!discordId || !ACCESS_VALUES.includes(access)) {
      return res.status(400).json({ error: 'discordId and a valid access level are required' });
    }
    await store.setUserAccess(discordId, access);
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found' });
}

export const config = { api: { bodyParser: false } };
