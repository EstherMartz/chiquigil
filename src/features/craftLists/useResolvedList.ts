import { useMemo } from 'react';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { resolveList, type ResolvedList, type ListInput } from './resolveList';

export function useResolvedList(inputs: ListInput[]): { ready: boolean; resolved: ResolvedList | null } {
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(true);
  const gathering = useGatheringCatalog();
  const vendor = useVendorShopSnapshot();
  const shop = useSpecialShopSnapshot();

  const itemsById = useMemo(() => {
    const m = new Map<number, import('../../lib/itemSnapshot').SnapshotItem>();
    if (snapshot.data) for (const it of snapshot.data.items) m.set(it.id, it);
    return m;
  }, [snapshot.data]);

  const ready = !!(snapshot.data && recipes.data && gathering.data);

  const resolved = useMemo(() => {
    if (!ready) return null;
    return resolveList(inputs, {
      recipes: recipes.data!,
      gathering: gathering.data!,
      vendorMap: vendor.data?.snapshot ?? new Map<number, number>(),
      specialShop: shop.data?.snapshot ?? { byCurrency: new Map() },
      itemsById,
    });
  }, [ready, inputs, recipes.data, gathering.data, vendor.data, shop.data, itemsById]);

  return { ready, resolved };
}
