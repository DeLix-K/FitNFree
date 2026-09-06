import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Best-effort wake reminder, deliberately NOT marketed as a true "smart
// alarm": a scheduled local notification at the user's target wake time.
// It won't fire if the app has been force-quit on iOS, has no snooze/
// full-screen ringer like a real alarm clock, and doesn't adapt to sleep
// stage in real time (that needs continuous background biometric
// monitoring this app doesn't do). Users should keep a real phone alarm
// as backup -- the UI says so.
const WAKE_NOTIFICATION_ID = 'fitnfree-wake-reminder';
const CHANNEL_ID = 'wake-reminders';

// expo-notifications' scheduling APIs (getAllScheduledNotificationsAsync in
// particular) aren't implemented on web -- rather than crash the web
// preview with a raw native-module error, be upfront that this feature
// only works in the real mobile app.
export const wakeReminderSupported = Platform.OS !== 'web';

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Wake reminders',
    importance: Notifications.AndroidImportance.MAX,
  });
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!wakeReminderSupported) return false;
  const settings = await Notifications.getPermissionsAsync();
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!wakeReminderSupported) return false;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: true },
  });
  return status === 'granted';
}

export async function scheduleWakeReminder(hour: number, minute: number): Promise<void> {
  if (!wakeReminderSupported) return;
  await ensureNotificationChannel();
  // Cancel any previous wake reminder before scheduling the new time --
  // otherwise changing the time would leave duplicates firing.
  await Notifications.cancelScheduledNotificationAsync(WAKE_NOTIFICATION_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: WAKE_NOTIFICATION_ID,
    content: {
      title: '⏰ Wake-up reminder',
      body: "This is a reminder, not a true smart alarm — keep your phone's real alarm as backup.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelWakeReminder(): Promise<void> {
  if (!wakeReminderSupported) return;
  await Notifications.cancelScheduledNotificationAsync(WAKE_NOTIFICATION_ID).catch(() => {});
}

export async function isWakeReminderScheduled(): Promise<boolean> {
  if (!wakeReminderSupported) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((n) => n.identifier === WAKE_NOTIFICATION_ID);
}
