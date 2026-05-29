import { loadSnapshots } from '../bot/loadSnapshots';

interface ItemSearchResult {
  id: number;
  name: string;
  hasRecipe: boolean;
  rarity: number;
}

interface ItemsResponse {
  items: ItemSearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = (req.query.q ?? '').toLowerCase().trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const baseUrl = process.env.VITE_APP_URL ?? 'https://qiqirn.tools';
  const snapshots = await loadSnapshots(baseUrl);

  const matches: ItemSearchResult[] = [];
  for (const [itemId, item] of snapshots.itemsById) {
    if (item.name.toLowerCase().includes(q)) {
      matches.push({
        id: itemId,
        name: item.name,
        hasRecipe: snapshots.recipes.has(itemId),
        rarity: item.rarity || 0,
      });
    }
  }

  // Sort by exact match first, then by name
  matches.sort((a, b) => {
    const aExact = a.name.toLowerCase() === q ? 0 : 1;
    const bExact = b.name.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.name.localeCompare(b.name);
  });

  const total = matches.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = matches.slice(start, end);

  res.setHeader('Cache-Control', 'public, max-age=600');
  return res.status(200).json({
    items,
    total,
    page,
    pageSize,
  });
}

export { handler as default };
