import { useCallback, useEffect, useState } from 'react';
import { onPremiumChanged } from '../lib/billing';
import { FREE_DAILY_AI_LIMIT, getIsPremium, getTodayAiUsageCount } from '../lib/subscription';

export function useAiGate() {
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [usageToday, setUsageToday] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [premium, count] = await Promise.all([getIsPremium(), getTodayAiUsageCount()]);
    setIsPremium(premium);
    setUsageToday(count);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => onPremiumChanged(() => void refresh()), [refresh]);

  const loaded = isPremium !== null && usageToday !== null;
  const remaining = isPremium ? Infinity : Math.max(0, FREE_DAILY_AI_LIMIT - (usageToday ?? 0));
  // Fail open while status is still loading, so a slow network doesn't block a
  // legitimate request; the real limit is enforced again once loaded.
  const canUse = !loaded || isPremium === true || remaining > 0;

  return { isPremium, usageToday, remaining, canUse, loaded, refresh };
}
