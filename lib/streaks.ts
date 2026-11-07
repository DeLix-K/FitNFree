import { assertCleanText } from './contentFilter';
import { supabase } from './supabase';
import type { LeaderboardEntry, StreakFreezeBalance } from './types';

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function hasLoggedToday(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return false;

  const { data } = await supabase
    .from('workout_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('logged_date', todayLocalDate())
    .maybeSingle();

  return !!data;
}

export async function logWorkoutToday(durationMinutes?: number | null): Promise<void> {
  return logWorkoutOn(todayLocalDate(), durationMinutes);
}

// Logs a workout for a given local day ("YYYY-MM-DD"). Logging the same day twice changes nothing. The Apple Watch uses this for the day the
// person tapped "Log today's workout" (lib/watchRequests.ts), which can arrive after midnight.
export async function logWorkoutOn(localDate: string, durationMinutes?: number | null): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('workout_logs')
    .upsert(
      {
        user_id: userId,
        logged_date: localDate,
        duration_minutes: durationMinutes ?? null,
      },
      { onConflict: 'user_id,logged_date', ignoreDuplicates: true }
    );

  if (error) throw new Error(error.message);
}

export async function getMyStats(): Promise<{
  currentStreak: number;
  longestStreak: number;
  totalWorkouts: number;
  displayName: string;
}> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { currentStreak: 0, longestStreak: 0, totalWorkouts: 0, displayName: 'Fitness Fan' };

  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    currentStreak: data?.current_streak ?? 0,
    longestStreak: data?.longest_streak ?? 0,
    totalWorkouts: data?.total_workouts ?? 0,
    displayName: data?.display_name ?? 'Fitness Fan',
  };
}

// Returns the set of "YYYY-MM-DD" dates (inclusive) the user logged a
// workout on, for the given range -- powers both the monthly calendar and
// the "this week's consistency" count on the redesigned Streaks screen.
export async function fetchLoggedDates(startDate: string, endDate: string): Promise<Set<string>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return new Set();

  const { data, error } = await supabase
    .from('workout_logs')
    .select('logged_date')
    .eq('user_id', userId)
    .gte('logged_date', startDate)
    .lte('logged_date', endDate);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.logged_date as string));
}

// Which dates in the given range are covered by a spent streak freeze
// (shown distinctly on the calendar, e.g. a snowflake, from a real logged
// workout).
export async function fetchFreezeCoveredDates(startDate: string, endDate: string): Promise<Set<string>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return new Set();

  const { data, error } = await supabase
    .from('streak_freeze_uses')
    .select('covered_date')
    .eq('user_id', userId)
    .gte('covered_date', startDate)
    .lte('covered_date', endDate);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.covered_date as string));
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('current_streak', { ascending: false })
    .order('total_workouts', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateDisplayName(name: string): Promise<void> {
  assertCleanText('Your display name', name);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

export async function fetchWeeklyTarget(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return 5;

  const { data, error } = await supabase
    .from('profiles')
    .select('weekly_workout_target')
    .eq('id', userId)
    .single();

  if (error) throw new Error(error.message);
  return data?.weekly_workout_target ?? 5;
}

export async function updateWeeklyTarget(target: number): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('profiles')
    .update({ weekly_workout_target: target })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

// Sum of real logged session durations. Only counts days where a duration
// was actually entered -- silently skips days logged without one, rather
// than guessing.
export async function fetchTotalDurationMinutes(): Promise<{ totalMinutes: number; sessionsWithDuration: number }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { totalMinutes: 0, sessionsWithDuration: 0 };

  const { data, error } = await supabase
    .from('workout_logs')
    .select('duration_minutes')
    .eq('user_id', userId)
    .not('duration_minutes', 'is', null);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { duration_minutes: number }[];
  return {
    totalMinutes: rows.reduce((sum, r) => sum + r.duration_minutes, 0),
    sessionsWithDuration: rows.length,
  };
}

export async function fetchStreakFreezeBalance(): Promise<StreakFreezeBalance | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('streak_freezes')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// Recomputes the real current streak server-side and grants any newly
// earned freezes (server-enforced via a SECURITY DEFINER function -- the
// client never sets its own balance directly). Safe to call on every
// Streaks screen load.
export async function grantStreakFreezeIfEarned(): Promise<number> {
  const { data, error } = await supabase.rpc('grant_streak_freeze_if_earned');
  if (error) throw new Error(error.message);
  return data as number;
}

export async function useStreakFreeze(coveredDate: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('use_streak_freeze', { p_covered_date: coveredDate });
  if (error) throw new Error(error.message);
  return data as boolean;
}
