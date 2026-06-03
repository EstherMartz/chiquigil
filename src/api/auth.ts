import type { VercelRequest, VercelResponse } from '@vercel/node';
import login from './auth/login';
import callback from './auth/callback';
import me from './auth/me';
import logout from './auth/logout';
import admin from './auth/admin';

// Single serverless function for the whole /api/auth/* surface. Vercel's Hobby
// plan caps a deployment at 12 functions; bundling the four auth endpoints into
// one (dispatched by path) keeps us under the limit. A rewrite in vercel.json
// maps `/api/auth/:action` here, and `req.url` still carries the original path.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.url ?? '').split('?')[0];

  if (path.endsWith('/auth/login')) return login(req, res);
  if (path.endsWith('/auth/callback')) return callback(req, res);
  if (path.endsWith('/auth/me')) return me(req, res);
  if (path.endsWith('/auth/logout')) return logout(req, res);
  if (path.includes('/auth/admin/')) return admin(req, res);

  return res.status(404).json({ error: 'Not found' });
}

export const config = { api: { bodyParser: false } };
