import ReportContentButton from '../components/ReportContentButton';
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
import ChallengeActivityFeed from '../components/ChallengeActivityFeed';
import ChallengeSquadPanel from '../components/ChallengeSquadPanel';
import ChallengeStageTimeline from '../components/ChallengeStageTimeline';
import CreateChallengeModal from '../components/CreateChallengeModal';
import EmptyStateCard from '../components/EmptyStateCard';
import InviteFriendsModal from '../components/InviteFriendsModal';
import {
  consistencyPct,
  fetchChallengeLeaderboard,
  fetchChallenges,
  fetchChallengeStats,
  fetchMyChallengeInvites,
  fetchMyProgress,
  getChallengeStatus,
  improvementPct,
  joinChallenge,
  leaveChallenge,
  postChallengeActivity,
  respondToChallengeInvite,
  updateCommitment,
  useChallengeShield,
} from '../lib/challenges';
import { fetchStreakFreezeBalance } from '../lib/streaks';
import { getIsPremium } from '../lib/subscription';
import { startCheckout } from '../lib/billing';
import { supabase } from '../lib/supabase';
import { dark } from '../lib/theme';
import type { Challenge, ChallengeInviteView, ChallengeProgress } from '../lib/types';

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  past: 'Ended',
};

type Tab = 'active' | 'popular' | 'new' | 'completed';
const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'popular', label: 'Popular' },
  { key: 'new', label: 'New' },
  { key: 'completed', label: 'Completed' },
];

type LeaderboardSort = 'total' | 'consistency' | 'improvement';
const SORT_TABS: { key: LeaderboardSort; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'consistency', label: 'Consistency %' },
  { key: 'improvement', label: 'Improvement %' },
];

export default function ChallengesScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [freezeBalance, setFreezeBalance] = useState(0);
  const [tab, setTab] = useState<Tab>('active');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [myProgress, setMyProgress] = useState<Record<string, ChallengeProgress>>({});
  const [trainerNames, setTrainerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shieldBusyId, setShieldBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedBoard, setExpandedBoard] = useState<ChallengeProgress[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>('total');
  const [commitmentDrafts, setCommitmentDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<ChallengeInviteView[]>([]);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<Challenge | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const previousProgress = myProgress;
    try {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);

      const [list, statCounts, progress, myInvites, premium, freezes] = await Promise.all([
        fetchChallenges(),
        fetchChallengeStats(),
        fetchMyProgress(),
        fetchMyChallengeInvites(),
        getIsPremium(),
        fetchStreakFreezeBalance(),
      ]);
      setChallenges(list);
      setStats(statCounts);
      const progressMap: Record<string, ChallengeProgress> = {};
      for (const row of progress) progressMap[row.challenge_id] = row;
      setMyProgress(progressMap);
      setInvites(myInvites);
      setIsPremium(premium);
      setFreezeBalance(freezes?.balance ?? 0);

      // Post a real 'completed' activity the moment a challenge transitions
      // from incomplete to complete -- checked once per load, so it never
      // double-posts on a later reload of an already-completed challenge.
      for (const row of progress) {
        const prev = previousProgress[row.challenge_id];
        const wasComplete = prev && prev.workouts_logged + prev.shields_used >= prev.effective_target;
        const nowComplete = row.workouts_logged + row.shields_used >= row.effective_target;
        if (nowComplete && !wasComplete) {
          postChallengeActivity(row.challenge_id, 'completed').catch(() => {});
        }
      }

      const hostedIds = Array.from(new Set(list.map((c) => c.hosted_by_trainer_id).filter(Boolean))) as string[];
      if (hostedIds.length > 0) {
        const { data: trainers } = await supabase.from('trainer_profiles').select('id, display_name').in('id', hostedIds);
        setTrainerNames(Object.fromEntries((trainers ?? []).map((t) => [t.id, t.display_name])));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleJoin = async (challenge: Challenge) => {
    if (challenge.premium_only && !isPremium) {
      try {
        await startCheckout();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    setBusyId(challenge.id);
    setError(null);
    try {
      await joinChallenge(challenge.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleLeave = async (challengeId: string) => {
    setBusyId(challengeId);
    setError(null);
    try {
      await leaveChallenge(challengeId);
      if (expandedId === challengeId) setExpandedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleUseShield = async (challengeId: string) => {
    setShieldBusyId(challengeId);
    setError(null);
    try {
      const success = await useChallengeShield(challengeId);
      if (!success) setError("Couldn't use a shield — check your balance or the challenge's shield cap.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setShieldBusyId(null);
    }
  };

  const handleSaveCommitment = async (challengeId: string) => {
    const text = commitmentDrafts[challengeId];
    if (text == null) return;
    try {
      await updateCommitment(challengeId, text);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleInviteResponse = async (invite: ChallengeInviteView, accept: boolean) => {
    setInviteBusyId(invite.id);
    setError(null);
    try {
      await respondToChallengeInvite(invite.id, accept, invite.challenge_id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviteBusyId(null);
    }
  };

  const toggleExpanded = async (challengeId: string) => {
    if (expandedId === challengeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(challengeId);
    setLeaderboardSort('total');
    setExpandedLoading(true);
    try {
      const board = await fetchChallengeLeaderboard(challengeId);
      setExpandedBoard(board);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExpandedLoading(false);
    }
  };

  const visibleChallenges = useMemo(() => {
    switch (tab) {
      case 'active':
        return challenges
          .filter((c) => getChallengeStatus(c) === 'active')
          .sort((a, b) => a.end_date.localeCompare(b.end_date));
      case 'popular':
        return [...challenges].sort((a, b) => (stats[b.id] ?? 0) - (stats[a.id] ?? 0));
      case 'new':
        return [...challenges].sort((a, b) => b.created_at.localeCompare(a.created_at));
      case 'completed':
        return challenges.filter((c) => {
          const progress = myProgress[c.id];
          return progress && progress.workouts_logged + progress.shields_used >= progress.effective_target;
        });
    }
  }, [tab, challenges, stats, myProgress]);

  const sortedBoard = useMemo(() => {
    const challenge = challenges.find((c) => c.id === expandedId);
    if (!challenge) return expandedBoard;
    const copy = [...expandedBoard];
    if (leaderboardSort === 'consistency') {
      copy.sort((a, b) => consistencyPct(b, challenge) - consistencyPct(a, challenge));
    } else if (leaderboardSort === 'improvement') {
      copy.sort((a, b) => (improvementPct(b, challenge) ?? -999) - (improvementPct(a, challenge) ?? -999));
    } else {
      copy.sort((a, b) => b.workouts_logged - a.workouts_logged);
    }
    return copy;
  }, [expandedBoard, leaderboardSort, expandedId, challenges]);

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
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Challenges</Text>
              <Text style={styles.subtitle}>Join a challenge and log workouts to complete it.</Text>
            </View>
            <Pressable style={styles.createButton} onPress={() => setCreateOpen(true)}>
              <Text style={styles.createButtonText}>+ Create</Text>
            </Pressable>
          </View>

          {invites.length > 0 && (
            <View style={styles.invitesSection}>
              <Text style={styles.sectionTitle}>Invites</Text>
              {invites.map((invite) => (
                <View key={invite.id} style={styles.inviteRow}>
                  <Text style={styles.inviteText}>
                    <Text style={styles.inviteName}>{invite.inviter_display_name}</Text> invited you to{' '}
                    <Text style={styles.inviteName}>{invite.challenge_title}</Text>
                  </Text>
                  <View style={styles.inviteActions}>
                    <Pressable
                      style={styles.inviteAccept}
                      onPress={() => handleInviteResponse(invite, true)}
                      disabled={inviteBusyId === invite.id}
                    >
                      {inviteBusyId === invite.id ? (
                        <ActivityIndicator size="small" color="#0a0a0a" />
                      ) : (
                        <Text style={styles.inviteAcceptText}>Accept</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.inviteDecline}
                      onPress={() => handleInviteResponse(invite, false)}
                      disabled={inviteBusyId === invite.id}
                    >
                      <Text style={styles.inviteDeclineText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.tabRow}>
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </>
      }
      data={visibleChallenges}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <EmptyStateCard
          image={require('../assets/photos/empty_challenges.jpg')}
          title={tab === 'completed' ? "You haven't completed a challenge yet" : 'No challenges here yet'}
          subtitle={tab === 'completed' ? 'Finish one to see it here.' : 'Join one above, or start your own.'}
        />
      }
      renderItem={({ item: challenge }) => {
        const status = getChallengeStatus(challenge);
        const progress = myProgress[challenge.id];
        const joined = !!progress;
        const locked = challenge.premium_only && !isPremium;
        const workoutsLogged = progress?.workouts_logged ?? 0;
        const shieldsUsed = progress?.shields_used ?? 0;
        const effectiveTarget = progress?.effective_target ?? challenge.target_workouts;
        const complete = joined && workoutsLogged + shieldsUsed >= effectiveTarget;
        const pct = Math.min(1, (workoutsLogged + shieldsUsed) / effectiveTarget);
        const expanded = expandedId === challenge.id;
        const hostName = challenge.hosted_by_trainer_id ? trainerNames[challenge.hosted_by_trainer_id] : null;
        const shieldCap = Math.max(1, Math.round(effectiveTarget * 0.3));

        return (
          <View style={styles.card}>
            <Pressable onPress={() => toggleExpanded(challenge.id)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{challenge.title}</Text>
                <View style={[styles.badge, status === 'active' && styles.badgeActive]}>
                  <Text style={[styles.badgeText, status === 'active' && styles.badgeTextActive]}>
                    {STATUS_LABEL[status]}
                  </Text>
                </View>
              </View>

              <View style={styles.tagsRow}>
                {challenge.premium_only && (
                  <View style={styles.premiumTag}>
                    <Text style={styles.premiumTagText}>✨ Subscriber-Only</Text>
                  </View>
                )}
                {hostName && (
                  <View style={styles.hostTag}>
                    <Text style={styles.hostTagText}>Hosted by {hostName}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.cardDescription}>{challenge.description}</Text>
              {challenge.target_note ? (
                <Text style={styles.cardGoalNote}>{challenge.target_note}</Text>
              ) : null}
              <Text style={styles.cardMeta}>
                {challenge.start_date} → {challenge.end_date} · 🔥 {stats[challenge.id] ?? 0} participants
              </Text>

              {joined && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {complete
                      ? `✓ Completed — ${workoutsLogged + shieldsUsed}/${effectiveTarget} Days`
                      : `Progress: ${workoutsLogged + shieldsUsed}/${effectiveTarget} Days (${Math.round(pct * 100)}%)`}
                    {progress && progress.effective_target !== challenge.target_workouts
                      ? ' · personalized target'
                      : ''}
                  </Text>
                </View>
              )}
            </Pressable>

            {joined && !complete && isPremium && (
              <Pressable
                style={styles.shieldButton}
                onPress={() => handleUseShield(challenge.id)}
                disabled={shieldBusyId === challenge.id || freezeBalance < 1 || shieldsUsed >= shieldCap}
              >
                {shieldBusyId === challenge.id ? (
                  <ActivityIndicator size="small" color={dark.accent} />
                ) : (
                  <Text style={styles.shieldButtonText}>
                    🛡️ Use a Shield ({freezeBalance} available, {shieldsUsed}/{shieldCap} used here)
                  </Text>
                )}
              </Pressable>
            )}

            {joined && (
              <View style={styles.commitmentRow}>
                <TextInput
                  style={styles.commitmentInput}
                  placeholder="Your commitment (optional, shown to your squad)"
                  placeholderTextColor={dark.textFaint}
                  value={commitmentDrafts[challenge.id] ?? progress?.commitment ?? ''}
                  onChangeText={(text) => setCommitmentDrafts((d) => ({ ...d, [challenge.id]: text }))}
                  onBlur={() => handleSaveCommitment(challenge.id)}
                  maxLength={120}
                />
              </View>
            )}

            <View style={styles.cardFooter}>
              <View style={styles.cardFooterLinks}>
                <Pressable onPress={() => toggleExpanded(challenge.id)}>
                  <Text style={styles.linkText}>{expanded ? 'Hide details' : 'View details'}</Text>
                </Pressable>
                {joined && (
                  <Pressable onPress={() => setInviteTarget(challenge)}>
                    <Text style={styles.linkText}>Invite Friends</Text>
                  </Pressable>
                )}
              </View>

              {joined ? (
                <Pressable
                  style={[styles.actionButton, styles.leaveButton]}
                  onPress={() => handleLeave(challenge.id)}
                  disabled={busyId === challenge.id}
                >
                  {busyId === challenge.id ? (
                    <ActivityIndicator size="small" color={dark.danger} />
                  ) : (
                    <Text style={styles.leaveButtonText}>Leave</Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => handleJoin(challenge)}
                  disabled={busyId === challenge.id}
                >
                  {busyId === challenge.id ? (
                    <ActivityIndicator size="small" color="#0a0a0a" />
                  ) : (
                    <Text style={styles.joinButtonText}>{locked ? 'Unlock with Premium' : 'Join Challenge'}</Text>
                  )}
                </Pressable>
              )}
            </View>

            {expanded && (
              <View style={styles.expandedSection}>
                <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
                  <ReportContentButton kind="challenge" targetId={challenge.id} label={challenge.title} />
                </View>
                <View style={styles.sortRow}>
                  {SORT_TABS.map((s) => (
                    <Pressable
                      key={s.key}
                      style={[styles.sortChip, leaderboardSort === s.key && styles.sortChipActive]}
                      onPress={() => setLeaderboardSort(s.key)}
                    >
                      <Text style={[styles.sortChipText, leaderboardSort === s.key && styles.sortChipTextActive]}>
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {expandedLoading ? (
                  <ActivityIndicator style={styles.leaderboardLoading} color={dark.accent} />
                ) : sortedBoard.length === 0 ? (
                  <Text style={styles.empty}>No one has joined yet.</Text>
                ) : (
                  sortedBoard.map((row, index) => {
                    const improvement = improvementPct(row, challenge);
                    const value =
                      leaderboardSort === 'consistency'
                        ? `${consistencyPct(row, challenge)}%`
                        : leaderboardSort === 'improvement'
                          ? improvement == null
                            ? '—'
                            : `${improvement > 0 ? '+' : ''}${improvement}%`
                          : `${row.workouts_logged} workouts`;
                    return (
                      <View key={row.user_id} style={[styles.row, row.user_id === userId && styles.rowMe]}>
                        <Text style={styles.rank}>{index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowName}>
                            {row.display_name}
                            {row.user_id === userId ? ' (you)' : ''}
                          </Text>
                          {row.commitment ? <Text style={styles.rowCommitment}>"{row.commitment}"</Text> : null}
                        </View>
                        {row.user_id !== userId && (
                          <View style={{ marginRight: 10 }}>
                            <ReportContentButton kind="user" targetId={row.user_id} reportedUserId={row.user_id} label={row.display_name} />
                          </View>
                        )}
                        <Text style={styles.rowStat}>{value}</Text>
                      </View>
                    );
                  })
                )}

                <ChallengeStageTimeline challengeId={challenge.id} />
                {joined && <ChallengeSquadPanel challengeId={challenge.id} />}
                {joined && <ChallengeActivityFeed challengeId={challenge.id} />}
              </View>
            )}
          </View>
        );
      }}
    />

    <CreateChallengeModal
      visible={createOpen}
      onClose={() => setCreateOpen(false)}
      onCreated={() => {
        setCreateOpen(false);
        load();
      }}
    />

    {inviteTarget && (
      <InviteFriendsModal
        visible={!!inviteTarget}
        onClose={() => setInviteTarget(null)}
        challengeId={inviteTarget.id}
        challengeTitle={inviteTarget.title}
      />
    )}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  createButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  createButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
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
  },
  invitesSection: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.text,
    marginBottom: 8,
  },
  inviteRow: {
    borderWidth: 1,
    borderColor: dark.accent,
    backgroundColor: dark.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  inviteText: {
    fontSize: 13,
    color: dark.textMuted,
    marginBottom: 10,
    lineHeight: 18,
  },
  inviteName: {
    color: dark.text,
    fontWeight: '700',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
  },
  inviteAccept: {
    flex: 1,
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteAcceptText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 12,
  },
  inviteDecline: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  inviteDeclineText: {
    color: dark.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tabActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: dark.textMuted,
  },
  tabTextActive: {
    color: '#0a0a0a',
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
  card: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.text,
    flex: 1,
  },
  badge: {
    backgroundColor: dark.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeActive: {
    backgroundColor: dark.accentDark,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: dark.textMuted,
  },
  badgeTextActive: {
    color: '#0a0a0a',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  premiumTag: {
    borderWidth: 1,
    borderColor: dark.accent,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  premiumTagText: {
    color: dark.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  hostTag: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hostTagText: {
    color: dark.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 13,
    color: dark.textMuted,
    marginBottom: 6,
  },
  cardGoalNote: {
    fontSize: 12,
    color: dark.accent,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 12,
    color: dark.textFaint,
  },
  progressWrap: {
    marginTop: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: dark.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: dark.accent,
  },
  progressText: {
    fontSize: 12,
    color: dark.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },
  shieldButton: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  shieldButtonText: {
    color: dark.text,
    fontSize: 12,
    fontWeight: '600',
  },
  commitmentRow: {
    marginTop: 12,
  },
  commitmentInput: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surfaceElevated,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  cardFooterLinks: {
    flexDirection: 'row',
    gap: 16,
  },
  linkText: {
    fontSize: 13,
    color: dark.accent,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 72,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  leaveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: dark.danger,
  },
  leaveButtonText: {
    color: dark.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  expandedSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: dark.border,
    paddingTop: 12,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  sortChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: dark.textMuted,
  },
  sortChipTextActive: {
    color: '#0a0a0a',
  },
  leaderboardLoading: {
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  rowMe: {
    borderColor: dark.accent,
    backgroundColor: dark.surfaceElevated,
  },
  rank: {
    width: 20,
    fontSize: 12,
    color: dark.textFaint,
    fontWeight: '700',
  },
  rowName: {
    fontSize: 13,
    fontWeight: '600',
    color: dark.text,
  },
  rowCommitment: {
    fontSize: 10,
    color: dark.textFaint,
    fontStyle: 'italic',
    marginTop: 1,
  },
  rowStat: {
    fontSize: 12,
    color: dark.textMuted,
  },
});
