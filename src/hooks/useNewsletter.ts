import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  subscribeNewsletter,
  getNewsletterSubscribersAdmin,
  deleteNewsletterSubscriberAdmin,
} from '../lib/api';
import { useAdminAuth } from './useAdminAuth';
import { adminQueryOptions } from '../lib/queryConfig';

export interface NewsletterSubscriber {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export const NEWSLETTER_ADMIN_KEY = ['newsletter', 'admin'] as const;

/** Storefront: footer + homepage sign-up forms */
export function useSubscribeNewsletter() {
  return useMutation({ mutationFn: subscribeNewsletter });
}

export function useNewsletterSubscribersAdmin() {
  const { isAdmin, authReady } = useAdminAuth();
  return useQuery<NewsletterSubscriber[]>({
    queryKey: NEWSLETTER_ADMIN_KEY,
    queryFn: getNewsletterSubscribersAdmin,
    enabled: authReady && isAdmin,
    ...adminQueryOptions,
    refetchInterval: 60_000,
  });
}

export function useRemoveNewsletterSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNewsletterSubscriberAdmin,
    onSuccess: () => qc.invalidateQueries({ queryKey: NEWSLETTER_ADMIN_KEY }),
  });
}

/** Error text from an API failure (falls back to a generic message) */
export function newsletterErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return msg || fallback;
}
