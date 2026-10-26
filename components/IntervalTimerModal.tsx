import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PRESETS,
  REST_PRESETS,
  buildSchedule,
  cuesBetween,
  describeCue,
  formatClock,
  sanitizeConfig,
  stateAt,
  totalSeconds,
  wholeSeconds,
  type ClockState,
  type Cue,
  type TimerConfig,
} from '../lib/intervalTimer';
import { dark } from '../lib/theme';
import { speak, stopSpeaking } from '../lib/voice';
import TactileNumberStepper from './TactileNumberStepper';

// Tabata, boxing rounds, HIIT, EMOM and a plain rest timer. The timing lives in lib/intervalTimer.ts (tested); this draws it, buzzes on
// each change, can speak the changes aloud, and keeps the screen on while it runs. Nothing is sent anywhere.

type Mode = 'interval' | 'rest';
type PresetId = string;

const STORAGE_KEY = 'fitnfree.intervalTimer.v1';
const TICK_MS = 100;
const KEEP_AWAKE_TAG = 'fitnfree-interval-timer';

const PHASE_STYLE = {
  prepare: { label: 'GET READY', colour: '#fbbf24' },
  work: { label: 'WORK', colour: dark.accent },
  rest: { label: 'REST', colour: '#38bdf8' },
  done: { label: 'DONE', colour: '#ffffff' },
} as const;

const safeHaptic = (fn: () => Promise<void>) => {
  fn().catch(() => {});
};

function buzz(cue: Cue) {
  if (Platform.OS === 'web') return;
  if (cue.kind === 'finish') safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  else if (cue.kind === 'countdown') safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  else if (cue.phase === 'work') safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  else safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export default function IntervalTimerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('interval');
  const [presetId, setPresetId] = useState<PresetId>('tabata');
  const [custom, setCustom] = useState<TimerConfig>({ prepareSec: 10, workSec: 30, restSec: 15, rounds: 6 });
  const [restPresetId, setRestPresetId] = useState('rest-90');
  const [vibrate, setVibrate] = useState(true);
  const [voice, setVoice] = useState(false);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<ClockState | null>(null);

  const startedAtRef = useRef(0); // wall-clock time the current run segment began
  const elapsedBeforeRef = useRef(0); // milliseconds banked before the last pause
  const prevStateRef = useRef<ClockState | null>(null);
  const prefsLoaded = useRef(false);

  const config: TimerConfig = useMemo(() => {
    if (mode === 'rest') return REST_PRESETS.find((p) => p.id === restPresetId)?.config ?? REST_PRESETS[1].config;
    if (presetId === 'custom') return sanitizeConfig(custom);
    return PRESETS.find((p) => p.id === presetId)?.config ?? PRESETS[0].config;
  }, [mode, presetId, restPresetId, custom]);

  const schedule = useMemo(() => buildSchedule(config), [config]);
  const total = totalSeconds(config);

  // Remember the last choices.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw);
        if (typeof s.presetId === 'string' && (s.presetId === 'custom' || PRESETS.some((p) => p.id === s.presetId))) setPresetId(s.presetId);
        if (s.custom) setCustom(sanitizeConfig(s.custom));
        if (typeof s.vibrate === 'boolean') setVibrate(s.vibrate);
        if (typeof s.voice === 'boolean') setVoice(s.voice);
        if (typeof s.restPresetId === 'string' && REST_PRESETS.some((p) => p.id === s.restPresetId)) setRestPresetId(s.restPresetId);
      })
      .catch(() => {})
      .finally(() => {
        prefsLoaded.current = true;
      });
  }, []);
  useEffect(() => {
    if (!prefsLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ presetId, custom, vibrate, voice, restPresetId })).catch(() => {});
  }, [presetId, custom, vibrate, voice, restPresetId]);

  const reset = useCallback(() => {
    setRunning(false);
    setStarted(false);
    setState(null);
    elapsedBeforeRef.current = 0;
    prevStateRef.current = null;
    stopSpeaking();
  }, []);

  // A different choice means a fresh start.
  useEffect(() => {
    reset();
  }, [config, reset]);

  const signal = useCallback(
    (cues: Cue[]) => {
      for (const c of cues) {
        if (vibrate) buzz(c);
        if (voice) speak(describeCue(c));
      }
    },
    [vibrate, voice]
  );

  // The clock. Reads the time from the wall clock on every tick, so it stays right even if a tick is late.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const elapsed = elapsedBeforeRef.current + (Date.now() - startedAtRef.current);
      const next = stateAt(schedule, elapsed, config.rounds);
      const cues = cuesBetween(prevStateRef.current, next);
      prevStateRef.current = next;
      setState(next);
      if (cues.length) signal(cues);
      if (next.done) setRunning(false);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, schedule, config.rounds, signal]);

  // Keep the screen on only while running.
  useEffect(() => {
    if (running && Platform.OS !== 'web') activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      if (Platform.OS !== 'web') deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running]);

  // Closing the window stops everything.
  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const start = () => {
    elapsedBeforeRef.current = 0;
    startedAtRef.current = Date.now();
    const first = stateAt(schedule, 0, config.rounds);
    prevStateRef.current = first;
    setState(first);
    setStarted(true);
    setRunning(true);
    signal(cuesBetween(null, first));
  };
  const pause = () => {
    elapsedBeforeRef.current += Date.now() - startedAtRef.current;
    setRunning(false);
    stopSpeaking();
  };
  const resume = () => {
    startedAtRef.current = Date.now();
    setRunning(true);
  };

  const phaseKey = state ? (state.done ? 'done' : state.phase) : 'work';
  const accent = PHASE_STYLE[phaseKey].colour;
  const finished = !!state && state.done;
  const bigNumber = state && !state.done ? formatClock(state.remainingSec) : state?.done ? '0:00' : formatClock(config.workSec);
  const secondsLeft = state && !state.done ? wholeSeconds(state.remainingSec) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Text style={styles.title}>Interval Clock</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the interval clock" hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {!started ? (
          <ScrollView contentContainerStyle={styles.setup}>
            <View style={styles.chipRow}>
              {(['interval', 'rest'] as Mode[]).map((m) => (
                <Pressable key={m} style={[styles.chip, mode === m && styles.chipActive]} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }}>
                  <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>{m === 'interval' ? 'Intervals' : 'Rest timer'}</Text>
                </Pressable>
              ))}
            </View>

            {mode === 'interval' ? (
              <>
                <Text style={styles.sectionLabel}>Choose a workout</Text>
                {PRESETS.map((p) => (
                  <Pressable key={p.id} style={[styles.presetRow, presetId === p.id && styles.presetRowActive]} onPress={() => setPresetId(p.id)} accessibilityRole="button" accessibilityState={{ selected: presetId === p.id }}>
                    <Text style={styles.presetLabel}>{p.label}</Text>
                    <Text style={styles.presetBlurb}>{p.blurb}</Text>
                  </Pressable>
                ))}
                <Pressable style={[styles.presetRow, presetId === 'custom' && styles.presetRowActive]} onPress={() => setPresetId('custom')} accessibilityRole="button" accessibilityState={{ selected: presetId === 'custom' }}>
                  <Text style={styles.presetLabel}>Custom</Text>
                  <Text style={styles.presetBlurb}>Set your own work, rest and rounds</Text>
                </Pressable>

                {presetId === 'custom' && (
                  <View style={styles.customBox}>
                    {(
                      [
                        ['Get ready', 'prepareSec', 5, 's'],
                        ['Work', 'workSec', 5, 's'],
                        ['Rest', 'restSec', 5, 's'],
                        ['Rounds', 'rounds', 1, ''],
                      ] as const
                    ).map(([label, key, step, suffix]) => (
                      <View key={key} style={styles.customRow}>
                        <Text style={styles.customLabel}>{label}</Text>
                        <TactileNumberStepper value={custom[key]} step={step} min={key === 'workSec' || key === 'rounds' ? 1 : 0} suffix={suffix} onChange={(v) => setCustom((c) => sanitizeConfig({ ...c, [key]: v }))} />
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Rest between sets</Text>
                <View style={styles.chipRow}>
                  {REST_PRESETS.map((p) => (
                    <Pressable key={p.id} style={[styles.chip, restPresetId === p.id && styles.chipActive]} onPress={() => setRestPresetId(p.id)} accessibilityRole="button" accessibilityState={{ selected: restPresetId === p.id }}>
                      <Text style={[styles.chipText, restPresetId === p.id && styles.chipTextActive]}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.summary}>
              {mode === 'rest' ? `Counts down ${formatClock(config.workSec)}.` : `${config.rounds} round${config.rounds === 1 ? '' : 's'} of ${formatClock(config.workSec)}${config.restSec ? `, ${formatClock(config.restSec)} rest` : ''}. Total ${formatClock(total)}.`}
            </Text>

            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, vibrate && styles.chipActive]} onPress={() => setVibrate((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: vibrate }}>
                <Text style={[styles.chipText, vibrate && styles.chipTextActive]}>{vibrate ? '📳 Vibration on' : '📳 Vibration off'}</Text>
              </Pressable>
              <Pressable style={[styles.chip, voice && styles.chipActive]} onPress={() => setVoice((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: voice }}>
                <Text style={[styles.chipText, voice && styles.chipTextActive]}>{voice ? '🔊 Voice on' : '🔈 Voice off'}</Text>
              </Pressable>
            </View>
            <Text style={styles.note}>The screen stays on while the clock runs. If you lock the phone or leave the app, the clock keeps the right time but it cannot buzz or speak.</Text>

            <Pressable style={styles.startButton} onPress={start} accessibilityRole="button" accessibilityLabel="Start the clock">
              <Text style={styles.startButtonText}>Start</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.runBox}>
            <Text style={[styles.phase, { color: accent }]} accessibilityLiveRegion="polite">
              {PHASE_STYLE[phaseKey].label}
            </Text>
            <Text style={[styles.big, { color: accent }]} accessibilityLabel={finished ? 'Finished' : `${secondsLeft} seconds left`}>
              {finished ? 'Done' : bigNumber}
            </Text>
            {mode === 'interval' && state && !finished && state.phase !== 'prepare' ? (
              <Text style={styles.round}>Round {state.round} of {state.rounds}</Text>
            ) : (
              <Text style={styles.round}> </Text>
            )}
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round((state?.progress ?? 0) * 100)}%`, backgroundColor: accent }]} />
            </View>
            <Text style={styles.totalLeft}>{finished ? `Total ${formatClock(total)}` : `Total left ${formatClock(state && !state.done ? state.totalRemainingSec : total)}`}</Text>

            <View style={styles.controls}>
              {finished ? (
                <Pressable style={styles.startButton} onPress={start} accessibilityRole="button">
                  <Text style={styles.startButtonText}>Again</Text>
                </Pressable>
              ) : running ? (
                <Pressable style={styles.controlButton} onPress={pause} accessibilityRole="button">
                  <Text style={styles.controlText}>Pause</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.startButton} onPress={resume} accessibilityRole="button">
                  <Text style={styles.startButtonText}>Resume</Text>
                </Pressable>
              )}
              <Pressable style={styles.controlButton} onPress={reset} accessibilityRole="button">
                <Text style={styles.controlText}>{finished ? 'Change' : 'Stop'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background, paddingTop: Platform.OS === 'ios' ? 56 : 32 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  title: { color: dark.text, fontSize: 22, fontWeight: '800' },
  close: { color: dark.accent, fontSize: 15, fontWeight: '700' },
  setup: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionLabel: { color: dark.textMuted, fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  chipActive: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  chipText: { color: dark.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: dark.accent },
  presetRow: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, marginBottom: 8 },
  presetRowActive: { borderColor: dark.accent },
  presetLabel: { color: dark.text, fontSize: 16, fontWeight: '700' },
  presetBlurb: { color: dark.textFaint, fontSize: 12, marginTop: 2 },
  customBox: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, gap: 12, marginBottom: 8 },
  customRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customLabel: { color: dark.text, fontSize: 15, fontWeight: '600' },
  summary: { color: dark.textMuted, fontSize: 14, marginTop: 16 },
  note: { color: dark.textFaint, fontSize: 12, marginTop: 12 },
  startButton: { backgroundColor: dark.accent, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center', marginTop: 20, minWidth: 140 },
  startButtonText: { color: '#0a0a0a', fontSize: 18, fontWeight: '800' },
  runBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  phase: { fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  big: { fontSize: 112, fontWeight: '900', fontVariant: ['tabular-nums'], marginVertical: 4 },
  round: { color: dark.textMuted, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  barTrack: { width: '100%', height: 10, borderRadius: 5, backgroundColor: dark.surfaceElevated, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  totalLeft: { color: dark.textFaint, fontSize: 14, marginTop: 10 },
  controls: { flexDirection: 'row', gap: 12, marginTop: 28, alignItems: 'center' },
  controlButton: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 28, marginTop: 20, minWidth: 110, alignItems: 'center' },
  controlText: { color: dark.text, fontSize: 16, fontWeight: '700' },
});
