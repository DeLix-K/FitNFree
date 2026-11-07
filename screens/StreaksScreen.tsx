import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import Svg, { Circle } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import EmptyStateCard from '../components/EmptyStateCard';
import MilestoneBadges, { MILESTONES } from '../components/MilestoneBadges';
import MilestoneCelebrationModal from '../components/MilestoneCelebrationModal';
import StreakShareCard from '../components/StreakShareCard';
import WorkoutReminderCard from '../components/WorkoutReminderCard';
import {
  fetchFreezeCoveredDates,
  fetchLeaderboard,
  fetchLoggedDates,
  fetchStreakFreezeBalance,
  fetchTotalDurationMinutes,
  fetchWeeklyTarget,
  getMyStats,
  grantStreakFreezeIfEarned,
  hasLoggedToday,
  logWorkoutToday,
  updateDisplayName,
  updateWeeklyTarget,
  useStreakFreeze,
} from '../lib/streaks';
import { fetchBodyStats } from '../lib/profile';
import { recordActivityForActiveChallenges } from '../lib/challenges';
import { dark } from '../lib/theme';
import { refreshWidgetSnapshot } from '../lib/widgetRefresh';
import { markTrainedToday } from '../lib/workoutReminders';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry } from '../lib/types';

const RING_SIZE = 88;
const RING_STROKE = 8;
const DURATION_OPTIONS = [15, 30, 45, 60, 90];
const WEEKLY_TARGET_OPTIONS = [3, 4, 5, 6, 7];

function ProgressRing({ progress }: { progress: number }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radius}
        stroke={dark.border}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radius}
        stroke={dark.accent}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation={-90}
        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
  );
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Standard ACSM metabolic equation (kcal/min = MET x 3.5 x kg / 200), using
// a moderate general-training MET of 5.0 since the app doesn't track
// exercise type/intensity per session -- clearly labeled as an estimate
// wherever it's shown, never presented as a precise measurement.
const MODERATE_WORKOUT_MET = 5.0;
function estimateCalories(totalMinutes: number, weightKg: number): number {
  return Math.round(((MODERATE_WORKOUT_MET * 3.5 * weightKg) / 200) * totalMinutes);
}

export default function StreaksScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [displayName, setDisplayName] = useState('Fitness Fan');
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [loggedToday, setLoggedToday] = useState(false);
  const [logging, setLogging] = useState(false);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [monthLoggedDates, setMonthLoggedDates] = useState<Set<string>>(new Set());
  const [monthFrozenDates, setMonthFrozenDates] = useState<Set<string>>(new Set());
  const [weeklyTarget, setWeeklyTarget] = useState(5);
  const [freezeBalance, setFreezeBalance] = useState(0);
  const [usingFreezeFor, setUsingFreezeFor] = useState<string | null>(null);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [sessionsWithDuration, setSessionsWithDuration] = useState(0);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [celebrationMilestone, setCelebrationMilestone] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareCardRef = useRef<ElementRef<typeof ViewShot>>(null);
  const today = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);

      const monthStart = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
      const monthEnd = toDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));

      // Recompute + grant any newly-earned freeze before reading balance, so
      // a streak that just crossed a 7-day multiple reflects it immediately.
      await grantStreakFreezeIfEarned().catch(() => {});

      const [stats, logged, board, monthDates, frozenDates, target, freezes, duration, body] =
        await Promise.all([
          getMyStats(),
          hasLoggedToday(),
          fetchLeaderboard(),
          fetchLoggedDates(monthStart, monthEnd),
          fetchFreezeCoveredDates(monthStart, monthEnd),
          fetchWeeklyTarget(),
          fetchStreakFreezeBalance(),
          fetchTotalDurationMinutes(),
          fetchBodyStats(),
        ]);
      setCurrentStreak(stats.currentStreak);
      setLongestStreak(stats.longestStreak);
      setTotalWorkouts(stats.totalWorkouts);
      setDisplayName(stats.displayName);
      setNameInput(stats.displayName === 'Fitness Fan' ? '' : stats.displayName);
      setLoggedToday(logged);
      if (logged) markTrainedToday().catch(() => {});
      setLeaderboard(board);
      setMonthLoggedDates(monthDates);
      setMonthFrozenDates(frozenDates);
      setWeeklyTarget(target);
      setFreezeBalance(freezes?.balance ?? 0);
      setTotalMinutes(duration.totalMinutes);
      setSessionsWithDuration(duration.sessionsWithDuration);
      setWeightKg(body?.weight_kg ?? null);
      return stats.longestStreak;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [today]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const commitLog = async (durationMinutes: number | null) => {
    setLogging(true);
    setError(null);
    const previousLongest = longestStreak;
    try {
      await logWorkoutToday(durationMinutes);
      markTrainedToday().catch(() => {});
      refreshWidgetSnapshot().catch(() => {});
      setDurationPickerOpen(false);
      await recordActivityForActiveChallenges().catch(() => {});
      const newLongest = await load();
      if (newLongest != null) {
        const crossed = MILESTONES.find((m) => m > previousLongest && m <= newLongest);
        if (crossed) setCelebrationMilestone(crossed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogging(false);
    }
  };

  const handleSaveName = async () => {
    try {
      await updateDisplayName(nameInput);
      setEditingName(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleWeeklyTargetChange = async (target: number) => {
    setWeeklyTarget(target);
    try {
      await updateWeeklyTarget(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUseFreeze = (dateStr: string) => {
    Alert.alert(
      'Use a Streak Freeze?',
      `This will cover ${dateStr} so it doesn't break your streak. You have ${freezeBalance} freeze${freezeBalance === 1 ? '' : 's'} available.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use Freeze',
          onPress: async () => {
            setUsingFreezeFor(dateStr);
            setError(null);
            try {
              const success = await useStreakFreeze(dateStr);
              if (!success) setError("Couldn't use a freeze for that day.");
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setUsingFreezeFor(null);
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    setSharing(true);
    setError(null);
    try {
      if (!shareCardRef.current) throw new Error('Nothing to share yet.');
      const uri = await shareCardRef.current.capture();
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setError('Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  };

  const weekDatesLogged = useMemo(() => {
    const start = startOfWeek(today);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (monthLoggedDates.has(toDateStr(d))) count++;
    }
    return count;
  }, [monthLoggedDates, today]);

  const monthGrid = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = firstDay.getDay();
    const cells: { day: number | null; dateStr: string | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, dateStr: toDateStr(new Date(year, month, d)) });
    }
    return cells;
  }, [today]);

  const todayStr = toDateStr(today);
  const gamificationMessage = loggedToday
    ? `🔥 Nice work! You're at ${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}.`
    : `🔥 Keep going! Complete today's activity to reach ${currentStreak + 1} days.`;

  const caloriesEstimate = weightKg && totalMinutes > 0 ? estimateCalories(totalMinutes, weightKg) : null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={dark.accent} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={dark.accent} />}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Streaks</Text>

            <View style={styles.heroRow}>
              <View style={styles.streakCard}>
                <Text style={styles.streakNumber}>{currentStreak > 0 ? '🔥' : ''} {currentStreak}</Text>
                <Text style={styles.streakLabel}>day streak</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{longestStreak}</Text>
                    <Text style={styles.statLabel}>Longest</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{totalWorkouts}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                </View>
              </View>

              <View style={styles.ringCard}>
                <View style={styles.ringWrap}>
                  <ProgressRing progress={weekDatesLogged / weeklyTarget} />
                  <View style={styles.ringCenter}>
                    <Text style={styles.ringValue}>{weekDatesLogged}/{weeklyTarget}</Text>
                  </View>
                </View>
                <Text style={styles.ringLabel}>Weekly goal</Text>
              </View>
            </View>

            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Weekly goal:</Text>
              {WEEKLY_TARGET_OPTIONS.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.targetChip, weeklyTarget === t && styles.targetChipActive]}
                  onPress={() => handleWeeklyTargetChange(t)}
                >
                  <Text style={[styles.targetChipText, weeklyTarget === t && styles.targetChipTextActive]}>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.gamificationBanner}>
              <Text style={styles.gamificationText}>{gamificationMessage}</Text>
            </View>

            {durationPickerOpen ? (
              <View style={styles.durationCard}>
                <Text style={styles.durationLabel}>How long was today's session?</Text>
                <View style={styles.durationRow}>
                  {DURATION_OPTIONS.map((min) => (
                    <Pressable
                      key={min}
                      style={styles.durationChip}
                      onPress={() => commitLog(min)}
                      disabled={logging}
                    >
                      <Text style={styles.durationChipText}>{min}m</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => commitLog(null)} disabled={logging}>
                  <Text style={styles.durationSkip}>{logging ? 'Logging...' : 'Skip — just log the day'}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.logButton, loggedToday && styles.logButtonDone]}
                onPress={() => setDurationPickerOpen(true)}
                disabled={loggedToday || logging}
              >
                <Text style={[styles.logButtonText, loggedToday && styles.logButtonTextDone]}>
                  {loggedToday ? "✓ Logged today's workout" : "Log today's workout"}
                </Text>
              </Pressable>
            )}

            <WorkoutReminderCard />

            <View style={styles.freezeCard}>
              <Text style={styles.freezeIcon}>❄️</Text>
              <View style={styles.freezeInfo}>
                <Text style={styles.freezeTitle}>
                  {freezeBalance} Streak Freeze{freezeBalance === 1 ? '' : 's'} available
                </Text>
                <Text style={styles.freezeSubtitle}>
                  Earned every 7-day streak (up to 5 banked). Tap a missed day below to use one.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Milestones</Text>
            <MilestoneBadges longestStreak={longestStreak} />

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              {today.toLocaleString('default', { month: 'long' })}
            </Text>
            <View style={styles.calendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Text key={`h-${i}`} style={styles.calendarHeaderCell}>{d}</Text>
              ))}
              {monthGrid.map((cell, i) => {
                const isLogged = !!cell.dateStr && monthLoggedDates.has(cell.dateStr);
                const isFrozen = !!cell.dateStr && monthFrozenDates.has(cell.dateStr);
                const isPast = !!cell.dateStr && cell.dateStr < todayStr;
                const isMissable = isPast && !isLogged && !isFrozen && freezeBalance > 0;
                const isBusy = !!cell.dateStr && usingFreezeFor === cell.dateStr;

                return (
                  <Pressable
                    key={i}
                    style={[
                      styles.calendarCell,
                      isLogged && styles.calendarCellDone,
                      isFrozen && styles.calendarCellFrozen,
                      cell.dateStr === todayStr && styles.calendarCellToday,
                    ]}
                    disabled={!isMissable || isBusy}
                    onPress={() => cell.dateStr && handleUseFreeze(cell.dateStr)}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={dark.text} />
                    ) : cell.day != null ? (
                      <Text style={styles.calendarCellText}>{isFrozen ? '❄️' : cell.day}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Total Volume</Text>
            <View style={styles.volumeRow}>
              <View style={styles.volumeBox}>
                <Text style={styles.volumeValue}>{totalWorkouts}</Text>
                <Text style={styles.volumeLabel}>Workouts</Text>
              </View>
              <View style={styles.volumeBox}>
                <Text style={styles.volumeValue}>{totalMinutes > 0 ? totalMinutes : '—'}</Text>
                <Text style={styles.volumeLabel}>Minutes Active</Text>
              </View>
              <View style={styles.volumeBox}>
                <Text style={styles.volumeValue}>{caloriesEstimate ?? '—'}</Text>
                <Text style={styles.volumeLabel}>Est. Calories</Text>
              </View>
            </View>
            {totalMinutes > 0 && sessionsWithDuration < totalWorkouts && (
              <Text style={styles.volumeNote}>
                Based on {sessionsWithDuration} of {totalWorkouts} logged sessions with a duration.
              </Text>
            )}
            {!weightKg && totalMinutes > 0 && (
              <Text style={styles.volumeNote}>Add your weight in Profile to estimate calories burned.</Text>
            )}

            <Pressable style={styles.shareButton} onPress={handleShare} disabled={sharing}>
              {sharing ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Text style={styles.shareButtonText}>📤 Share My Streak</Text>
              )}
            </Pressable>

            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  placeholder="Your display name"
                  placeholderTextColor={dark.textFaint}
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={30}
                />
                <Pressable onPress={handleSaveName}>
                  <Text style={styles.nameSave}>Save</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setEditingName(true)} style={styles.nameRow}>
                <Text style={styles.nameLabel}>
                  Leaderboard name: <Text style={styles.nameValue}>{displayName}</Text>
                </Text>
                <Text style={styles.nameEdit}>Edit</Text>
              </Pressable>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Text style={styles.sectionTitle}>Leaderboard</Text>
          </>
        }
        data={leaderboard}
        keyExtractor={(item) => item.user_id}
        ListEmptyComponent={
          <EmptyStateCard
            image={require('../assets/photos/empty_streaks.jpg')}
            title="No streaks yet"
            subtitle="Log a workout today and be the first on the board."
          />
        }
        renderItem={({ item, index }) => (
          <View style={[styles.row, item.user_id === userId && styles.rowMe]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.rowName}>
              {item.display_name}
              {item.user_id === userId ? ' (you)' : ''}
            </Text>
            <View style={styles.rowStats}>
              <Text style={styles.rowStreak}>🔥 {item.current_streak}</Text>
              <Text style={styles.rowTotal}>{item.total_workouts} total</Text>
            </View>
          </View>
        )}
      />

      <View style={[styles.offscreen, { pointerEvents: 'none' }]}>
        <StreakShareCard ref={shareCardRef} streak={currentStreak} longestStreak={longestStreak} displayName={displayName} />
      </View>

      <MilestoneCelebrationModal milestone={celebrationMilestone} onClose={() => setCelebrationMilestone(null)} />
    </>
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
    marginBottom: 12,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  streakCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  streakNumber: {
    color: dark.text,
    fontSize: 34,
    fontWeight: '800',
  },
  streakLabel: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: dark.border,
  },
  statValue: {
    color: dark.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: dark.textFaint,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  ringCard: {
    width: 130,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringValue: {
    color: dark.text,
    fontSize: 16,
    fontWeight: '700',
  },
  ringLabel: {
    color: dark.textFaint,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  targetLabel: {
    color: dark.textFaint,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 2,
  },
  targetChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  targetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: dark.textMuted,
  },
  targetChipTextActive: {
    color: '#0a0a0a',
  },
  gamificationBanner: {
    backgroundColor: dark.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: dark.accentDark,
    padding: 12,
    marginBottom: 12,
  },
  gamificationText: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  logButton: {
    backgroundColor: dark.accent,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  logButtonDone: {
    backgroundColor: dark.surfaceElevated,
    borderWidth: 1,
    borderColor: dark.accent,
  },
  logButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 14,
  },
  logButtonTextDone: {
    color: dark.accent,
  },
  durationCard: {
    borderWidth: 1,
    borderColor: dark.accent,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  durationLabel: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  durationChip: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  durationChipText: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
  },
  durationSkip: {
    color: dark.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  freezeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  freezeIcon: {
    fontSize: 26,
  },
  freezeInfo: {
    flex: 1,
  },
  freezeTitle: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
  },
  freezeSubtitle: {
    color: dark.textFaint,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  sectionTitle: {
    color: dark.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  calendarHeaderCell: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: dark.textFaint,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  calendarCellDone: {
    backgroundColor: dark.accentDark,
    borderRadius: 8,
  },
  calendarCellFrozen: {
    backgroundColor: dark.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  calendarCellToday: {
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 8,
  },
  calendarCellText: {
    color: dark.text,
    fontSize: 12,
    fontWeight: '600',
  },
  volumeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  volumeBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  volumeValue: {
    color: dark.accent,
    fontSize: 20,
    fontWeight: '800',
  },
  volumeLabel: {
    color: dark.textFaint,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  volumeNote: {
    color: dark.textFaint,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  shareButtonText: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  nameLabel: {
    fontSize: 13,
    color: dark.textMuted,
  },
  nameValue: {
    fontWeight: '700',
    color: dark.text,
  },
  nameEdit: {
    fontSize: 13,
    color: dark.accent,
    fontWeight: '600',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  nameSave: {
    color: dark.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  error: {
    color: dark.danger,
    marginBottom: 12,
  },
  empty: {
    color: dark.textFaint,
    textAlign: 'center',
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  rowMe: {
    borderColor: dark.accent,
    backgroundColor: dark.surfaceElevated,
  },
  rank: {
    width: 24,
    fontSize: 13,
    color: dark.textFaint,
    fontWeight: '700',
  },
  rowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: dark.text,
  },
  rowStats: {
    alignItems: 'flex-end',
  },
  rowStreak: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.text,
  },
  rowTotal: {
    fontSize: 11,
    color: dark.textFaint,
  },
  offscreen: {
    position: 'absolute',
    top: -9999,
    left: -9999,
  },
});
