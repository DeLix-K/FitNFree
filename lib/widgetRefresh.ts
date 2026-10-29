import { useEffect } from 'react';
import { AppState } from 'react-native';
import { fetchFreezeCoveredDates, fetchLoggedDates, fetchWeeklyTarget, getMyStats } from './streaks';
import { buildSnapshot, startOfWeek, toDateStr } from './widgetSnapshot';
import { publishWidgetSnapshot, widgetsSupported } from './widgetBridge';

// Keeps the home-screen widget up to date: reads the streak, this week's workouts and the weekly target, and hands them to the widget.
// Runs when the app opens, comes back to the foreground, or a workout is logged; erases what the widget shows when the person signs out.
// The widget gets nothing else (see lib/widgetSnapshot.ts), and nothing here is sent anywhere: it stays on the phone in the app's own shared storage.

let running: Promise<void> | null = null;

export function refreshWidgetSnapshot(): Promise<void> {
  if (!widgetsSupported) return Promise.resolve();
  // One refresh at a time; a refresh asked for while one is running just waits for that one (it reads the freshest data when it starts).
  running ??= (async () => {
    try {
      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
      const recentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
      const [stats, week, recent, frozen, target] = await Promise.all([
        getMyStats(),
        fetchLoggedDates(toDateStr(weekStart), toDateStr(weekEnd)),
        fetchLoggedDates(toDateStr(recentStart), toDateStr(now)),
        fetchFreezeCoveredDates(toDateStr(recentStart), toDateStr(now)),
        fetchWeeklyTarget(),
      ]);
      publishWidgetSnapshot(buildSnapshot({ now, currentStreak: stats.currentStreak, weeklyTarget: target, weekLoggedDates: week, recentActiveDates: [...recent, ...frozen] }));
    } finally {
      running = null;
    }
  })();
  return running;
}

export function clearWidgetSnapshot(): void {
  if (widgetsSupported) publishWidgetSnapshot(null);
}

export function useWidgetRefresh(signedIn: boolean, authLoading: boolean): void {
  useEffect(() => {
    if (!widgetsSupported || authLoading) return;
    if (!signedIn) {
      clearWidgetSnapshot();
      return;
    }
    refreshWidgetSnapshot().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshWidgetSnapshot().catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn, authLoading]);
}
