import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppleHealthCard from '../components/AppleHealthCard';
import { appleHealthSource } from '../lib/appleHealth';
import { disconnectOura, getOuraAuthUrl, getOuraData, type OuraData } from '../lib/oura';
import { dark } from '../lib/theme';

const REDIRECT_URI = Platform.OS === 'web' && typeof window !== 'undefined'
  ? window.location.origin
  : '';

// Only Oura is a real, working integration today -- Fitbit closed self-serve
// developer registration mid-build, and Apple Health / Google Health Connect
// / Garmin all need native SDKs a managed Expo web build can't call. Listed
// here honestly as "Coming soon" rather than faking a connected state.
// Apple Health is real on iPhone (read-only; see components/AppleHealthCard.tsx) and still "coming soon" everywhere else.
const COMING_SOON = ['Fitbit', ...(appleHealthSource ? [] : ['Apple Health']), 'Google Health Connect', 'Garmin'];

export default function WearablesScreen({ onBack }: { onBack?: () => void }) {
  const [data, setData] = useState<OuraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getOuraData();
      setData(result);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleConnect = () => {
    if (Platform.OS !== 'web') {
      setError('Connecting a wearable is currently only supported on the web version of the app.');
      return;
    }
    const state = Math.random().toString(36).slice(2);
    window.sessionStorage.setItem('oura_oauth_state', state);
    window.location.href = getOuraAuthUrl(REDIRECT_URI, state);
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectOura();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      {onBack && (
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< Profile'}</Text>
        </Pressable>
      )}
      <Text style={styles.title}>Wearables</Text>
      <Text style={styles.subtitle}>Connect a fitness tracker to see your daily activity here.</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {appleHealthSource ? <AppleHealthCard source={appleHealthSource} /> : null}

      <View style={styles.deviceRow}>
        <View style={styles.deviceIconWrap}>
          <Text style={styles.deviceIcon}>💍</Text>
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>Oura Ring</Text>
          <Text style={data?.connected ? styles.deviceStatus : styles.deviceStatusMuted}>
            {data?.connected ? '✓ Connected · Synced just now' : 'Not connected'}
          </Text>
        </View>
        {data?.connected ? (
          <Pressable onPress={handleDisconnect} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color={dark.danger} />
            ) : (
              <Text style={styles.disconnect}>Disconnect</Text>
            )}
          </Pressable>
        ) : (
          <Pressable style={styles.connectButton} onPress={handleConnect}>
            <Text style={styles.connectButtonText}>Connect</Text>
          </Pressable>
        )}
      </View>

      {data?.connected && (
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.steps.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Steps</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.calories.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Calories</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.distance} km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.activeMinutes}</Text>
            <Text style={styles.statLabel}>Active min</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.recoveryScore ?? '—'}</Text>
            <Text style={styles.statLabel}>Recovery</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{data.hrvBalance ?? '—'}</Text>
            <Text style={styles.statLabel}>HRV Balance</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>More devices</Text>
      {COMING_SOON.map((name) => (
        <View key={name} style={styles.deviceRow}>
          <View style={styles.deviceIconWrap}>
            <Text style={styles.deviceIcon}>⌚</Text>
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{name}</Text>
            <Text style={styles.deviceStatusMuted}>Coming soon</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  back: {
    color: dark.accent,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  title: {
    color: dark.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    color: dark.textFaint,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  sectionTitle: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 10,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  deviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIcon: {
    fontSize: 20,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
  },
  deviceStatus: {
    color: dark.accent,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  deviceStatusMuted: {
    color: dark.textFaint,
    fontSize: 12,
    marginTop: 2,
  },
  disconnect: {
    color: dark.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  connectButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  connectButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    width: '31%',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 12,
  },
  statValue: {
    color: dark.text,
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: dark.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
});
