import type { ContentCategory } from './types';

// The five library categories, in display order.
export const CONTENT_CATEGORIES: { value: ContentCategory; label: string; icon: string }[] = [
  { value: 'fitness', label: 'Fitness', icon: '💪' },
  { value: 'weight_management', label: 'Weight Management', icon: '⚖️' },
  { value: 'nutrition', label: 'Nutrition', icon: '🥗' },
  { value: 'wellness', label: 'Wellness', icon: '🧘' },
  { value: 'running', label: 'Running', icon: '🏃' },
];

export const CATEGORY_LABELS = Object.fromEntries(
  CONTENT_CATEGORIES.map((c) => [c.value, c.label])
) as Record<ContentCategory, string>;

export type CategoryFilter = ContentCategory | 'all';

// Chips for the category filter row: "All" first, then the five categories.
export const CATEGORY_FILTER_SEGMENTS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...CONTENT_CATEGORIES.map((c) => ({ value: c.value as CategoryFilter, label: `${c.icon} ${c.label}` })),
];

// How long a freshly released item carries a "New" badge.
const NEW_WINDOW_DAYS = 14;

export function isNewRelease(publishedAt: string): boolean {
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  return ageMs >= 0 && ageMs < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// Newest release first, so the most recently added content is at the top.
export function byNewest<T extends { published_at: string }>(a: T, b: T): number {
  return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
}
