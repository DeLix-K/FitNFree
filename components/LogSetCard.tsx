import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { detectWeightUnit, logExerciseSet } from '../lib/exercises';
import { DEFAULT_REST, type RestSettings } from '../lib/reminderPlan';
import { loadRestSettings, saveRestSettings, startRest } from '../lib/restTimer';
import { dark } from '../lib/theme';
import { markTrainedToday } from '../lib/workoutReminders';
import { RestSetup } from './RestTimerBar';
import TactileNumberStepper from './TactileNumberStepper';

export default function LogSetCard({ exerciseId, onLogged }: { exerciseId: string; onLogged: () => void }) {
  const [unit, setUnit] = useState<'kg' | 'lb'>(detectWeightUnit());
  const [weight, setWeight] = useState(unit === 'kg' ? 20 : 45);
  const [reps, setReps] = useState(8);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);
  const [rest, setRest] = useState<RestSettings>(DEFAULT_REST);

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
    try {
      await logExerciseSet({ exerciseId, weight, weightUnit: unit, reps });
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
});
