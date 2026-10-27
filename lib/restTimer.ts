import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { DEFAULT_REST, REST_ADD_SECONDS, extendRest, restRemaining, sanitizeRest, type RestSettings } from './reminderPlan';
import { hasNotificationPermission, requestNotificationPermission } from './wakeAlarm';

// The rest timer that starts after a set is logged. It is one shared timer for the whole app, so it keeps counting when you move to another
// exercise. It ends with a vibration if the app is open; with "notify" on it also sends a LOCAL notification so it rings with the phone locked.
// Everything stays on the phone. (The time is kept as a finish time, not a count of ticks, so a late tick never makes it drift.)

const SETTINGS_KEY = 'fitnfree.restTimer.v1';
const NOTIFICATION_ID = 'fitnfree-rest-timer';
const CHANNEL_ID = 'rest-timer';
const notificationsSupported = Platform.OS !== 'web';

type Running = { endAt: number; startedAt: number; totalSec: number } | null;

let running: Running = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let notifyOn = false;
let watching = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => running;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250] });
}

async function cancelNotification(): Promise<void> {
  if (!notificationsSupported) return;
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
}

async function scheduleNotification(endAt: number): Promise<void> {
  if (!notificationsSupported || !notifyOn) return;
  try {
    if (!(await hasNotificationPermission())) return;
    await ensureChannel();
    await cancelNotification();
    const seconds = Math.max(1, Math.round((endAt - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: { title: 'Rest over ⏱️', body: 'Ready for your next set.', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
    });
  } catch {
    /* the in-app timer still works without the notification */
  }
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

// The rest ran out. `inApp` is true when this happened while the app was open, which is when to buzz; if the finish time passed while the phone
// was locked, the notification already did the alerting and buzzing now would only be confusing.
function finish(inApp: boolean) {
  clearTimer();
  if (!running) return;
  running = null;
  emit();
  cancelNotification().catch(() => {});
  if (inApp && Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

function arm() {
  clearTimer();
  if (!running) return;
  const ms = Math.max(0, running.endAt - Date.now());
  timer = setTimeout(() => finish(true), ms);
}

function watchAppState() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active' || !running) return;
    if (running.endAt <= Date.now()) finish(false);
    else arm(); // timers can be paused while the app is in the background; set it again from the real finish time
  });
}

// Starts (or restarts) a rest of `seconds`. `notify` says whether to also schedule the local notification.
export function startRest(seconds: number, notify: boolean): void {
  if (!(seconds > 0)) return;
  watchAppState();
  const now = Date.now();
  running = { endAt: now + seconds * 1000, startedAt: now, totalSec: seconds };
  notifyOn = notify;
  emit();
  arm();
  if (notify) scheduleNotification(running.endAt).catch(() => {});
  else cancelNotification().catch(() => {});
}

export function addRestTime(addSec: number = REST_ADD_SECONDS): void {
  if (!running) return;
  const now = Date.now();
  const endAt = extendRest(running.endAt, now, addSec);
  running = { ...running, endAt, totalSec: Math.max(running.totalSec, Math.ceil((endAt - running.startedAt) / 1000)) };
  emit();
  arm();
  if (notifyOn) scheduleNotification(endAt).catch(() => {});
}

export function skipRest(): void {
  finish(false);
}

// The running rest as a number of seconds left (0 if none), updating about four times a second while it runs.
export function useRestTimer(): { active: boolean; remaining: number; total: number; progress: number } {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!current) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [current]);
  if (!current) return { active: false, remaining: 0, total: 0, progress: 0 };
  const remaining = restRemaining(current.endAt, now);
  const total = Math.max(1, Math.round((current.endAt - current.startedAt) / 1000));
  return { active: true, remaining, total, progress: Math.min(1, Math.max(0, 1 - (current.endAt - now) / (total * 1000))) };
}

// ── Settings ────────────────────────────────────────────────────────────────────────────────────────
export async function loadRestSettings(): Promise<RestSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? sanitizeRest(JSON.parse(raw)) : DEFAULT_REST;
  } catch {
    return DEFAULT_REST;
  }
}

export async function saveRestSettings(settings: RestSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeRest(settings)));
}

export const restNotificationsSupported = notificationsSupported;

// Turning "notify" on is the moment to ask for notification permission. Returns whether it is allowed.
export async function ensureRestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  await ensureChannel().catch(() => {});
  return (await hasNotificationPermission()) || (await requestNotificationPermission());
}
