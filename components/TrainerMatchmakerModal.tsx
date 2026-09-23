import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BUDGET_OPTIONS,
  computeMatches,
  FOCUS_OPTIONS,
  FORMAT_OPTIONS,
  VIBE_OPTIONS,
  type BudgetKey,
  type FocusKey,
  type QuizAnswers,
  type TrainerMatch,
} from '../lib/trainerMatchmaker';
import { dark } from '../lib/theme';
import type { CoachingStyle, TrainerProfile, TrainerRating, TrainingFormat } from '../lib/types';
import TrainerCard from './TrainerCard';

type Step = 1 | 2 | 3 | 'loading' | 'results';

const LOADING_STEPS = ['Filtering by your primary focus...', 'Checking your preferred format...', 'Matching coaching vibe & budget...'];

export default function TrainerMatchmakerModal({
  visible,
  onClose,
  trainers,
  ratings,
  onViewProfile,
  onBook,
  onChat,
}: {
  visible: boolean;
  onClose: () => void;
  trainers: TrainerProfile[];
  ratings: Map<string, TrainerRating>;
  onViewProfile: (trainer: TrainerProfile) => void;
  onBook: (trainer: TrainerProfile) => void;
  onChat: (trainer: TrainerProfile) => void;
}) {
  // A full-screen Modal draws under the status bar/notch, so the content has
  // to add the real device insets itself (a fixed padding clipped the title
  // and close button on iPad and notched phones).
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);
  const [focus, setFocus] = useState<FocusKey | null>(null);
  const [format, setFormat] = useState<TrainingFormat | null>(null);
  const [vibe, setVibe] = useState<CoachingStyle | null>(null);
  const [budget, setBudget] = useState<BudgetKey | null>(null);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [matches, setMatches] = useState<TrainerMatch[]>([]);

  const reset = () => {
    setStep(1);
    setFocus(null);
    setFormat(null);
    setVibe(null);
    setBudget(null);
    setLoadingStepIndex(0);
    setMatches([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pulse = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const pickFocus = (key: FocusKey) => {
    pulse();
    setFocus(key);
    setStep(2);
  };
  const pickFormat = (key: TrainingFormat) => {
    pulse();
    setFormat(key);
    setStep(3);
  };

  const showMatches = () => {
    if (!focus || !format || !vibe || !budget) return;
    pulse();
    setStep('loading');
  };

  useEffect(() => {
    if (step !== 'loading') return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= LOADING_STEPS.length) {
        clearInterval(interval);
        const answers: QuizAnswers = { focus: focus!, format: format!, vibe: vibe!, budget: budget! };
        setMatches(computeMatches(answers, trainers));
        setStep('results');
        return;
      }
      setLoadingStepIndex(i);
    }, 550);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const stepNumber = typeof step === 'number' ? step : 3;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {step !== 'loading' && step !== 'results' && (
          <View style={styles.progressHeader}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(stepNumber / 3) * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{stepNumber} of 3</Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Text style={styles.closeX}>✕</Text>
            </Pressable>
          </View>
        )}

        {step === 1 && (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.headline}>What is your primary fitness focus right now?</Text>
            <Text style={styles.subhead}>We'll match you with coaches who specialize in this outcome.</Text>
            {FOCUS_OPTIONS.map((opt) => (
              <Pressable key={opt.key} style={styles.optionCard} onPress={() => pickFocus(opt.key)}>
                <Text style={styles.optionIcon}>{opt.icon}</Text>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  <Text style={styles.optionBlurb}>{opt.blurb}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.headline}>How do you want to train with your coach?</Text>
            <Text style={styles.subhead}>Choose the setup that fits your schedule and lifestyle.</Text>
            {FORMAT_OPTIONS.map((opt) => (
              <Pressable key={opt.key} style={styles.optionCard} onPress={() => pickFormat(opt.key)}>
                <Text style={styles.optionIcon}>{opt.icon}</Text>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  <Text style={styles.optionBlurb}>{opt.blurb}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {step === 3 && (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.headline}>What coaching style and budget work best for you?</Text>

            <Text style={styles.groupLabel}>PREFERRED COACHING VIBE</Text>
            {VIBE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.radioRow, vibe === opt.key && styles.radioRowActive]}
                onPress={() => {
                  pulse();
                  setVibe(opt.key);
                }}
              >
                <Text style={styles.radioIcon}>{vibe === opt.key ? '🟢' : '⚪'}</Text>
                <Text style={styles.radioLabel}>
                  {opt.icon} {opt.label}
                </Text>
              </Pressable>
            ))}

            <Text style={styles.groupLabel}>ESTIMATED BUDGET</Text>
            <View style={styles.budgetRow}>
              {BUDGET_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.budgetChip, budget === opt.key && styles.budgetChipActive]}
                  onPress={() => {
                    pulse();
                    setBudget(opt.key);
                  }}
                >
                  <Text style={[styles.budgetChipLabel, budget === opt.key && styles.budgetChipLabelActive]}>{opt.label}</Text>
                  <Text style={[styles.budgetChipRange, budget === opt.key && styles.budgetChipLabelActive]}>{opt.range}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={[styles.showMatchesButton, (!vibe || !budget) && styles.showMatchesButtonDisabled]} onPress={showMatches} disabled={!vibe || !budget}>
              <Text style={styles.showMatchesButtonText}>⚡ SHOW MY MATCHES</Text>
            </Pressable>
          </ScrollView>
        )}

        {step === 'loading' && (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingIcon}>⚡</Text>
            <Text style={styles.loadingTitle}>ANALYZING COACH DIRECTORY...</Text>
            {LOADING_STEPS.map((label, i) => (
              <Text key={label} style={styles.loadingStep}>
                {i <= loadingStepIndex ? '✓' : '○'} {label}
              </Text>
            ))}
            <ActivityIndicator color={dark.accent} style={{ marginTop: 20 }} />
          </View>
        )}

        {step === 'results' && (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.resultsHeader}>
              <Pressable onPress={handleClose} hitSlop={10}>
                <Text style={styles.closeX}>✕</Text>
              </Pressable>
              <View>
                <Text style={styles.resultsTitle}>YOUR TOP MATCHES</Text>
                <Text style={styles.subhead}>Based on your goals, format, and coaching style</Text>
              </View>
            </View>

            {matches.length === 0 ? (
              <Text style={styles.empty}>No trainers are listed yet — check back soon.</Text>
            ) : (
              <>
                <Text style={styles.groupLabel}>BEST OVERALL MATCH</Text>
                <TrainerCard
                  trainer={matches[0].trainer}
                  rating={ratings.get(matches[0].trainer.user_id)}
                  matchScore={matches[0].score}
                  matchReasons={matches[0].reasons}
                  onPress={() => onViewProfile(matches[0].trainer)}
                  onBook={() => onBook(matches[0].trainer)}
                  onChat={() => onChat(matches[0].trainer)}
                />

                {matches.length > 1 && (
                  <>
                    <Text style={styles.groupLabel}>RUNNER-UP MATCHES</Text>
                    {matches.slice(1, 3).map((m) => (
                      <Pressable key={m.trainer.id} style={styles.runnerUpRow} onPress={() => onViewProfile(m.trainer)}>
                        <View style={styles.runnerUpInfo}>
                          <Text style={styles.runnerUpName}>
                            {m.trainer.display_name} ({m.score}% Match)
                          </Text>
                          <Text style={styles.runnerUpSpecialty}>{m.trainer.specialty || 'General coaching'}</Text>
                        </View>
                        <Text style={styles.runnerUpView}>View Profile</Text>
                      </Pressable>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: dark.surfaceElevated, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: dark.accent },
  progressLabel: { color: dark.textFaint, fontSize: 11, fontWeight: '700' },
  closeX: { color: dark.textMuted, fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  headline: { color: dark.text, fontSize: 20, fontWeight: '800', marginBottom: 6, lineHeight: 27 },
  subhead: { color: dark.textFaint, fontSize: 13, marginBottom: 20, lineHeight: 18 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: dark.border,
    backgroundColor: dark.surface, borderRadius: 14, padding: 16, marginBottom: 12,
  },
  optionIcon: { fontSize: 28 },
  optionTextWrap: { flex: 1 },
  optionLabel: { color: dark.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  optionBlurb: { color: dark.textMuted, fontSize: 12, lineHeight: 16 },
  groupLabel: { color: dark.textFaint, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },
  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: dark.border,
    backgroundColor: dark.surface, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  radioRowActive: { borderColor: dark.accent },
  radioIcon: { fontSize: 14 },
  radioLabel: { color: dark.text, fontSize: 14, fontWeight: '600' },
  budgetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  budgetChip: { flex: 1, minWidth: 100, borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
  budgetChipActive: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  budgetChipLabel: { color: dark.text, fontSize: 15, fontWeight: '800' },
  budgetChipRange: { color: dark.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' },
  budgetChipLabelActive: { color: dark.accent },
  showMatchesButton: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  showMatchesButtonDisabled: { opacity: 0.4 },
  showMatchesButtonText: { color: '#0a0a0a', fontWeight: '800', fontSize: 14 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  loadingIcon: { fontSize: 48, marginBottom: 12 },
  loadingTitle: { color: dark.text, fontSize: 14, fontWeight: '800', letterSpacing: 1, marginBottom: 24 },
  loadingStep: { color: dark.textMuted, fontSize: 13, marginBottom: 10, alignSelf: 'flex-start' },
  resultsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 8 },
  resultsTitle: { color: dark.text, fontSize: 18, fontWeight: '800' },
  empty: { color: dark.textFaint, textAlign: 'center', marginTop: 24 },
  runnerUpRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: dark.border,
    backgroundColor: dark.surface, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  runnerUpInfo: { flex: 1, paddingRight: 8 },
  runnerUpName: { color: dark.text, fontSize: 14, fontWeight: '700' },
  runnerUpSpecialty: { color: dark.textMuted, fontSize: 12, marginTop: 2 },
  runnerUpView: { color: dark.accent, fontSize: 12, fontWeight: '700' },
});
