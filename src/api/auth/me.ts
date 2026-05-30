import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  return res.status(200).json({ user });
}

export const config = { api: { bodyParser: false } };
