import ReportContentButton from './ReportContentButton';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createTeam,
  fetchMyTeamId,
  fetchTeamProgress,
  joinTeam,
  leaveTeam,
} from '../lib/challenges';
import { dark } from '../lib/theme';
import type { ChallengeTeamProgress } from '../lib/types';

export default function ChallengeSquadPanel({ challengeId }: { challengeId: string }) {
  const [teams, setTeams] = useState<ChallengeTeamProgress[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [progress, teamId] = await Promise.all([
        fetchTeamProgress(challengeId),
        fetchMyTeamId(challengeId),
      ]);
      setTeams(progress);
      setMyTeamId(teamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [challengeId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleCreate = async () => {
    if (!teamName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createTeam(challengeId, teamName.trim());
      setCreateOpen(false);
      setTeamName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (teamId: string) => {
    setBusy(true);
    setError(null);
    try {
      await joinTeam(teamId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async (teamId: string) => {
    setBusy(true);
    setError(null);
    try {
      await leaveTeam(teamId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginVertical: 10 }} color={dark.accent} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>👥 Squads</Text>
        {!myTeamId && (
          <Pressable onPress={() => setCreateOpen(true)}>
            <Text style={styles.createLink}>+ Create Squad</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {teams.length === 0 ? (
        <Text style={styles.empty}>No squads yet — be the first to start one.</Text>
      ) : (
        teams.map((team) => {
          const isMine = team.team_id === myTeamId;
          const pct = team.total_target > 0 ? Math.min(1, team.total_workouts_logged / team.total_target) : 0;
          return (
            <View key={team.team_id} style={[styles.teamRow, isMine && styles.teamRowMine]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName}>
                  {team.name} {isMine && '(your squad)'}
                </Text>
                <Text style={styles.teamMeta}>
                  {team.member_count}/5 members · {team.total_workouts_logged}/{team.total_target} combined days
                  ({Math.round(pct * 100)}%)
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
                </View>
              </View>
              {!myTeamId ? (
                <Pressable style={styles.joinButton} onPress={() => handleJoin(team.team_id)} disabled={busy}>
                  <Text style={styles.joinButtonText}>Join</Text>
                </Pressable>
              ) : isMine ? (
                <Pressable style={styles.leaveButton} onPress={() => handleLeave(team.team_id)} disabled={busy}>
                  <Text style={styles.leaveButtonText}>Leave</Text>
                </Pressable>
              ) : null}
              {!isMine && (
                <View style={{ marginLeft: 10 }}>
                  <ReportContentButton kind="squad" targetId={team.team_id} label={team.name} />
                </View>
              )}
            </View>
          );
        })
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create a Squad</Text>
            <TextInput
              style={styles.input}
              placeholder="Squad name"
              placeholderTextColor={dark.textFaint}
              value={teamName}
              onChangeText={setTeamName}
              maxLength={30}
            />
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancel} onPress={() => setCreateOpen(false)} disabled={busy}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalCreate} onPress={handleCreate} disabled={busy || !teamName.trim()}>
                {busy ? <ActivityIndicator size="small" color="#0a0a0a" /> : <Text style={styles.modalCreateText}>Create</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: dark.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
  },
  createLink: {
    color: dark.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: dark.danger,
    fontSize: 12,
    marginBottom: 8,
  },
  empty: {
    color: dark.textFaint,
    fontSize: 12,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  teamRowMine: {
    borderColor: dark.accent,
    backgroundColor: dark.surfaceElevated,
  },
  teamName: {
    color: dark.text,
    fontSize: 13,
    fontWeight: '700',
  },
  teamMeta: {
    color: dark.textFaint,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 6,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.accent,
  },
  joinButton: {
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  joinButtonText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 12,
  },
  leaveButton: {
    borderWidth: 1,
    borderColor: dark.danger,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  leaveButtonText: {
    color: dark.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: dark.background,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: dark.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: dark.border,
    backgroundColor: dark.surface,
    color: dark.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    color: dark.textMuted,
    fontWeight: '700',
    fontSize: 13,
  },
  modalCreate: {
    flex: 1,
    backgroundColor: dark.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCreateText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
});
