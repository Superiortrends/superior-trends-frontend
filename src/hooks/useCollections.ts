import { useQuery } from '@tanstack/react-query';
import { getCollections } from '../lib/api';

export interface StoreCollection {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  bannerImage: string;
  mobileBanner?: string | null;
}

/** Public, active collections (each has a banner image) */
export function useCollections() {
  return useQuery<StoreCollection[]>({
    queryKey: ['collections'],
    queryFn: getCollections,
    staleTime: 60_000,
  });
}
