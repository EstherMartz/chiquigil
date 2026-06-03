import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, isAdmin } from '../_auth';
import { decideAccess } from '../_access';
import { getStore } from '../_store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  // Re-check access on every poll so a revoke (block) takes effect on the
  // user's next page load. `guilds` in the JWT are the allow-listed guilds at
  // login time — enough to honor a block/allow override set afterward.
  const store = await getStore();
  const record = await store.getAppUser(user.sub);
  if (!decideAccess({ guildAllowed: (user.guilds?.length ?? 0) > 0, access: record?.access ?? null })) {
    return res.status(401).json({ error: 'Access revoked' });
  }

  return res.status(200).json({ user, isAdmin: isAdmin(user.sub) });
}

export const config = { api: { bodyParser: false } };
