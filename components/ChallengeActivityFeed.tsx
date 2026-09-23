import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { activityMessage, fetchChallengeActivity, sendReaction, subscribeToChallengeActivity } from '../lib/challenges';
import { dark } from '../lib/theme';
import type { ChallengeActivityView } from '../lib/types';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ChallengeActivityFeed({ challengeId }: { challengeId: string }) {
  const [activity, setActivity] = useState<ChallengeActivityView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      setActivity(await fetchChallengeActivity(challengeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [challengeId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Genuinely live: a real Supabase Realtime subscription, not polling.
  useEffect(() => {
    const unsubscribe = subscribeToChallengeActivity(challengeId, () => load());
    return unsubscribe;
  }, [challengeId, load]);

  const handleReact = async (activityId: string, type: 'high_five' | 'boost') => {
    // Already given (or a tap is in flight): nothing to send.
    const key = `${activityId}:${type}`;
    const item = activity.find((a) => a.id === activityId);
    if (item?.reactions.myReactions.includes(type) || pending.current.has(key)) return;
    pending.current.add(key);

    setError(null);
    try {
      await sendReaction(activityId, type);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      pending.current.delete(key);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ marginVertical: 10 }} color={dark.accent} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚡ Activity</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {activity.length === 0 ? (
        <Text style={styles.empty}>No activity yet — be the first to log a day.</Text>
      ) : (
        activity.map((item) => {
          const reacted = item.reactions.myReactions;
          return (
            <View key={item.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.message}>{activityMessage(item.kind, item.display_name)}</Text>
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
              <View style={styles.reactionRow}>
                <Pressable
                  style={[styles.reactionButton, reacted.includes('high_five') && styles.reactionButtonActive]}
                  onPress={() => handleReact(item.id, 'high_five')}
                >
                  <Text style={styles.reactionText}>🖐 {item.reactions.high_five || ''}</Text>
                </Pressable>
                <Pressable
                  style={[styles.reactionButton, reacted.includes('boost') && styles.reactionButtonActive]}
                  onPress={() => handleReact(item.id, 'boost')}
                >
                  <Text style={styles.reactionText}>⚡ {item.reactions.boost || ''}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
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
  title: {
    color: dark.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  message: {
    color: dark.text,
    fontSize: 12,
    fontWeight: '600',
  },
  time: {
    color: dark.textFaint,
    fontSize: 10,
    marginTop: 2,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reactionButton: {
    borderWidth: 1,
    borderColor: dark.border,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 36,
    alignItems: 'center',
  },
  reactionButtonActive: {
    borderColor: dark.accent,
    backgroundColor: dark.surfaceElevated,
  },
  reactionText: {
    color: dark.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
