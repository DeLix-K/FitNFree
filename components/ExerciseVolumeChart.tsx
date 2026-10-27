import { StyleSheet, Text, View } from 'react-native';
import { dark } from '../lib/theme';
import type { ExercisePr } from '../lib/exercises';

export default function ExerciseVolumeChart({
  pr,
  volumePoints,
  unit,
}: {
  pr: ExercisePr;
  volumePoints: { date: string; volume: number }[];
  unit: 'kg' | 'lb';
}) {
  if (!pr) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>📈 PR & Volume History</Text>
        <Text style={styles.emptyText}>Log your first set below to start tracking real progress here.</Text>
      </View>
    );
  }

  const recent = volumePoints.slice(-10);
  const maxVolume = Math.max(1, ...recent.map((p) => p.volume));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📈 PR & Volume History</Text>

      <View style={styles.prRow}>
        <View style={styles.prBox}>
          <Text style={styles.prValue}>{pr.bestWeight > 0 ? `${pr.bestWeight} ${pr.bestWeightUnit}` : '—'}</Text>
          <Text style={styles.prLabel}>Heaviest Weight</Text>
        </View>
        <View style={styles.prBox}>
          <Text style={styles.prValue}>{pr.bestEst1RM > 0 ? `${pr.bestEst1RM} ${unit}` : '—'}</Text>
          <Text style={styles.prLabel}>Est. 1RM</Text>
        </View>
        <View style={styles.prBox}>
          <Text style={styles.prValue}>{pr.totalSets}</Text>
          <Text style={styles.prLabel}>Sets Logged</Text>
        </View>
      </View>

      {recent.length > 1 && (
        <>
          <Text style={styles.chartLabel}>Volume Trend (weight × reps per day)</Text>
          <View style={styles.chartRow}>
            {recent.map((p) => (
              <View key={p.date} style={styles.chartBarWrap}>
                <View style={[styles.chartBar, { height: Math.max(4, (p.volume / maxVolume) * 80) }]} />
                <Text style={styles.chartBarLabel}>{p.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </>
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
  prRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  prBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  prValue: {
    color: dark.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  prLabel: {
    color: dark.textFaint,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  chartLabel: {
    color: dark.textFaint,
    fontSize: 11,
    marginBottom: 8,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
  },
  chartBarWrap: {
    alignItems: 'center',
    flex: 1,
  },
  chartBar: {
    width: 10,
    backgroundColor: dark.accent,
    borderRadius: 3,
  },
  chartBarLabel: {
    color: dark.textFaint,
    fontSize: 8,
    marginTop: 4,
  },
});
