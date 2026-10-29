import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { detectWeightUnit, logExerciseSet, todayLocalDate } from '../lib/exercises';
import { shareRecordIfOn } from '../lib/friendsApi';
import { evaluateSet, type PrResult, type SetRow } from '../lib/prBadges';
import { DEFAULT_REST, type RestSettings } from '../lib/reminderPlan';
import { loadRestSettings, saveRestSettings, startRest } from '../lib/restTimer';
import { dark } from '../lib/theme';
import type { ExerciseSetLog } from '../lib/types';
import { markTrainedToday } from '../lib/workoutReminders';
import { RestSetup } from './RestTimerBar';
import TactileNumberStepper from './TactileNumberStepper';

// `priorSets` is everything already logged for this exercise, used to spot a personal record. It is null when the history could not be loaded
// in full, in which case no record is announced (a missing list must never make an ordinary set look like a PR).
export default function LogSetCard({ exerciseId, onLogged, priorSets }: { exerciseId: string; onLogged: () => void; priorSets: ExerciseSetLog[] | null }) {
  const [unit, setUnit] = useState<'kg' | 'lb'>(detectWeightUnit());
  const [weight, setWeight] = useState(unit === 'kg' ? 20 : 45);
  const [reps, setReps] = useState(8);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);
  const [rest, setRest] = useState<RestSettings>(DEFAULT_REST);
  const [pr, setPr] = useState<PrResult | null>(null);
  const loggedHere = useRef<SetRow[]>([]); // sets logged on this page, in case the history has not reloaded between two quick sets

  useEffect(() => {
    loadRestSettings().then(setRest).catch(() => {});
  }, []);

  const changeRest = (next: RestSettings) => {
    setRest(next);
    saveRestSettings(next).catch(() => {});
  };

  const handleLog = async () => {
    setSaving(true);
    setError(null);
    setPr(null);
    try {
      const next: SetRow = { weight, weight_unit: unit, reps, logged_date: todayLocalDate(), created_at: new Date().toISOString() };
      const verdict = priorSets ? evaluateSet([...priorSets, ...loggedHere.current], next) : null;
      await logExerciseSet({ exerciseId, weight, weightUnit: unit, reps });
      loggedHere.current.push(next);
      if (verdict && (verdict.baseline || verdict.prs.length > 0)) {
        setPr(verdict);
        if (verdict.prs.length > 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          // Only if the person switched on sharing records with friends; never waits on or breaks logging.
          shareRecordIfOn(exerciseId, next, verdict.prs).catch(() => {});
        }
      }
      markTrainedToday().catch(() => {});
      if (rest.seconds > 0) startRest(rest.seconds, rest.notify);
      setJustLogged(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onLogged();
      setTimeout(() => setJustLogged(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🏋️ Log a Set</Text>

      <View style={styles.unitRow}>
        <Pressable style={[styles.unitChip, unit === 'kg' && styles.unitChipActive]} onPress={() => setUnit('kg')}>
          <Text style={[styles.unitChipText, unit === 'kg' && styles.unitChipTextActive]}>kg</Text>
        </Pressable>
        <Pressable style={[styles.unitChip, unit === 'lb' && styles.unitChipActive]} onPress={() => setUnit('lb')}>
          <Text style={[styles.unitChipText, unit === 'lb' && styles.unitChipTextActive]}>lb</Text>
        </Pressable>
      </View>

      <View style={styles.stepperRow}>
        <View style={styles.stepperCol}>
          <Text style={styles.stepperLabel}>Weight</Text>
          <TactileNumberStepper value={weight} step={unit === 'kg' ? 2.5 : 5} min={0} suffix={unit} onChange={setWeight} />
        </View>
        <View style={styles.stepperCol}>
          <Text style={styles.stepperLabel}>Reps</Text>
          <TactileNumberStepper value={reps} step={1} min={1} onChange={setReps} />
        </View>
      </View>

      <RestSetup settings={rest} onChange={changeRest} />

      <Pressable style={styles.logButton} onPress={handleLog} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#0a0a0a" size="small" />
        ) : (
          <Text style={styles.logButtonText}>{justLogged ? '✓ Set Logged!' : 'Log Set'}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {pr && pr.prs.length > 0 ? (
        <View style={styles.prBanner} accessibilityRole="alert">
          <Text style={styles.prTitle}>🏆 New personal record!</Text>
          {pr.prs.map((p) => (
            <Text key={p.kind} style={styles.prLine}>
              {p.text}
            </Text>
          ))}
        </View>
      ) : null}
      {pr && pr.baseline ? (
        <View style={styles.baselineBanner}>
          <Text style={styles.baselineText}>📌 First set logged for this exercise. That is your starting point; beat it next time to earn a PR.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  title: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  unitChip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  unitChipActive: {
    borderColor: dark.accent,
    backgroundColor: dark.surfaceElevated,
  },
  unitChipText: {
    color: dark.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  unitChipTextActive: {
    color: dark.accent,
  },
  stepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 14,
    marginBottom: 16,
  },
  stepperCol: {
    alignItems: 'center',
  },
  stepperLabel: {
    color: dark.textFaint,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  logButton: {
    backgroundColor: dark.accent,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 14,
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    marginTop: 8,
  },
  prBanner: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.accent,
    backgroundColor: dark.surfaceElevated,
    borderRadius: 14,
    padding: 12,
  },
  prTitle: {
    color: dark.accent,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  prLine: {
    color: dark.text,
    fontSize: 13,
    marginTop: 2,
  },
  baselineBanner: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 14,
    padding: 12,
  },
  baselineText: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
