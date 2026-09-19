import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { startCheckout } from '../lib/billing';
import { FREE_DAILY_AI_LIMIT } from '../lib/subscription';
import { colors } from '../lib/theme';

export default function AiUsageIndicator({
  isPremium,
  remaining,
  loaded,
}: {
  isPremium: boolean | null;
  remaining: number;
  loaded: boolean;
}) {
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loaded) return null;

  if (isPremium) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>✨ Premium — unlimited AI</Text>
      </View>
    );
  }

  const upgrade = async () => {
    setUpgrading(true);
    setError(null);
    try {
      await startCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.row} onPress={upgrade} disabled={upgrading}>
        <Text style={styles.text}>
          {remaining} of {FREE_DAILY_AI_LIMIT} free AI actions left today
        </Text>
        {upgrading ? (
          <ActivityIndicator size="small" style={styles.spinner} />
        ) : (
          <Text style={styles.upgrade}>Upgrade to Premium →</Text>
        )}
      </Pressable>
      {error && <Text style={styles.error}>Couldn't start checkout: {error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: 4,
  },
  text: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  upgrade: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  spinner: {
    marginLeft: 8,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
});
