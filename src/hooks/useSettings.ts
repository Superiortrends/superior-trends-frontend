import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../lib/api';
import type { SystemSettings } from '../lib/api';

export const SETTINGS_KEY = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSettings,
    staleTime: 30_000, // short cache so Admin → Settings changes show up quickly on the storefront
    refetchOnWindowFocus: true,
  });
}

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Delivery rules from Admin → Settings. Use this everywhere the storefront mentions
 * free shipping, the delivery fee or delivery time, so one change updates every page.
 */
export function useDeliverySettings() {
  const { data } = useSettings();

  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
  };

  const threshold = num(data?.free_shipping_threshold, 50);
  const charge = num(data?.shipping_charge, 1);
  const days = data?.estimated_delivery_days || '3-5';
  const codAllowed = data?.cod_allowed !== 'false';

  /** Shipping fee for a given subtotal (same rule as the server) */
  const shippingFor = (subtotal: number) => (subtotal <= 0 || subtotal >= threshold ? 0 : charge);

  /** "3-5" → "3–5" (Arabic digits when lang is 'ar') */
  const daysLabel = (lang: string) => {
    const pretty = days.replace('-', '–');
    return lang === 'ar' ? pretty.replace(/\d/g, (d) => AR_DIGITS[Number(d)]) : pretty;
  };

  return { threshold, charge, days, codAllowed, shippingFor, daysLabel };
}

export function useSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<SystemSettings>) => updateSettings(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: ['cart'] }); // Force dynamic cart totals recalculation
    },
  });
}
