import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { hasNotificationPermission } from './wakeAlarm';
import { DEFAULT_REMINDERS, describeNext, isReminderId, isoDate, reminderId, reminderText, sanitizeReminders, upcomingReminderTimes, type ReminderSettings } from './reminderPlan';

// Workout reminders: LOCAL notifications only, scheduled on this phone. Nothing is sent from a server and no push token is ever requested.
// The next two weeks are planned one day at a time (see lib/reminderPlan.ts) and re-planned whenever the app opens or a workout is logged,
// so a reminder is dropped for a day you have already trained. If the app is not opened for two weeks, the reminders run out and stop.

export const workoutRemindersSupported = Platform.OS !== 'web';

const SETTINGS_KEY = 'fitnfree.workoutReminders.v1';
const TRAINED_KEY = 'fitnfree.lastTrainedDate.v1';
const CHANNEL_ID = 'workout-reminders';

export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? sanitizeReminders(JSON.parse(raw)) : DEFAULT_REMINDERS;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeReminders(settings)));
}

async function loadTrainedDate(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(TRAINED_KEY);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

// What the settings card shows: when the next reminder is, in words, or null if none is planned (off, no days, or already trained and nothing else this fortnight).
export async function describeNextReminder(settings: ReminderSettings, now: Date = new Date()): Promise<string | null> {
  return describeNext(upcomingReminderTimes(settings, now, await loadTrainedDate()), now);
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: 'Workout reminders', importance: Notifications.AndroidImportance.DEFAULT });
}

// One re-plan at a time, so two quick triggers (opening the app and logging a set) cannot interleave their cancel and schedule steps.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T,>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
};

async function cancelOurs(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((n) => isReminderId(n.identifier)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
}

// Cancels everything planned and plans again from the saved settings. Never asks for permission: if it has not been granted, nothing is scheduled.
// Returns how many reminders are now planned.
export function refreshWorkoutReminders(now: Date = new Date()): Promise<number> {
  if (!workoutRemindersSupported) return Promise.resolve(0);
  return serial(async () => {
    const settings = await loadReminderSettings();
    await cancelOurs();
    if (!settings.enabled || !(await hasNotificationPermission())) return 0;
    const times = upcomingReminderTimes(settings, now, await loadTrainedDate());
    if (times.length === 0) return 0;
    await ensureChannel();
    let planned = 0;
    for (const when of times) {
      try {
        const { title, body } = reminderText(when);
        await Notifications.scheduleNotificationAsync({
          identifier: reminderId(when),
          content: { title, body, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
        });
        planned++;
      } catch {
        /* one failed day should not stop the rest */
      }
    }
    return planned;
  });
}

export function cancelWorkoutReminders(): Promise<void> {
  if (!workoutRemindersSupported) return Promise.resolve();
  return serial(cancelOurs);
}

// Call when the person has trained today (a set logged, or the day logged on the Streaks screen). Today's reminder, if one is still waiting, is removed.
export async function markTrainedToday(now: Date = new Date()): Promise<void> {
  const today = isoDate(now);
  try {
    await AsyncStorage.setItem(TRAINED_KEY, today);
  } catch {
    /* the reminder may still fire; nothing else to do */
  }
  if (!workoutRemindersSupported) return;
  await serial(async () => {
    const id = reminderId(now);
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }).catch(() => {});
}

// Keeps the plan fresh: re-plans when someone is signed in and the app opens or comes back to the front, and clears it when they sign out
// (so the next person on a shared phone is not reminded on someone else's behalf).
export function useWorkoutReminderRefresh(signedIn: boolean, authLoading: boolean): void {
  useEffect(() => {
    if (!workoutRemindersSupported || authLoading) return;
    if (!signedIn) {
      cancelWorkoutReminders().catch(() => {});
      return;
    }
    refreshWorkoutReminders().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshWorkoutReminders().catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn, authLoading]);
}
