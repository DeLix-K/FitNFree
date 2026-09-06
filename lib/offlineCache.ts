import AsyncStorage from '@react-native-async-storage/async-storage';

// Generic best-effort local snapshot cache. Deliberately not a queue or a
// sync engine -- this is offline-mode v1: "let a user see their real last-
// known data with no signal," not full offline read/write support. Never
// throws outward; a caching failure should never block the live data path
// that already works today.
const PREFIX = 'fitnfree_cache_v1_';

export async function saveCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, cachedAt: new Date().toISOString() }));
  } catch {
    // Best-effort.
  }
}

export async function loadCache<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as { data: T; cachedAt: string };
  } catch {
    return null;
  }
}

export function formatCacheAge(cachedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
