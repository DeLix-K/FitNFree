import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { startCheckout } from '../lib/billing';
import { dark } from '../lib/theme';

// Shown in place of locked library content: it's included with Premium, and
// this starts the same in-app subscription purchase as every other upgrade
// prompt (Apple / Google billing on the mobile apps, Stripe on web).
export default function PremiumUnlock({ message }: { message?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      await startCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.message}>{message ?? 'Included with Premium.'}</Text>
      <Pressable style={styles.button} onPress={upgrade} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#0a0a0a" size="small" />
        ) : (
          <Text style={styles.buttonText}>✨ Unlock with Premium</Text>
        )}
      </Pressable>
      {error && <Text style={styles.error}>Couldn't start the purchase: {error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12 },
  message: { color: dark.textMuted, fontSize: 12, marginBottom: 8 },
  button: { backgroundColor: dark.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#0a0a0a', fontWeight: '700' },
  error: { color: dark.danger, fontSize: 12, marginTop: 8 },
});
