import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import SleepBehaviorTags from '../components/SleepBehaviorTags';
import SleepDebtCard from '../components/SleepDebtCard';
import SleepGreetingCard from '../components/SleepGreetingCard';
import SleepHypnogram from '../components/SleepHypnogram';
import SleepReadinessCard from '../components/SleepReadinessCard';
import SleepRecoveryHub from '../components/SleepRecoveryHub';
import { saveHistoryEntry } from '../lib/aiHistory';
import { askClaude, buildSleepInsightPrompt } from '../lib/claude';
import { getOuraData, type OuraData } from '../lib/oura';
import {
  computeSleepDebt,
  computeWindDownTimes,
  fetchSleepGoal,
  fetchSleepHistory,
  logSleepManually,
  syncOuraSleep,
  yesterdayLocalDate,
  type SleepGoal,
} from '../lib/sleep';
import { getMyStats } from '../lib/streaks';
import { dark } from '../lib/theme';
import type { SleepLog } from '../lib/types';

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'Log sleep to see your score';
  if (score >= 85) return 'Great recovery!';
  if (score >= 70) return 'Good recovery';
  if (score >= 50) return 'Fair recovery';
  return 'Poor recovery — rest up';
}

function bedtimeConsistency(nights: SleepLog[]): string {
  const times = nights
    .map((n) => n.bedtime)
    .filter((b): b is string => !!b)
    .map((b) => {
      const d = new Date(b);
      let hour = d.getHours() + d.getMinutes() / 60;
      if (hour < 12) hour += 24; // normalize late-night bedtimes past midnight
      return hour;
    });
  if (times.length < 2) return '—';
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
  const stdDevMinutes = Math.sqrt(variance) * 60;
  if (stdDevMinutes <= 20) return 'Very consistent';
  if (stdDevMinutes <= 45) return 'Fairly consistent';
  return 'Irregular';
}

const DEFAULT_OURA: OuraData = { connected: false };
const DEFAULT_GOAL: SleepGoal = { sleepGoalHours: 8, targetWakeTime: '07:00:00' };

export default function SleepScreen() {
  const [history, setHistory] = useState<SleepLog[]>([]);
  const [displayName, setDisplayName] = useState('Fitness Fan');
  const [oura, setOura] = useState<OuraData>(DEFAULT_OURA);
  const [sleepGoal, setSleepGoal] = useState<SleepGoal>(DEFAULT_GOAL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [dateInput, setDateInput] = useState(yesterdayLocalDate());
  const [hoursInput, setHoursInput] = useState('');
  const [quality, setQuality] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sleepHistory, stats, goal] = await Promise.all([
        fetchSleepHistory(),
        getMyStats().catch(() => ({ displayName: 'Fitness Fan' })),
        fetchSleepGoal().catch(() => DEFAULT_GOAL),
      ]);
      setHistory(sleepHistory);
      setDisplayName(stats.displayName);
      setSleepGoal(goal);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const sync = useCallback(async () => {
    try {
      const result = await syncOuraSleep();
      if (result.error) setSyncNote(result.error);
      else if (result.connected && result.synced > 0) setSyncNote(null);
    } catch {
      // Oura sync is best-effort — manual logging still works without it.
    }
    try {
      const ouraData = await getOuraData();
      setOura(ouraData);
    } catch {
      setOura(DEFAULT_OURA);
    }
    await load();
  }, [load]);

  useEffect(() => {
    setLoading(true);
    sync().finally(() => setLoading(false));
  }, [sync]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  const openForm = () => {
    setDateInput(yesterdayLocalDate());
    setHoursInput('');
    setQuality(null);
    setNotes('');
    setFormVisible(true);
  };

  const handleSave = async () => {
    const hours = Number(hoursInput);
    if (!hoursInput || Number.isNaN(hours) || hours <= 0 || hours > 24) {
      setError('Enter a valid number of hours (0-24).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await logSleepManually({ sleepDate: dateInput, hours, qualityRating: quality, notes });
      setFormVisible(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const last7 = useMemo(() => history.slice(0, 7), [history]);
  const latest = last7[0];

  const windDown = useMemo(
    () => computeWindDownTimes(sleepGoal.targetWakeTime, sleepGoal.sleepGoalHours),
    [sleepGoal]
  );
  const sleepDebt = useMemo(() => computeSleepDebt(history, sleepGoal.sleepGoalHours), [history, sleepGoal]);
  const recoveryScore = oura.connected ? oura.recoveryScore : null;

  const handleGetInsight = async () => {
    setInsightLoading(true);
    setError(null);
    try {
      const prompt = buildSleepInsightPrompt(
        last7.map((n) => ({
          date: n.sleep_date,
          durationMinutes: n.duration_minutes,
          bedtime: n.bedtime,
          score: n.sleep_score,
        }))
      );
      const reply = await askClaude(prompt);
      setInsight(reply);
      saveHistoryEntry('sleep_insight', reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInsightLoading(false);
    }
  };

  const maxDuration = Math.max(60, ...last7.map((n) => n.duration_minutes ?? 0));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={dark.accent} />}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Sleep & Recovery</Text>
          <Text style={styles.subtitle}>
            Log your sleep manually, or connect Oura under Profile → Connected Devices to sync it automatically.
          </Text>
          {syncNote && <Text style={styles.note}>{syncNote}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <SleepGreetingCard
            displayName={displayName}
            latest={latest ?? null}
            recoveryScore={recoveryScore}
            recommendedBedtimeLabel={windDown.recommendedBedtimeLabel}
            caffeineCutoffLabel={windDown.caffeineCutoffLabel}
          />

          <SleepReadinessCard
            ouraConnected={oura.connected}
            recoveryScore={recoveryScore}
            hrvBalance={oura.connected ? oura.hrvBalance : null}
            restingHeartRateBalance={oura.connected ? oura.restingHeartRateBalance : null}
            averageHrv={latest?.average_hrv ?? null}
            lowestHeartRate={latest?.lowest_heart_rate ?? null}
          />

          <SleepHypnogram
            sleepPhase5min={latest?.sleep_phase_5min ?? null}
            bedtime={latest?.bedtime ?? null}
            wakeTime={latest?.wake_time ?? null}
            deepMinutes={latest?.deep_minutes ?? null}
            remMinutes={latest?.rem_minutes ?? null}
          />

          {latest && (
            <View style={styles.metricsGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{formatDuration(latest.duration_minutes)}</Text>
                <Text style={styles.metricLabel}>Total sleep</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{formatDuration(latest.deep_minutes)}</Text>
                <Text style={styles.metricLabel}>Deep</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{formatDuration(latest.rem_minutes)}</Text>
                <Text style={styles.metricLabel}>REM</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{formatDuration(latest.light_minutes)}</Text>
                <Text style={styles.metricLabel}>Light</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{formatDuration(latest.awake_minutes)}</Text>
                <Text style={styles.metricLabel}>Awake</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricValue}>{bedtimeConsistency(last7)}</Text>
                <Text style={styles.metricLabel}>Consistency</Text>
              </View>
            </View>
          )}

          {last7.length > 1 && (
            <>
              <Text style={styles.sectionTitle}>7-Day Trend</Text>
              <View style={styles.chartRow}>
                {[...last7].reverse().map((n) => (
                  <View key={n.id} style={styles.chartBarWrap}>
                    <View
                      style={[
                        styles.chartBar,
                        { height: Math.max(6, ((n.duration_minutes ?? 0) / maxDuration) * 90) },
                      ]}
                    />
                    <Text style={styles.chartBarLabel}>
                      {new Date(n.sleep_date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <SleepBehaviorTags sleepDate={yesterdayLocalDate()} />
          <SleepDebtCard debt={sleepDebt} />

          <View style={styles.insightCard}>
            {insight ? (
              <Text style={styles.insightText}>{insight}</Text>
            ) : (
              <Text style={styles.insightPlaceholder}>
                Get a personalized insight based on your recent sleep patterns.
              </Text>
            )}
            <Pressable style={styles.insightButton} onPress={handleGetInsight} disabled={insightLoading}>
              {insightLoading ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Text style={styles.insightButtonText}>
                  {insight ? 'Refresh Insight' : '✨ Get AI Insight'}
                </Text>
              )}
            </Pressable>
          </View>

          {formVisible ? (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Date</Text>
              <TextInput
                style={styles.input}
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={dark.textFaint}
              />
              <Text style={styles.formLabel}>Hours slept</Text>
              <TextInput
                style={styles.input}
                value={hoursInput}
                onChangeText={setHoursInput}
                placeholder="e.g. 7.5"
                placeholderTextColor={dark.textFaint}
                keyboardType="decimal-pad"
              />
              <Text style={styles.formLabel}>Quality (optional)</Text>
              <View style={styles.qualityRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.qualityDot, quality === n && styles.qualityDotSelected]}
                    onPress={() => setQuality(quality === n ? null : n)}
                  >
                    <Text style={[styles.qualityDotText, quality === n && styles.qualityDotTextSelected]}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional)"
                placeholderTextColor={dark.textFaint}
              />
              <View style={styles.formButtons}>
                <Pressable style={styles.cancelButton} onPress={() => setFormVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#0a0a0a" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.logButton} onPress={openForm}>
              <Text style={styles.logButtonText}>+ Log Sleep</Text>
            </Pressable>
          )}

          <SleepRecoveryHub />

          <Text style={styles.sectionTitle}>Recent Nights</Text>
        </>
      }
      data={history}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No sleep logged yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowDate}>{item.sleep_date}</Text>
            <Text style={styles.rowSource}>{item.source === 'oura' ? 'Oura' : item.source === 'apple_health' ? 'Apple Health' : item.source === 'health_connect' ? 'Health Connect' : 'Manual'}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowDuration}>{formatDuration(item.duration_minutes)}</Text>
            {item.sleep_score != null && (
              <Text style={styles.rowScore}>Score {item.sleep_score}</Text>
            )}
            {item.quality_rating != null && (
              <Text style={styles.rowScore}>Quality {item.quality_rating}/5</Text>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: dark.background,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 12,
  },
  note: {
    fontSize: 12,
    color: dark.textMuted,
    marginBottom: 12,
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  metricBox: {
    width: '31%',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 12,
  },
  metricValue: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '800',
  },
  metricLabel: {
    color: dark.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    color: dark.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 110,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 12,
  },
  chartBarWrap: {
    alignItems: 'center',
    flex: 1,
  },
  chartBar: {
    width: 14,
    backgroundColor: dark.accent,
    borderRadius: 4,
  },
  chartBarLabel: {
    color: dark.textFaint,
    fontSize: 10,
    marginTop: 6,
  },
  insightCard: {
    borderWidth: 1,
    borderColor: dark.accentDark,
    backgroundColor: dark.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  insightText: {
    color: dark.text,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  insightPlaceholder: {
    color: dark.textMuted,
    fontSize: 13,
    marginBottom: 12,
  },
  insightButton: {
    backgroundColor: dark.accent,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  insightButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  logButton: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  logButtonText: {
    color: dark.accent,
    fontWeight: '700',
  },
  form: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    color: dark.textMuted,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityDotSelected: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  qualityDotText: {
    fontSize: 13,
    fontWeight: '600',
    color: dark.text,
  },
  qualityDotTextSelected: {
    color: '#0a0a0a',
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: dark.textMuted,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  rowLeft: {},
  rowDate: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.text,
  },
  rowSource: {
    fontSize: 11,
    color: dark.textFaint,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowDuration: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.accent,
  },
  rowScore: {
    fontSize: 11,
    color: dark.textMuted,
    marginTop: 2,
  },
});
