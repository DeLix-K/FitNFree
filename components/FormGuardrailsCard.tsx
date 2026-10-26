import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAiGate } from '../hooks/useAiGate';
import { saveHistoryEntry } from '../lib/aiHistory';
import { askClaude, buildFormGuardrailsPrompt, parseFormGuardrails } from '../lib/claude';
import { dark } from '../lib/theme';
import type { Exercise } from '../lib/types';

export default function FormGuardrailsCard({ exercise }: { exercise: Exercise }) {
  const [dos, setDos] = useState<string[]>([]);
  const [donts, setDonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiGate = useAiGate();

  const generate = async () => {
    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reply = await askClaude(buildFormGuardrailsPrompt(exercise), undefined, { routine: true });
      const parsed = parseFormGuardrails(reply);
      setDos(parsed.dos);
      setDonts(parsed.donts);
      saveHistoryEntry('exercise_explanation', reply, `${exercise.name} — form guardrails`);
      aiGate.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>✅ Form Guardrails</Text>

      {dos.length === 0 && donts.length === 0 ? (
        loading ? (
          <ActivityIndicator color={dark.accent} style={{ marginVertical: 10 }} />
        ) : (
          <Pressable style={styles.generateButton} onPress={generate}>
            <Text style={styles.generateButtonText}>Get Do's & Don'ts</Text>
          </Pressable>
        )
      ) : (
        <View style={styles.columnsRow}>
          <View style={styles.column}>
            {dos.map((cue, i) => (
              <View key={i} style={styles.cueRow}>
                <Text style={styles.doMark}>✓</Text>
                <Text style={styles.cueText}>{cue}</Text>
              </View>
            ))}
          </View>
          <View style={styles.column}>
            {donts.map((cue, i) => (
              <View key={i} style={styles.cueRow}>
                <Text style={styles.dontMark}>✕</Text>
                <Text style={styles.cueText}>{cue}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

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
    marginBottom: 10,
  },
  generateButton: {
    backgroundColor: dark.accent,
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  column: {
    flex: 1,
  },
  cueRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  doMark: {
    color: dark.accent,
    fontWeight: '800',
    fontSize: 13,
  },
  dontMark: {
    color: dark.danger,
    fontWeight: '800',
    fontSize: 13,
  },
  cueText: {
    color: dark.textMuted,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    marginTop: 8,
  },
});
