import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.setHeader('Location', '/login');
  return res.status(302).end();
}

export const config = { api: { bodyParser: false } };
