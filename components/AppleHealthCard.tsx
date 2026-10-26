import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { averageOf, formatDuration, sleepNights, type DayTotal, type Night, type WorkoutSummary } from '../lib/healthSummary';
import { deleteImportedSleep, getHealthPrefs, importSleepFromHealth, setHealthConnected, setSleepImport } from '../lib/healthSleepSync';
import type { HealthSource, TodayStats } from '../lib/healthTypes';
import { dark } from '../lib/theme';

// Apple Health on the Wearables screen (iPhone only). Reads steps, active energy, distance, resting heart rate, body weight, sleep and workouts,
// and writes NOTHING back to Health. Reading happens on the phone. Only if the person switches on "Add my sleep to my sleep log" are sleep nights
// copied to their own sleep log; nothing else leaves the phone.

type Data = { today: TodayStats; week: DayTotal[]; night: Night | null; workouts: WorkoutSummary[] };
const dayLabel = (iso: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${iso}T00:00:00`).getDay()];

export default function AppleHealthCard({ source }: { source: HealthSource }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [sleepImport, setSleepImportState] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    setError(null);
    try {
      const [today, week, samples, workouts] = await Promise.all([source.today(), source.stepsLastDays(7), source.sleepSamples(3), source.workouts(14)]);
      setData({ today, week, night: sleepNights(samples)[0] ?? null, workouts });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [source]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [ok, prefs] = await Promise.all([source.available(), getHealthPrefs()]);
      if (!live) return;
      setAvailable(ok);
      setConnected(prefs.connected);
      setSleepImportState(prefs.sleepImport);
      if (ok && prefs.connected) {
        await read();
        if (live && prefs.sleepImport) importSleepFromHealth(source, 14).catch(() => {});
      }
    })();
    return () => {
      live = false;
    };
  }, [source, read]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await source.requestAccess();
      await setHealthConnected(true);
      setConnected(true);
      await read();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSleep = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (!sleepImport) {
        const r = await importSleepFromHealth(source, 14);
        await setSleepImport(true);
        setSleepImportState(true);
        setNote(r.nights === 0 ? 'Sleep import is on. No sleep was found in Health yet.' : `Added ${r.imported} night${r.imported === 1 ? '' : 's'} to your sleep log${r.skipped ? ` (${r.skipped} you logged yourself or got from Oura were left as they were)` : ''}.`);
      } else {
        await setSleepImport(false);
        setSleepImportState(false);
        setNote('Sleep import is off. Nights already added stay in your sleep log until you remove them below.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeImported = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = await deleteImportedSleep();
      setNote(`Removed ${n} night${n === 1 ? '' : 's'} that came from Apple Health.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await setHealthConnected(false);
    setConnected(false);
    setSleepImportState(false);
    setData(null);
    setNote('Disconnected. FitNFree has stopped reading Health. To take back the permission itself, open Settings > Health > Data Access & Devices > FitNFree on your iPhone.');
  };

  if (available === null) return <ActivityIndicator style={{ marginVertical: 16 }} color={dark.accent} />;
  if (!available) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Apple Health</Text>
        <Text style={styles.body}>Apple Health is not available on this device.</Text>
      </View>
    );
  }

  const maxSteps = Math.max(1, ...(data?.week.map((d) => d.value) ?? [1]));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Apple Health</Text>
        <Text style={[styles.status, connected && styles.statusOn]}>{connected ? 'Connected' : 'Not connected'}</Text>
      </View>

      {!connected ? (
        <>
          <Text style={styles.body}>
            See your steps, workouts, heart rate and sleep from Apple Health and your Apple Watch next to your training. FitNFree only reads, and never changes or adds anything in Health.
            You choose exactly what to allow on the next screen.
          </Text>
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={connect} disabled={busy} accessibilityRole="button" accessibilityLabel="Connect Apple Health">
            <Text style={styles.buttonText}>{busy ? 'Connecting…' : 'Connect Apple Health'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          {data ? (
            <>
              <View style={styles.tiles}>
                <Stat label="Steps today" value={data.today.steps.toLocaleString()} />
                <Stat label="Active kcal" value={String(data.today.activeKcal)} />
                <Stat label="Distance" value={`${data.today.distanceKm} km`} />
              </View>
              <View style={styles.tiles}>
                <Stat label="Resting heart rate" value={data.today.restingHr === null ? '–' : `${data.today.restingHr} bpm`} />
                <Stat label="Weight" value={data.today.weightKg === null ? '–' : `${data.today.weightKg} kg`} />
                <Stat label="Last night" value={data.night ? formatDuration(data.night.asleepMinutes) : '–'} />
              </View>

              <Text style={styles.section}>Steps, last 7 days</Text>
              <View style={styles.bars} accessibilityLabel={`Steps over the last 7 days, average ${averageOf(data.week).toLocaleString()} a day`}>
                {data.week.map((d) => (
                  <View key={d.date} style={styles.barCol}>
                    <View style={[styles.bar, { height: Math.max(3, Math.round((d.value / maxSteps) * 60)) }]} />
                    <Text style={styles.barLabel}>{dayLabel(d.date)}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.fine}>Average {averageOf(data.week).toLocaleString()} a day (not counting today).</Text>

              {data.night && data.night.deepMinutes !== null ? (
                <Text style={styles.fine}>
                  Last night: {formatDuration(data.night.asleepMinutes)} asleep, {formatDuration(data.night.deepMinutes)} deep, {formatDuration(data.night.remMinutes ?? 0)} REM.
                </Text>
              ) : null}

              <Text style={styles.section}>Recent workouts</Text>
              {data.workouts.length === 0 ? (
                <Text style={styles.body}>No workouts in the last 2 weeks.</Text>
              ) : (
                data.workouts.slice(0, 5).map((w, i) => (
                  <View key={i} style={styles.workout}>
                    <Text style={styles.workoutName}>{w.label}</Text>
                    <Text style={styles.workoutMeta}>
                      {[w.start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), `${w.minutes} min`, w.kcal ? `${w.kcal} kcal` : null, w.km ? `${w.km} km` : null].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                ))
              )}
              {data.today.steps === 0 && data.week.every((d) => d.value === 0) && data.workouts.length === 0 && !data.night ? (
                <Text style={styles.hint}>Nothing came through. If you expected data, check Settings &gt; Health &gt; Data Access &amp; Devices &gt; FitNFree and make sure the types are switched on. Apple does not tell an app which ones were refused.</Text>
              ) : null}
            </>
          ) : (
            <ActivityIndicator style={{ marginVertical: 12 }} color={dark.accent} />
          )}

          <View style={styles.sleepBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sleepTitle}>Add my sleep to my sleep log</Text>
              <Text style={styles.fine}>Copies your last 2 weeks of nights from Health into your FitNFree sleep log, and keeps them up to date when you open this screen. It never replaces a night you logged yourself or got from Oura. Off by default.</Text>
            </View>
            <Pressable style={[styles.switch, sleepImport && styles.switchOn, busy && styles.disabled]} onPress={toggleSleep} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: sleepImport }} accessibilityLabel="Add my sleep to my sleep log">
              <View style={[styles.knob, sleepImport && styles.knobOn]} />
            </Pressable>
          </View>

          <View style={styles.row}>
            <Pressable style={styles.ghost} onPress={read} disabled={busy} accessibilityRole="button">
              <Text style={styles.ghostText}>Refresh</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={removeImported} disabled={busy} accessibilityRole="button">
              <Text style={styles.ghostText}>Remove imported sleep</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={disconnect} disabled={busy} accessibilityRole="button">
              <Text style={styles.ghostText}>Disconnect</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => Linking.openSettings().catch(() => {})} accessibilityRole="link">
            <Text style={styles.link}>Change what FitNFree can read (iPhone Settings)</Text>
          </Pressable>
        </>
      )}

      {note ? <Text style={styles.note}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.fine}>Your Health data is not used for advertising and is not shared. Steps, workouts, heart rate and weight stay on your phone. Details are in the privacy policy.</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 16, padding: 16, marginBottom: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: dark.text, fontSize: 17, fontWeight: '800' },
  status: { color: dark.textFaint, fontSize: 12, fontWeight: '700' },
  statusOn: { color: dark.accent },
  body: { color: dark.textMuted, fontSize: 13, marginTop: 8, lineHeight: 19 },
  button: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14, minHeight: 46 },
  buttonText: { color: '#0a0a0a', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.6 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, backgroundColor: dark.surfaceElevated, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  statValue: { color: dark.text, fontSize: 16, fontWeight: '800' },
  statLabel: { color: dark.textFaint, fontSize: 10, fontWeight: '700', marginTop: 3, textAlign: 'center', textTransform: 'uppercase' },
  section: { color: dark.text, fontSize: 14, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 82, paddingHorizontal: 4 },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: 16, borderRadius: 4, backgroundColor: dark.accent },
  barLabel: { color: dark.textFaint, fontSize: 10, marginTop: 4 },
  workout: { backgroundColor: dark.surfaceElevated, borderRadius: 10, padding: 10, marginTop: 6 },
  workoutName: { color: dark.text, fontWeight: '700', fontSize: 14 },
  workoutMeta: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  hint: { color: '#fbbf24', fontSize: 12, marginTop: 10, lineHeight: 17 },
  sleepBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: dark.border, marginTop: 16, paddingTop: 14 },
  sleepTitle: { color: dark.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  switch: { width: 52, height: 30, borderRadius: 15, backgroundColor: dark.surfaceElevated, borderWidth: 1, borderColor: dark.border, justifyContent: 'center', padding: 3 },
  switchOn: { backgroundColor: dark.accentDark, borderColor: dark.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: dark.textMuted },
  knobOn: { backgroundColor: '#ffffff', alignSelf: 'flex-end' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  ghost: { borderWidth: 1, borderColor: dark.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
  ghostText: { color: dark.text, fontSize: 12, fontWeight: '700' },
  link: { color: dark.accent, fontSize: 12, fontWeight: '700', marginTop: 12 },
  note: { color: dark.accent, fontSize: 12, marginTop: 12 },
  error: { color: dark.danger, fontSize: 12, marginTop: 12 },
  fine: { color: dark.textFaint, fontSize: 11, marginTop: 8, lineHeight: 16 },
});
