import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { saveHistoryEntry } from '../lib/aiHistory';
import { askClaude, buildSessionRecalibrationPrompt, type CoachPersonality } from '../lib/claude';
import { fetchTodaysPlanForRecalibration } from '../lib/coachInsights';
import { dark } from '../lib/theme';

const SORENESS_OPTIONS = ['None', 'Legs', 'Upper body', 'Lower back', 'Everywhere'];
const TIME_OPTIONS = ['15 min', '30 min', '45 min', '60+ min'];
const EQUIPMENT_OPTIONS = ['Full gym', 'Home / dumbbells', 'Bodyweight only'];
const ENERGY_LEVELS = [1, 2, 3, 4, 5];

export default function SessionRecalibrationModal({
  visible,
  onClose,
  personality,
  canUse,
  onUsed,
}: {
  visible: boolean;
  onClose: () => void;
  personality: CoachPersonality;
  canUse: boolean;
  onUsed: () => void;
}) {
  const [soreness, setSoreness] = useState('None');
  const [time, setTime] = useState('30 min');
  const [equipment, setEquipment] = useState('Full gym');
  const [energy, setEnergy] = useState(3);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleRecalibrate = async () => {
    if (!canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { planName, exerciseNames } = await fetchTodaysPlanForRecalibration();
      const reply = await askClaude(
        buildSessionRecalibrationPrompt({
          planName,
          exerciseNames,
          soreness,
          timeAvailable: time,
          equipment,
          energyLevel: energy,
          personality,
        })
      );
      setResult(reply);
      saveHistoryEntry('session_recalibration', reply);
      onUsed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Recalibrate Today's Session</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <ScrollView>
            {!result ? (
              <>
                <Text style={styles.label}>Soreness</Text>
                <View style={styles.chipRow}>
                  {SORENESS_OPTIONS.map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.chip, soreness === s && styles.chipActive]}
                      onPress={() => setSoreness(s)}
                    >
                      <Text style={[styles.chipText, soreness === s && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Time available</Text>
                <View style={styles.chipRow}>
                  {TIME_OPTIONS.map((t) => (
                    <Pressable
                      key={t}
                      style={[styles.chip, time === t && styles.chipActive]}
                      onPress={() => setTime(t)}
                    >
                      <Text style={[styles.chipText, time === t && styles.chipTextActive]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Equipment available</Text>
                <View style={styles.chipRow}>
                  {EQUIPMENT_OPTIONS.map((e) => (
                    <Pressable
                      key={e}
                      style={[styles.chip, equipment === e && styles.chipActive]}
                      onPress={() => setEquipment(e)}
                    >
                      <Text style={[styles.chipText, equipment === e && styles.chipTextActive]}>{e}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Energy level</Text>
                <View style={styles.chipRow}>
                  {ENERGY_LEVELS.map((lvl) => (
                    <Pressable
                      key={lvl}
                      style={[styles.energyChip, energy === lvl && styles.chipActive]}
                      onPress={() => setEnergy(lvl)}
                    >
                      <Text style={[styles.chipText, energy === lvl && styles.chipTextActive]}>{lvl}</Text>
                    </Pressable>
                  ))}
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable style={styles.submitButton} onPress={handleRecalibrate} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#0a0a0a" />
                  ) : (
                    <Text style={styles.submitButtonText}>Recalibrate My Session</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.resultBox}>
                  <Text style={styles.resultText}>{result}</Text>
                </View>
                <Pressable style={styles.submitButton} onPress={reset}>
                  <Text style={styles.submitButtonText}>Recalibrate Again</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: dark.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: dark.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: dark.text,
    fontSize: 17,
    fontWeight: '700',
  },
  close: {
    color: dark.accent,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    color: dark.textMuted,
    marginBottom: 8,
    marginTop: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  energyChip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: dark.textMuted,
  },
  chipTextActive: {
    color: '#0a0a0a',
  },
  error: {
    color: dark.danger,
    marginTop: 14,
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  submitButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  resultBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 16,
  },
  resultText: {
    color: dark.text,
    fontSize: 14,
    lineHeight: 21,
  },
});
