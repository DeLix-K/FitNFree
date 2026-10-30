import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { logWorkoutOn } from './streaks';
import { addPending, normalizePending, removePending, resolveLogDate } from './watchSync';
import { subscribeWatchRequests, watchSupported } from './watchBridge';
import { refreshWidgetSnapshot } from './widgetRefresh';

// Acts on "Log today's workout" taps made on the Apple Watch. The watch queues the request and iOS delivers it when this app runs; the days
// are kept in on-device storage until they are saved, so a dropped connection does not lose a tap. Logging a day twice changes nothing.
// Only a signed-in person's phone acts on requests, and signing out clears anything still waiting.

const PENDING_KEY = 'watch.pendingWorkoutDays.v1';

async function readPending(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return normalizePending(raw ? JSON.parse(raw) : [], new Date());
  } catch {
    return [];
  }
}

async function writePending(days: string[]): Promise<void> {
  try {
    if (days.length) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(days));
    else await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage unavailable: the tap is still tried once now, it just will not be retried later.
  }
}

let flushing: Promise<void> | null = null;

// Saves every waiting day; a day that fails stays waiting for the next try (app opened, or another request).
export function flushWatchRequests(): Promise<void> {
  flushing ??= (async () => {
    try {
      let saved = false;
      for (const day of await readPending()) {
        try {
          await logWorkoutOn(day);
          await writePending(removePending(await readPending(), day, new Date()));
          saved = true;
        } catch {
          break; // offline or signed out: keep the rest, try again later
        }
      }
      if (saved) await refreshWidgetSnapshot().catch(() => {}); // updates the widget and sends the watch its new numbers
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

async function accept(date: string): Promise<void> {
  const day = resolveLogDate(date, new Date());
  if (!day) return; // a stale request: ignored
  await writePending(addPending(await readPending(), day, new Date()));
  await flushWatchRequests();
}

export function useWatchRequests(signedIn: boolean, authLoading: boolean): void {
  useEffect(() => {
    if (!watchSupported || authLoading) return;
    if (!signedIn) {
      writePending([]).catch(() => {});
      return;
    }
    const stop = subscribeWatchRequests((request) => {
      accept(request.date).catch(() => {});
    });
    flushWatchRequests().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushWatchRequests().catch(() => {});
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [signedIn, authLoading]);
}
