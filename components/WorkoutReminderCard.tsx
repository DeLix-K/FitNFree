import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DAY_LABELS, DEFAULT_REMINDERS, timeLabel, type ReminderSettings } from '../lib/reminderPlan';
import { dark } from '../lib/theme';
import { hasNotificationPermission, requestNotificationPermission } from '../lib/wakeAlarm';
import { describeNextReminder, loadReminderSettings, refreshWorkoutReminders, saveReminderSettings, workoutRemindersSupported } from '../lib/workoutReminders';

// Monday first, as the week is usually read; the numbers are the day numbers used by the planner (0 = Sunday).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Workout reminders: pick the days and a time, and the phone reminds you. Local notifications only, planned two weeks ahead each time the app opens,
// and skipped for a day you have already trained.
export default function WorkoutReminderCard() {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);

  const apply = useCallback(async (s: ReminderSettings) => {
    await saveReminderSettings(s);
    await refreshWorkoutReminders();
    setNext(await describeNextReminder(s));
  }, []);

  useEffect(() => {
    loadReminderSettings()
      .then(async (s) => {
        setSettings(s);
        setNext(await describeNextReminder(s));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const change = async (patch: Partial<ReminderSettings>) => {
    const s = { ...settings, ...patch };
    if (s.days.length === 0) s.enabled = false; // no days means there is nothing to remind about
    setSettings(s);
    setError(null);
    try {
      await apply(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = async (on: boolean) => {
    if (!on) return change({ enabled: false });
    setBusy(true);
    setError(null);
    try {
      const granted = (await hasNotificationPermission()) || (await requestNotificationPermission());
      if (!granted) {
        setError('Notifications are off for FitNFree. Turn them on in your phone settings to get workout reminders.');
        return;
      }
      await change({ enabled: true, days: settings.days.length ? settings.days : DEFAULT_REMINDERS.days });
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (d: number) => change({ days: settings.days.includes(d) ? settings.days.filter((x) => x !== d) : [...settings.days, d].sort((a, b) => a - b) });
  const stepHour = (delta: number) => change({ hour: (settings.hour + delta + 24) % 24 });
  const stepMinute = (delta: number) => change({ minute: (settings.minute + delta + 60) % 60 });

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🔔 Workout reminders</Text>
        {workoutRemindersSupported ? <Switch value={settings.enabled} onValueChange={toggle} disabled={busy} trackColor={{ true: dark.accent, false: dark.border }} accessibilityLabel="Workout reminders" /> : null}
      </View>
      {!workoutRemindersSupported ? (
        <Text style={styles.hint}>Workout reminders are sent by your phone, so they are in the iPhone and Android app, not the website.</Text>
      ) : (
        <>
          <Text style={styles.hint}>A nudge on the days you choose. It is skipped on a day you have already trained.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Days</Text>
          <View style={styles.chips}>
            {WEEK_ORDER.map((d) => (
              <Pressable key={d} style={[styles.chip, settings.days.includes(d) && styles.chipActive]} onPress={() => toggleDay(d)} accessibilityRole="button" accessibilityState={{ selected: settings.days.includes(d) }} accessibilityLabel={DAY_LABELS[d]}>
                <Text style={[styles.chipText, settings.days.includes(d) && styles.chipTextActive]}>{DAY_LABELS[d]}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Time</Text>
          <View style={styles.timeRow}>
            <TimeStepper label="hour" value={String(settings.hour).padStart(2, '0')} onMinus={() => stepHour(-1)} onPlus={() => stepHour(1)} />
            <Text style={styles.colon}>:</Text>
            <TimeStepper label="minute" value={String(settings.minute).padStart(2, '0')} onMinus={() => stepMinute(-5)} onPlus={() => stepMinute(5)} />
            <Text style={styles.timeNote}>{timeLabel(settings.hour, settings.minute)}</Text>
          </View>

          <Text style={styles.status}>
            {settings.enabled ? (next ? `Next reminder: ${next}` : 'No reminder planned in the next two weeks.') : 'Off'}
          </Text>
          {settings.enabled ? <Text style={styles.hint}>Reminders are planned two weeks ahead each time you open the app. If you do not open it for two weeks, they stop.</Text> : null}
        </>
      )}
    </View>
  );
}

function TimeStepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepButton} onPress={onMinus} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Earlier ${label}`}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue} accessibilityLabel={`${label} ${value}`}>
        {value}
      </Text>
      <Pressable style={styles.stepButton} onPress={onPlus} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Later ${label}`}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 16, padding: 18, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: dark.text, fontSize: 15, fontWeight: '700' },
  hint: { color: dark.textFaint, fontSize: 11, marginTop: 4, marginBottom: 6 },
  error: { color: dark.danger, fontSize: 12, marginBottom: 8 },
  label: { color: dark.textMuted, fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: dark.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipActive: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  chipText: { color: dark.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: dark.accent },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colon: { color: dark.text, fontSize: 22, fontWeight: '800' },
  timeNote: { color: dark.textFaint, fontSize: 12, marginLeft: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: dark.border, borderRadius: 12 },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: dark.accent, fontSize: 20, fontWeight: '800' },
  stepValue: { color: dark.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'center' },
  status: { color: dark.text, fontSize: 13, fontWeight: '700', marginTop: 14 },
});
