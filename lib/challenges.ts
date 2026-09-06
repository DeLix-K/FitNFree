import { supabase } from './supabase';
import type {
  Challenge,
  ChallengeActivityKind,
  ChallengeActivityView,
  ChallengeInviteView,
  ChallengeProgress,
  ChallengeReactionType,
  ChallengeStage,
  ChallengeStageProgress,
  ChallengeTeam,
  ChallengeTeamProgress,
} from './types';

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getChallengeStatus(
  challenge: Pick<Challenge, 'start_date' | 'end_date'>
): 'active' | 'upcoming' | 'past' {
  const today = todayLocalDate();
  if (today < challenge.start_date) return 'upcoming';
  if (today > challenge.end_date) return 'past';
  return 'active';
}

export async function fetchChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .order('start_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchChallengeStats(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('challenge_stats').select('*');
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.challenge_id] = row.participant_count;
  return counts;
}

export async function fetchMyProgress(): Promise<ChallengeProgress[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('challenge_progress')
    .select('*')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchChallengeLeaderboard(challengeId: string): Promise<ChallengeProgress[]> {
  const { data, error } = await supabase
    .from('challenge_progress')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('workouts_logged', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Consistency % (of days elapsed so far) and Personal Improvement % (vs the
// user's own real pre-challenge baseline) -- both purely derived from real
// data already on the row, computed client-side so no extra round trip.
export function consistencyPct(row: ChallengeProgress, challenge: Challenge): number {
  const today = todayLocalDate();
  const start = new Date(challenge.start_date);
  const end = today < challenge.end_date ? new Date(today) : new Date(challenge.end_date);
  const daysElapsed = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return Math.min(100, Math.round(((row.workouts_logged + row.shields_used) / daysElapsed) * 100));
}

export function improvementPct(row: ChallengeProgress, challenge: Challenge): number | null {
  if (row.baseline_workouts_per_week <= 0) return null;
  const durationWeeks = Math.max(
    1,
    (new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) / (7 * 86400000) + 1 / 7
  );
  const currentPerWeek = row.workouts_logged / durationWeeks;
  return Math.round(((currentPerWeek - row.baseline_workouts_per_week) / row.baseline_workouts_per_week) * 100);
}

export async function joinChallenge(challengeId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  // Adaptive scaling: computed once, server-side, from the user's real
  // recent workout history -- never trusts a client-supplied number.
  const { data: personalTarget, error: rpcError } = await supabase.rpc('compute_adaptive_target', {
    p_user_id: userId,
    p_challenge_id: challengeId,
  });
  if (rpcError) throw new Error(rpcError.message);

  const { error } = await supabase
    .from('challenge_participants')
    .insert({ challenge_id: challengeId, user_id: userId, personal_target: personalTarget });

  if (error) throw new Error(error.message);

  await postChallengeActivity(challengeId, 'joined').catch(() => {});
}

export async function leaveChallenge(challengeId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function updateCommitment(challengeId: string, commitment: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('challenge_participants')
    .update({ commitment: commitment.trim() })
    .eq('challenge_id', challengeId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function useChallengeShield(challengeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('use_challenge_shield', { p_challenge_id: challengeId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export type CreateChallengeStageInput = {
  title: string;
  description: string;
  durationDays: number;
  targetWorkouts: number;
};

export async function createChallenge(params: {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  targetWorkouts: number;
  targetNote: string;
  premiumOnly?: boolean;
  hostedByTrainerId?: string | null;
  stages?: CreateChallengeStageInput[];
}): Promise<Challenge> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('challenges')
    .insert({
      title: params.title.trim(),
      description: params.description.trim(),
      start_date: params.startDate,
      end_date: params.endDate,
      target_workouts: params.targetWorkouts,
      target_note: params.targetNote.trim(),
      creator_user_id: userId,
      premium_only: params.premiumOnly ?? false,
      hosted_by_trainer_id: params.hostedByTrainerId ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (params.stages && params.stages.length > 0) {
    const rows = params.stages.map((s, i) => ({
      challenge_id: data.id,
      order_index: i,
      title: s.title.trim(),
      description: s.description.trim(),
      duration_days: s.durationDays,
      target_workouts: s.targetWorkouts,
    }));
    const { error: stagesError } = await supabase.from('challenge_stages').insert(rows);
    if (stagesError) throw new Error(stagesError.message);
  }

  // Creating a challenge doesn't automatically join it, so do that now --
  // it would be strange for the creator not to be a participant.
  await joinChallenge(data.id);

  return data;
}

export async function fetchChallengeStages(challengeId: string): Promise<ChallengeStage[]> {
  const { data, error } = await supabase
    .from('challenge_stages')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('order_index', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMyStageProgress(challengeId: string): Promise<ChallengeStageProgress[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('challenge_stage_progress')
    .select('*')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .order('order_index', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────
// Squads
// ─────────────────────────────────────────────

export async function fetchTeams(challengeId: string): Promise<ChallengeTeam[]> {
  const { data, error } = await supabase
    .from('challenge_teams')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTeamProgress(challengeId: string): Promise<ChallengeTeamProgress[]> {
  const { data, error } = await supabase
    .from('challenge_team_progress')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('total_workouts_logged', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMyTeamId(challengeId: string): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('challenge_team_members')
    .select('team_id')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.team_id ?? null;
}

export async function createTeam(challengeId: string, name: string): Promise<ChallengeTeam> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('challenge_teams')
    .insert({ challenge_id: challengeId, name: name.trim(), created_by: userId })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await joinTeam(data.id);
  return data;
}

export async function joinTeam(teamId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase.from('challenge_team_members').insert({ team_id: teamId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function leaveTeam(teamId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('challenge_team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────
// Activity feed + reactions
// ─────────────────────────────────────────────

export async function postChallengeActivity(challengeId: string, kind: ChallengeActivityKind): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  await supabase.from('challenge_activity').insert({ challenge_id: challengeId, user_id: userId, kind });
}

// Posts a "logged_day" activity event into every currently-active
// challenge the user is enrolled in -- called right after a real workout
// log, never fabricated separately from that.
export async function recordActivityForActiveChallenges(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  const today = todayLocalDate();
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('challenge_id, challenges!inner(start_date, end_date)')
    .eq('user_id', userId);

  if (error || !data) return;

  const activeChallengeIds = (
    data as unknown as { challenge_id: string; challenges: { start_date: string; end_date: string } }[]
  )
    .filter((row) => row.challenges.start_date <= today && today <= row.challenges.end_date)
    .map((row) => row.challenge_id);

  await Promise.all(activeChallengeIds.map((id) => postChallengeActivity(id, 'logged_day')));
}

const KIND_LABEL: Record<ChallengeActivityKind, (name: string) => string> = {
  joined: (name) => `${name} joined the challenge`,
  logged_day: (name) => `${name} logged a day`,
  completed: (name) => `${name} completed the challenge! 🎉`,
};

export function activityMessage(kind: ChallengeActivityKind, displayName: string): string {
  return KIND_LABEL[kind](displayName);
}

export async function fetchChallengeActivity(challengeId: string): Promise<ChallengeActivityView[]> {
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id;

  const { data, error } = await supabase
    .from('challenge_activity')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: names } = await supabase.from('leaderboard').select('user_id, display_name').in('user_id', userIds);
  const nameById = new Map((names ?? []).map((n) => [n.user_id as string, n.display_name as string]));

  const activityIds = rows.map((r) => r.id);
  const { data: reactions } = await supabase
    .from('challenge_reactions')
    .select('*')
    .in('activity_id', activityIds);

  return rows.map((row) => {
    const rowReactions = (reactions ?? []).filter((r) => r.activity_id === row.id);
    return {
      ...row,
      display_name: nameById.get(row.user_id) ?? 'Fitness Fan',
      reactions: {
        high_five: rowReactions.filter((r) => r.reaction_type === 'high_five').length,
        boost: rowReactions.filter((r) => r.reaction_type === 'boost').length,
        myReactions: rowReactions.filter((r) => r.from_user_id === myId).map((r) => r.reaction_type),
      },
    };
  });
}

export async function sendReaction(activityId: string, reactionType: ChallengeReactionType): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('challenge_reactions')
    .insert({ activity_id: activityId, from_user_id: userId, reaction_type: reactionType });

  if (error) throw new Error(error.message);
}

// Live updates via Supabase Realtime -- genuinely live, not polled.
export function subscribeToChallengeActivity(challengeId: string, onChange: () => void) {
  const channel = supabase
    .channel(`challenge-activity-${challengeId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'challenge_activity', filter: `challenge_id=eq.${challengeId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'challenge_reactions' },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─────────────────────────────────────────────
// Invites (unchanged from before)
// ─────────────────────────────────────────────

export type UserSearchResult = { userId: string; displayName: string };

// Search among real FitNFree users (via the public leaderboard view) to
// invite to a challenge -- excludes the caller themself.
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  const { data, error } = await supabase
    .from('leaderboard')
    .select('user_id, display_name')
    .ilike('display_name', `%${trimmed}%`)
    .limit(20);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => row.user_id !== userId)
    .map((row) => ({ userId: row.user_id, displayName: row.display_name }));
}

export async function sendChallengeInvite(challengeId: string, inviteeUserId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const { error } = await supabase.from('challenge_invites').insert({
    challenge_id: challengeId,
    inviter_user_id: userId,
    invitee_user_id: inviteeUserId,
  });

  if (error) throw new Error(error.message);
}

export async function fetchMyChallengeInvites(): Promise<ChallengeInviteView[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('challenge_invites')
    .select('*, challenges(title)')
    .eq('invitee_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (ChallengeInviteView & {
    challenges: { title: string } | null;
  })[];

  const inviterIds = Array.from(new Set(rows.map((r) => r.inviter_user_id)));
  let namesById = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data: names } = await supabase
      .from('leaderboard')
      .select('user_id, display_name')
      .in('user_id', inviterIds);
    namesById = new Map((names ?? []).map((n) => [n.user_id as string, n.display_name as string]));
  }

  return rows.map((r) => ({
    ...r,
    challenge_title: r.challenges?.title ?? 'a challenge',
    inviter_display_name: namesById.get(r.inviter_user_id) ?? 'A FitNFree user',
  }));
}

export async function respondToChallengeInvite(inviteId: string, accept: boolean, challengeId: string): Promise<void> {
  const { error } = await supabase
    .from('challenge_invites')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', inviteId);

  if (error) throw new Error(error.message);

  if (accept) await joinChallenge(challengeId);
}

// ─────────────────────────────────────────────
// Trainer hosting
// ─────────────────────────────────────────────

export async function fetchMyTrainerProfileId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data } = await supabase.from('trainer_profiles').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}
