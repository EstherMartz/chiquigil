import { useQuery } from '@tanstack/react-query';
import { loadStaticWhatsNewSnapshot, type WhatsNewData } from '../../lib/staticSnapshots';

export interface WhatsNewSnapshot extends WhatsNewData {
  bakedAt: number | null;
}

const EMPTY: WhatsNewSnapshot = { bakedAt: null, prevBakedAt: null, newItems: [], newRecipeItems: [] };

export function useWhatsNewSnapshot() {
  return useQuery<WhatsNewSnapshot>({
    queryKey: ['whatsNewSnapshot'],
    staleTime: Infinity,
    queryFn: async () => {
      const bundle = await loadStaticWhatsNewSnapshot();
      if (!bundle) return EMPTY;
      return { bakedAt: bundle.bakedAt, ...bundle.data };
    },
  });
}
