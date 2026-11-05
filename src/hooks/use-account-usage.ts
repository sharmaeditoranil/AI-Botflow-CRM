'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccountUsageInfo } from '@/lib/billing/limits';

const USAGE_UPDATED_EVENT = 'account-usage-updated';

let cachedUsage: AccountUsageInfo | null = null;
let inflightPromise: Promise<AccountUsageInfo | null> | null = null;

async function fetchUsageFromApi(): Promise<AccountUsageInfo | null> {
  if (inflightPromise) return inflightPromise;
  inflightPromise = fetch('/api/billing/usage', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return cachedUsage;
      const data = (await res.json()) as AccountUsageInfo;
      cachedUsage = data;
      return data;
    })
    .catch(() => cachedUsage)
    .finally(() => {
      inflightPromise = null;
    });
  return inflightPromise;
}

/**
 * Trigger a global refresh of account usage across all mounted components
 * (Sidebar, Contacts banner, Dashboard, etc.)
 */
export function notifyAccountUsageUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USAGE_UPDATED_EVENT));
  }
}

export function useAccountUsage() {
  const [usageInfo, setUsageInfo] = useState<AccountUsageInfo | null>(cachedUsage);
  const [loading, setLoading] = useState<boolean>(!cachedUsage);

  const refresh = useCallback(async () => {
    const data = await fetchUsageFromApi();
    if (data) {
      setUsageInfo(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const handleUpdate = () => {
      void refresh();
    };

    window.addEventListener(USAGE_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(USAGE_UPDATED_EVENT, handleUpdate);
    };
  }, [refresh]);

  const plan = usageInfo?.plan ?? null;
  const planName = plan?.name || 'Free Trial';
  const planSlug = plan?.slug || 'trial';
  const maxContacts = plan?.max_contacts ?? 100;
  const usedContacts = usageInfo?.usage?.contacts ?? 0;
  const remainingContacts = Math.max(0, maxContacts - usedContacts);
  const isUnlimited = planSlug === 'founder' || maxContacts >= 999999;

  const rawPercent = maxContacts > 0 ? (usedContacts / maxContacts) * 100 : 0;
  const usedPercent = Math.min(
    100,
    rawPercent > 0 && rawPercent < 1 ? Number(rawPercent.toFixed(1)) : Math.round(rawPercent)
  );

  const isNearLimit = !isUnlimited && usedPercent >= 80 && usedContacts < maxContacts;
  const isAtOrOverLimit = !isUnlimited && usedContacts >= maxContacts;

  return {
    usageInfo,
    loading,
    refresh,
    plan,
    planName,
    planSlug,
    maxContacts,
    usedContacts,
    remainingContacts,
    usedPercent,
    isUnlimited,
    isNearLimit,
    isAtOrOverLimit,
  };
}
