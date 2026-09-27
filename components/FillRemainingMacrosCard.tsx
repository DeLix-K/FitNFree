import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAiGate } from '../hooks/useAiGate';
import { saveHistoryEntry } from '../lib/aiHistory';
import { askClaude, buildFillRemainingMacrosPrompt } from '../lib/claude';
import { dark } from '../lib/theme';
import AiUsageIndicator from './AiUsageIndicator';

export default function FillRemainingMacrosCard({
  remaining,
}: {
  remaining: { calories: number; protein: number; carbs: number; fat: number };
}) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiGate = useAiGate();

  const run = async () => {
    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reply = await askClaude(buildFillRemainingMacrosPrompt(remaining), undefined, { routine: true });
      setResult(reply);
      saveHistoryEntry('nutrition_search', reply, 'fill remaining macros');
      aiGate.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (remaining.calories <= 50 && remaining.protein <= 5) {
    return null;
  }

  return (
    <View style={styles.card}>
      <AiUsageIndicator isPremium={aiGate.isPremium} remaining={aiGate.remaining} loaded={aiGate.loaded} />
      <Text style={styles.title}>🍽️ Fill My Remaining Macros</Text>
      <Text style={styles.subtitle}>
        {Math.max(0, remaining.calories)} kcal, {Math.max(0, remaining.protein)}g protein left today.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {result ? (
        <>
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{result}</Text>
          </View>
          <Pressable style={styles.button} onPress={run} disabled={loading}>
            {loading ? <ActivityIndicator color={dark.accent} /> : <Text style={styles.buttonText}>Get New Suggestions</Text>}
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.button} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color={dark.accent} /> : <Text style={styles.buttonText}>Suggest 3 Options</Text>}
        </Pressable>
      )}
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
    marginBottom: 16,
  },
  title: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  subtitle: {
    color: dark.textMuted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    marginBottom: 10,
  },
  resultBox: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  resultText: {
    color: dark.text,
    fontSize: 13,
    lineHeight: 19,
  },
  button: {
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 13,
  },
});
