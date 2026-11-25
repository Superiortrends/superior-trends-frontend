/** Shared React Query settings for fast repeat visits */
export const CATALOG_STALE_MS = 5 * 60 * 1000;
export const CATALOG_GC_MS = 30 * 60 * 1000;
export const STOREFRONT_PRODUCT_LIMIT = 200;

/**
 * Storefront: cached for 5 min, but anything invalidated (e.g. after an admin edit)
 * is refetched on next mount (default refetchOnMount: true respects invalidation).
 */
export const catalogQueryOptions = {
  staleTime: CATALOG_STALE_MS,
  gcTime: CATALOG_GC_MS,
};

/** Admin screens: always show current data when opened. */
export const adminQueryOptions = {
  staleTime: 0,
  gcTime: CATALOG_GC_MS,
  refetchOnMount: 'always' as const,
};
