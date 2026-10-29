import { bestRecords, fromKg, readAllPages, toKg } from './prBadges';
import { supabase } from './supabase';
import type { Exercise, ExerciseSetLog } from './types';

export function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Same locale heuristic used for the Bench Press challenge template.
export function detectWeightUnit(): 'kg' | 'lb' {
  try {
    const locale = Intl.NumberFormat().resolvedOptions().locale;
    return locale.toUpperCase().includes('US') ? 'lb' : 'kg';
  } catch {
    return 'kg';
  }
}

// muscle_groups is ordered primary-first in every catalog row (see
// exercises_overhaul.sql) -- these two helpers are the single source of
// truth for that convention so it's never re-guessed inconsistently.
export function primaryMuscle(exercise: Exercise): string | null {
  return exercise.muscle_groups[0] ?? null;
}

export function secondaryMuscles(exercise: Exercise): string[] {
  return exercise.muscle_groups.slice(1);
}

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCustomExercise(params: {
  name: string;
  category: Exercise['category'];
  muscleGroups: string[];
  equipment: string[];
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase.from('exercises').insert({
    name: params.name.trim(),
    category: params.category,
    muscle_groups: params.muscleGroups,
    equipment: params.equipment,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCustomExercise(exerciseId: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', exerciseId);
  if (error) throw new Error(error.message);
}

export async function fetchSavedExerciseIds(): Promise<Set<string>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return new Set();

  const { data, error } = await supabase.from('saved_exercises').select('exercise_id').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { exercise_id: string }) => r.exercise_id));
}

export async function setExerciseSaved(exerciseId: string, saved: boolean): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  if (saved) {
    const { error } = await supabase.from('saved_exercises').insert({ user_id: userId, exercise_id: exerciseId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('saved_exercises')
      .delete()
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId);
    if (error) throw new Error(error.message);
  }
}

// ─────────────────────────────────────────────
// Quick-add to an existing plan -- reuses workout_plans/workout_plan_exercises
// exactly as the Plans tab does, no new schema.
// ─────────────────────────────────────────────
export type PlanOption = { id: string; name: string };

export async function fetchMyPlans(): Promise<PlanOption[]> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, name')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addExerciseToPlan(planId: string, exerciseId: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('workout_plan_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('workout_plan_id', planId);
  if (countError) throw new Error(countError.message);

  const { error } = await supabase.from('workout_plan_exercises').insert({
    workout_plan_id: planId,
    exercise_id: exerciseId,
    order_index: count ?? 0,
  });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Smart substitution: real filtering over the real catalog -- same primary
// muscle, different exercise, optionally narrowed by equipment or
// joint-friendliness. Never invents an exercise that isn't in the catalog.
// ─────────────────────────────────────────────
export function findSubstitutes(
  exercise: Exercise,
  allExercises: Exercise[],
  opts: { equipment?: string | null; lowImpactOnly?: boolean } = {}
): Exercise[] {
  const primary = primaryMuscle(exercise);
  if (!primary) return [];

  return allExercises.filter((e) => {
    if (e.id === exercise.id) return false;
    if (primaryMuscle(e) !== primary) return false;
    if (opts.lowImpactOnly && !e.low_impact) return false;
    if (opts.equipment) {
      const wantsBodyweight = opts.equipment === 'bodyweight';
      if (wantsBodyweight && e.equipment.length > 0) return false;
      if (!wantsBodyweight && !e.equipment.includes(opts.equipment)) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────
// Antagonist superset pairing: a small, hand-curated map of well-known
// agonist/antagonist muscle pairs (standard training knowledge), applied
// to the real catalog. Labeled as "commonly paired," not as data mined
// from real usage, since this app doesn't have per-set usage stats to mine
// yet for that claim.
// ─────────────────────────────────────────────
const ANTAGONIST_MUSCLE: Record<string, string> = {
  chest: 'back',
  back: 'chest',
  biceps: 'triceps',
  triceps: 'biceps',
  quadriceps: 'hamstrings',
  hamstrings: 'quadriceps',
};

export function findAntagonistCombo(exercise: Exercise, allExercises: Exercise[]): Exercise | null {
  const primary = primaryMuscle(exercise);
  if (!primary) return null;
  const antagonist = ANTAGONIST_MUSCLE[primary];
  if (!antagonist) return null;

  return allExercises.find((e) => e.id !== exercise.id && primaryMuscle(e) === antagonist) ?? null;
}

// ─────────────────────────────────────────────
// Real per-set logging -> real PR / volume / estimated-1RM history.
// ─────────────────────────────────────────────
export async function logExerciseSet(params: {
  exerciseId: string;
  weight: number;
  weightUnit: 'kg' | 'lb';
  reps: number;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase.from('exercise_set_logs').insert({
    user_id: userId,
    exercise_id: params.exerciseId,
    logged_date: todayLocalDate(),
    weight: params.weight,
    weight_unit: params.weightUnit,
    reps: params.reps,
  });
  if (error) throw new Error(error.message);
}

export async function fetchExerciseSetHistory(exerciseId: string, days = 180): Promise<ExerciseSetLog[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .gte('logged_date', since)
    .order('logged_date', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Every set ever logged for an exercise, oldest first, which is what personal records need (they are all-time, not "the last 180 days").
// It is read a page at a time (see readAllPages), because the database limits how many rows one request returns. `complete` is false only if the
// safety limit of 10,000 sets was reached; records are not announced from an incomplete list.
export async function fetchAllExerciseSets(exerciseId: string): Promise<{ rows: ExerciseSetLog[]; complete: boolean }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { rows: [], complete: true };

  return readAllPages<ExerciseSetLog>(async (from, to) => {
    const { data, error } = await supabase
      .from('exercise_set_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .order('logged_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

// Every set the person has ever logged, for every exercise, with the exercise's name, for the "My records" list. Read a page at a time in a fixed order
// (the database limits each request). `complete` is false only if the safety limit of 50,000 sets was reached, in which case the screen says the list may be out of date.
export async function fetchAllSetsWithNames(): Promise<{ rows: (ExerciseSetLog & { exercises?: { name: string } | { name: string }[] | null })[]; complete: boolean }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { rows: [], complete: true };

  return readAllPages(
    async (from, to) => {
      const { data, error } = await supabase
        .from('exercise_set_logs')
        .select('id, exercise_id, logged_date, weight, weight_unit, reps, created_at, exercises(name)')
        .eq('user_id', userId)
        .order('logged_date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as (ExerciseSetLog & { exercises?: { name: string } | { name: string }[] | null })[];
    },
    1000,
    50_000,
    120
  );
}

export type ExercisePr = {
  bestWeight: number;
  bestWeightUnit: 'kg' | 'lb';
  bestEst1RM: number;
  totalSets: number;
} | null;

// The current records, shown in `unit` (default: the unit of the latest set). "Heaviest" is the heaviest weight lifted, and the estimated 1RM
// is the best Epley estimate from sets of 12 reps or fewer (see lib/prBadges.ts). Weights logged in kg and lb are compared properly.
export function computePr(history: ExerciseSetLog[], unit: 'kg' | 'lb' = history[history.length - 1]?.weight_unit ?? detectWeightUnit()): ExercisePr {
  if (history.length === 0) return null;
  const r = bestRecords(history);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    bestWeight: r.heaviest ? round1(fromKg(toKg(r.heaviest.weight, r.heaviest.weight_unit), unit)) : 0,
    bestWeightUnit: unit,
    bestEst1RM: r.bestE1rm ? round1(fromKg(r.bestE1rm.kg, unit)) : 0,
    totalSets: r.totalSets,
  };
}

// One point per day: total volume (weight * reps summed across that day's
// sets) -- for the inline volume trend chart.
export function volumeByDate(history: ExerciseSetLog[]): { date: string; volume: number }[] {
  const byDate = new Map<string, number>();
  for (const log of history) {
    byDate.set(log.logged_date, (byDate.get(log.logged_date) ?? 0) + log.weight * log.reps);
  }
  return [...byDate.entries()].map(([date, volume]) => ({ date, volume })).sort((a, b) => a.date.localeCompare(b.date));
}
