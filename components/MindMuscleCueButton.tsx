import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAiGate } from '../hooks/useAiGate';
import { askClaude, buildMindMuscleCuePrompt } from '../lib/claude';
import { dark } from '../lib/theme';
import type { Exercise } from '../lib/types';
import { speak, stopSpeaking } from '../lib/voice';

export default function MindMuscleCueButton({ exercise }: { exercise: Exercise }) {
  const [cue, setCue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiGate = useAiGate();

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const handlePress = async () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (cue) {
      speak(cue);
      setSpeaking(true);
      return;
    }
    if (!aiGate.canUse) {
      setError("You've used today's free AI actions. Upgrade to Premium for unlimited access.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const reply = await askClaude(buildMindMuscleCuePrompt(exercise), undefined, { routine: true });
      setCue(reply);
      speak(reply);
      setSpeaking(true);
      aiGate.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.button} onPress={handlePress} disabled={loading}>
        {loading ? (
          <ActivityIndicator color={dark.accent} size="small" />
        ) : (
          <Text style={styles.buttonText}>{speaking ? '⏸ Stop' : '🔊 Mind-Muscle Cue'}</Text>
        )}
      </Pressable>
      {cue && <Text style={styles.cueText}>{cue}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  button: {
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  cueText: {
    color: dark.textMuted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    marginTop: 8,
  },
});
