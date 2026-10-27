import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ExerciseVolumeChart from '../components/ExerciseVolumeChart';
import { RestCountdown } from '../components/RestTimerBar';
import FormGuardrailsCard from '../components/FormGuardrailsCard';
import LogSetCard from '../components/LogSetCard';
import MindMuscleCueButton from '../components/MindMuscleCueButton';
import PersonalRecordsCard from '../components/PersonalRecordsCard';
import SubstitutionSection from '../components/SubstitutionSection';
import TrainerVideoPlayer from '../components/TrainerVideoPlayer';
import {
  computePr,
  detectWeightUnit,
  fetchAllExerciseSets,
  primaryMuscle,
  secondaryMuscles,
  volumeByDate,
} from '../lib/exercises';
import { dark } from '../lib/theme';
import type { Exercise, ExerciseSetLog } from '../lib/types';

const FATIGUE_LABEL: Record<string, string> = {
  low: 'Low Fatigue',
  moderate: 'Moderate Fatigue',
  high: 'High Systemic Fatigue',
};

const FATIGUE_COLOR: Record<string, string> = {
  low: '#22d3ee',
  moderate: '#fb923c',
  high: '#f87171',
};

export default function ExerciseDetailScreen({
  exercise,
  allExercises,
  saved,
  onToggleSave,
  onBack,
  onNavigateToExercise,
}: {
  exercise: Exercise;
  allExercises: Exercise[];
  saved: boolean;
  onToggleSave: () => void;
  onBack: () => void;
  onNavigateToExercise: (exercise: Exercise) => void;
}) {
  const [history, setHistory] = useState<ExerciseSetLog[]>([]);
  const [historyComplete, setHistoryComplete] = useState(false); // false until the whole history has loaded; records are not announced before then
  const [loading, setLoading] = useState(true);

  const latestRequest = useRef(0);

  const loadHistory = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const { rows, complete } = await fetchAllExerciseSets(exercise.id);
      if (request !== latestRequest.current) return; // a newer load (or another exercise) has taken over
      setHistory(rows);
      setHistoryComplete(complete);
    } catch {
      if (request !== latestRequest.current) return;
      setHistory([]);
      setHistoryComplete(false);
    }
  }, [exercise.id]);

  useEffect(() => {
    // Moving to another exercise must not leave the last one's sets behind: personal records are worked out from this list.
    setHistory([]);
    setHistoryComplete(false);
    setLoading(true);
    loadHistory().finally(() => setLoading(false));
  }, [loadHistory]);

  const primary = primaryMuscle(exercise);
  const secondary = secondaryMuscles(exercise);
  const pr = computePr(history);
  const volumePoints = volumeByDate(history);
  const unit = history[history.length - 1]?.weight_unit ?? detectWeightUnit();

  return (
    <View style={styles.container}>
    <RestCountdown />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backLink}>‹ Back</Text>
        </Pressable>
        <Pressable onPress={onToggleSave} hitSlop={8}>
          <Text style={styles.saveIcon}>{saved ? '★' : '☆'}</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{exercise.name}</Text>

      <View style={styles.muscleRow}>
        {primary && (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>{primary}</Text>
          </View>
        )}
        {secondary.map((m) => (
          <View key={m} style={styles.secondaryBadge}>
            <Text style={styles.secondaryBadgeText}>{m}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tagRow}>
        <Text style={styles.equipmentTag}>
          {exercise.equipment.length > 0 ? exercise.equipment.join(', ') : 'Bodyweight'}
        </Text>
        {exercise.fatigue_tier && (
          <Text style={[styles.fatigueTag, { color: FATIGUE_COLOR[exercise.fatigue_tier] }]}>
            {FATIGUE_LABEL[exercise.fatigue_tier]}
          </Text>
        )}
        {exercise.low_impact && <Text style={styles.lowImpactTag}>🦵 Joint-Friendly</Text>}
      </View>

      {exercise.video_url ? (
        exercise.video_url.toLowerCase().endsWith('.gif') ? (
          <View style={styles.demoWrap}>
            <Image source={{ uri: exercise.video_url }} style={styles.demoGif} resizeMode="contain" />
          </View>
        ) : (
          <TrainerVideoPlayer uri={exercise.video_url} aspectRatio={4 / 3} autoplay={false} />
        )
      ) : null}

      {exercise.instructions ? (
        <View style={styles.textCard}>
          <Text style={styles.textLabel}>Instructions</Text>
          <Text style={styles.textBody}>{exercise.instructions}</Text>
        </View>
      ) : null}
      {exercise.benefits ? (
        <View style={styles.textCard}>
          <Text style={styles.textLabel}>Benefits</Text>
          <Text style={styles.textBody}>{exercise.benefits}</Text>
        </View>
      ) : null}

      <MindMuscleCueButton key={`cue-${exercise.id}`} exercise={exercise} />

      <FormGuardrailsCard key={`guardrails-${exercise.id}`} exercise={exercise} />

      {loading ? (
        <ActivityIndicator color={dark.accent} style={{ marginVertical: 20 }} />
      ) : (
        <ExerciseVolumeChart pr={pr} volumePoints={volumePoints} unit={unit} />
      )}

      {!loading ? <PersonalRecordsCard history={history} /> : null}

      <LogSetCard key={`log-${exercise.id}`} exerciseId={exercise.id} onLogged={loadHistory} priorSets={historyComplete ? history : null} />

      <SubstitutionSection
        key={`sub-${exercise.id}`}
        exercise={exercise}
        allExercises={allExercises}
        onSelect={onNavigateToExercise}
      />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backLink: {
    color: dark.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  saveIcon: {
    fontSize: 24,
    color: dark.accent,
  },
  title: {
    color: dark.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  primaryBadge: {
    backgroundColor: dark.accent,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  primaryBadgeText: {
    color: '#0a0a0a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  secondaryBadge: {
    borderWidth: 1,
    borderColor: dark.accentDark,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  secondaryBadgeText: {
    color: dark.accent,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  equipmentTag: {
    color: dark.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  fatigueTag: {
    fontSize: 12,
    fontWeight: '700',
  },
  lowImpactTag: {
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '700',
  },
  demoWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: '#f4f3ee',
    marginBottom: 14,
    overflow: 'hidden',
  },
  demoGif: {
    width: '100%',
    height: '100%',
  },
  textCard: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  textLabel: {
    color: dark.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  textBody: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
