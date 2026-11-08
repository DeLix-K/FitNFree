import { Platform, StyleSheet, Text, View } from 'react-native';
import { dark } from '../lib/theme';

function readinessLabel(score: number | null): string {
  if (score == null) return 'No readiness data yet';
  if (score >= 85) return 'Restored — go for it';
  if (score >= 70) return 'Balanced — normal training is fine';
  if (score >= 50) return 'Compromised — ease off intensity';
  return 'Low — prioritize recovery today';
}

function strainGuidance(score: number | null): string {
  if (score == null) return 'Sync or log sleep to get a real readiness-based recommendation.';
  if (score >= 85) return 'Your body is primed for high intensity — a good day for your hardest planned session.';
  if (score >= 70) return 'Normal training load should feel manageable today.';
  if (score >= 50) return 'Consider trimming volume or intensity, or adding extra warm-up.';
  return 'Favor mobility, a light walk, or a full rest day.';
}

function Bar({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.barWrap}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { height: value != null ? `${Math.max(4, value)}%` : '2%' }]} />
      </View>
      <Text style={styles.barValue}>{value != null ? value : '—'}</Text>
      <Text style={styles.barLabel}>{label}</Text>
    </View>
  );
}

export default function SleepReadinessCard({
  ouraConnected,
  recoveryScore,
  hrvBalance,
  restingHeartRateBalance,
  averageHrv,
  lowestHeartRate,
}: {
  ouraConnected: boolean;
  recoveryScore: number | null;
  hrvBalance: number | null;
  restingHeartRateBalance: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
}) {
  if (!ouraConnected) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Daily Readiness Score</Text>
        <Text style={styles.emptyText}>
          {Platform.OS === 'web'
            ? 'Connect Oura under Profile → Connected Devices to see your real readiness score, HRV, and resting heart rate'
            : 'Connect Oura in the FitNFree web app (Profile → Connected Devices) to see your real readiness score, HRV, and resting heart rate here'}
          {' '}— this app never estimates these without a real device.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Daily Readiness Score</Text>
      <View style={styles.scoreRow}>
        <Text style={styles.score}>{recoveryScore != null ? `${recoveryScore}%` : '—'}</Text>
        <Text style={styles.scoreLabel}>{readinessLabel(recoveryScore)}</Text>
      </View>

      <View style={styles.barsRow}>
        <Bar label="HRV Balance" value={hrvBalance} />
        <Bar label="Resting HR Balance" value={restingHeartRateBalance} />
      </View>

      {(averageHrv != null || lowestHeartRate != null) && (
        <Text style={styles.rawStats}>
          Last night: {averageHrv != null ? `${averageHrv} ms avg HRV` : '—'}
          {averageHrv != null && lowestHeartRate != null ? ' · ' : ''}
          {lowestHeartRate != null ? `${lowestHeartRate} bpm lowest HR` : ''}
        </Text>
      )}

      <Text style={styles.sectionLabel}>Recommended Strain Budget</Text>
      <Text style={styles.guidance}>{strainGuidance(recoveryScore)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  title: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  emptyText: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 14,
  },
  score: {
    color: dark.accent,
    fontSize: 32,
    fontWeight: '800',
  },
  scoreLabel: {
    color: dark.textMuted,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  barsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 10,
  },
  barWrap: {
    alignItems: 'center',
    width: 90,
  },
  barTrack: {
    width: 26,
    height: 60,
    borderRadius: 6,
    backgroundColor: dark.border,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    width: '100%',
    backgroundColor: dark.accent,
    borderRadius: 6,
  },
  barValue: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '800',
  },
  barLabel: {
    color: dark.textFaint,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  rawStats: {
    color: dark.textFaint,
    fontSize: 11,
    marginBottom: 10,
  },
  sectionLabel: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
  guidance: {
    color: dark.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
