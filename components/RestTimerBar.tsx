import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { REST_ADD_SECONDS, REST_CHOICES, formatRest, type RestSettings } from '../lib/reminderPlan';
import { addRestTime, ensureRestNotificationPermission, restNotificationsSupported, skipRest, useRestTimer } from '../lib/restTimer';
import { dark } from '../lib/theme';

// The running rest countdown. Sits above the exercise page so it stays in view while you scroll, and shows nothing when no rest is running.
export function RestCountdown() {
  const { active, remaining, progress } = useRestTimer();
  if (!active) return null;
  return (
    <View style={styles.bar} accessibilityRole="timer" accessibilityLabel={`Rest, ${formatRest(remaining)} left`}>
      <View style={styles.barTop}>
        <Text style={styles.barLabel}>⏱️ Rest</Text>
        <Text style={styles.barTime}>{formatRest(remaining)}</Text>
        <View style={styles.barButtons}>
          <Pressable style={styles.smallButton} onPress={() => addRestTime()} accessibilityRole="button" accessibilityLabel={`Add ${REST_ADD_SECONDS} seconds`}>
            <Text style={styles.smallText}>+{REST_ADD_SECONDS}s</Text>
          </Pressable>
          <Pressable style={styles.smallButton} onPress={skipRest} accessibilityRole="button" accessibilityLabel="Skip the rest">
            <Text style={styles.smallText}>Skip</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

// "Rest after each set": off, or a length, and whether to also be notified when it ends (so it works with the phone locked).
export function RestSetup({ settings, onChange }: { settings: RestSettings; onChange: (next: RestSettings) => void }) {
  const [error, setError] = useState<string | null>(null);

  const toggleNotify = async (next: boolean) => {
    setError(null);
    if (next) {
      const ok = await ensureRestNotificationPermission();
      if (!ok) {
        setError('Notifications are off for FitNFree. Turn them on in your phone settings to be alerted when the screen is locked.');
        return;
      }
    }
    onChange({ ...settings, notify: next });
  };

  return (
    <View style={styles.setup}>
      <Text style={styles.setupLabel}>Rest timer after each set</Text>
      <View style={styles.chips}>
        <Pressable style={[styles.chip, settings.seconds === 0 && styles.chipActive]} onPress={() => onChange({ ...settings, seconds: 0 })} accessibilityRole="button" accessibilityState={{ selected: settings.seconds === 0 }}>
          <Text style={[styles.chipText, settings.seconds === 0 && styles.chipTextActive]}>Off</Text>
        </Pressable>
        {REST_CHOICES.map((s) => (
          <Pressable key={s} style={[styles.chip, settings.seconds === s && styles.chipActive]} onPress={() => onChange({ ...settings, seconds: s })} accessibilityRole="button" accessibilityState={{ selected: settings.seconds === s }}>
            <Text style={[styles.chipText, settings.seconds === s && styles.chipTextActive]}>{formatRest(s)}</Text>
          </Pressable>
        ))}
      </View>
      {settings.seconds > 0 && restNotificationsSupported ? (
        <View style={styles.notifyRow}>
          <Text style={styles.notifyText}>Alert me when rest ends, even if the screen is locked</Text>
          <Switch value={settings.notify} onValueChange={toggleNotify} trackColor={{ true: dark.accent, false: dark.border }} accessibilityLabel="Alert me when rest ends" />
        </View>
      ) : null}
      {settings.seconds > 0 && !restNotificationsSupported ? <Text style={styles.hint}>The rest timer runs while this page is open. Alerts when the screen is locked are in the phone app.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: dark.surfaceElevated, borderBottomWidth: 1, borderBottomColor: dark.accentDark, paddingHorizontal: 20, paddingVertical: 10 },
  barTop: { flexDirection: 'row', alignItems: 'center' },
  barLabel: { color: '#38bdf8', fontWeight: '800', fontSize: 14, marginRight: 10 },
  barTime: { color: dark.text, fontWeight: '900', fontSize: 28, fontVariant: ['tabular-nums'], flex: 1 },
  barButtons: { flexDirection: 'row', gap: 8 },
  smallButton: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 12, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  smallText: { color: dark.text, fontWeight: '700', fontSize: 13 },
  track: { height: 6, borderRadius: 3, backgroundColor: dark.border, marginTop: 8, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#38bdf8' },
  setup: { marginBottom: 14 },
  setupLabel: { color: dark.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: dark.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  chipActive: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  chipText: { color: dark.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: dark.accent },
  notifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  notifyText: { color: dark.textMuted, fontSize: 12, flex: 1 },
  hint: { color: dark.textFaint, fontSize: 11, marginTop: 8 },
  error: { color: dark.danger, fontSize: 12, marginTop: 8 },
});
