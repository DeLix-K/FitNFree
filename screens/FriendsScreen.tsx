import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import ReportContentButton from '../components/ReportContentButton';
import { confirmAction } from '../components/checkins/confirm';
import { CHEER_EMOJIS, MIN_SEARCH, NO_SHARING, SHARE_LABEL, applyCheer, canSearch, cheerList, describeEvent, friendlyError, timeAgo, type Candidate, type FeedItem, type FriendRow, type FriendSettings, type RequestRow, type SharedEvent } from '../lib/friends';
import { realFriendsApi, type FriendsApi } from '../lib/friendsApi';
import { blockUser } from '../lib/trainerMessages';
import { dark } from '../lib/theme';

type Part = 'feed' | 'friends' | 'sharing';
type ShareKey = 'share_workouts' | 'share_records' | 'share_streaks';
const SHARE_KEYS: ShareKey[] = ['share_workouts', 'share_records', 'share_streaks'];

// The Friends feed: people you choose, short automatic updates they chose to share, and emoji cheers. Everything is off until you turn it on, each kind of update is
// its own switch, and you can leave and delete everything at any time (supabase/friends_feed.sql). No typed posts or comments.
export default function FriendsScreen({ api = realFriendsApi, block = blockUser }: { api?: FriendsApi; block?: (userId: string) => Promise<void> }) {
  const [settings, setSettings] = useState<FriendSettings | null>(null);
  const [part, setPart] = useState<Part>('feed');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    api
      .getSettings()
      .then((s) => mounted.current && setSettings(s))
      .catch((e) => {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setSettings(NO_SHARING);
      });
    return () => {
      mounted.current = false;
    };
  }, [api]);

  if (settings === null) return <ActivityIndicator style={{ marginTop: 40 }} color={dark.accent} />;

  if (!settings.enabled) {
    return (
      <Setup
        error={error}
        onTurnOn={async (draft) => {
          setError(null);
          try {
            await api.saveSettings({ ...draft, enabled: true });
            if (mounted.current) setSettings({ ...draft, enabled: true });
          } catch (e) {
            if (mounted.current) setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.parts}>
        {(
          [
            ['feed', 'Feed'],
            ['friends', 'Friends'],
            ['sharing', 'Sharing'],
          ] as [Part, string][]
        ).map(([value, label]) => (
          <Pressable key={value} style={[styles.part, part === value && styles.partOn]} onPress={() => {
              setPart(value);
              setError(null);
              setNotice(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: part === value }}
          >
            <Text style={[styles.partText, part === value && styles.partTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {notice ? <Text style={styles.ok}>{notice}</Text> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={{ flex: 1 }}>
        {part === 'feed' && <FeedPart api={api} onError={setError} />}
        {part === 'friends' && <FriendsPart api={api} block={block} onError={setError} onNotice={setNotice} />}
        {part === 'sharing' && (
          <SharingPart
            api={api}
            settings={settings}
            onSettings={setSettings}
            onError={setError}
            onLeft={() => {
              setSettings(NO_SHARING);
              setPart('feed');
            }}
          />
        )}
      </View>
    </View>
  );
}

// ── First time: everything off until chosen ───────────────────────────────────
function Setup({ onTurnOn, error }: { onTurnOn: (draft: FriendSettings) => Promise<void>; error: string | null }) {
  const [draft, setDraft] = useState<FriendSettings>(NO_SHARING);
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Friends</Text>
      <Text style={styles.intro}>
        Add friends and see short automatic updates from each other, like "Sam logged a workout", and cheer them on with an emoji. There are no typed posts or comments.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>You are in control</Text>
        <Text style={styles.line}>• Nothing is shared until you choose, and you choose each kind separately below.</Text>
        <Text style={styles.line}>• Only people you accept as friends can see your updates. Only people who turned Friends on can find you by name.</Text>
        <Text style={styles.line}>• Friends see your display name. You can block or report anyone, and leave at any time, which deletes everything you shared.</Text>
      </View>
      <Text style={styles.section}>What friends may see (all off)</Text>
      {SHARE_KEYS.map((k) => (
        <View key={k} style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.switchTitle}>{SHARE_LABEL[k].title}</Text>
            <Text style={styles.switchBlurb}>{SHARE_LABEL[k].blurb}</Text>
          </View>
          <Switch value={draft[k]} onValueChange={(v) => setDraft({ ...draft, [k]: v })} trackColor={{ true: dark.accentDark }} thumbColor={draft[k] ? dark.accent : undefined} accessibilityLabel={SHARE_LABEL[k].title} />
        </View>
      ))}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable
        style={[styles.primary, busy && styles.off]}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onTurnOn(draft);
          } finally {
            setBusy(false);
          }
        }}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color="#0a0a0a" size="small" /> : <Text style={styles.primaryText}>Turn on Friends</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ── Feed ──────────────────────────────────────────────────────────────────────
function FeedPart({ api, onError }: { api: FriendsApi; onError: (m: string | null) => void }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const first = await api.feed(null);
      if (id !== latest.current) return;
      setItems(first);
      setMore(first.length >= 30);
      onError(null);
    } catch (e) {
      if (id !== latest.current) return;
      onError(e instanceof Error ? e.message : String(e));
      setItems((i) => i ?? []);
    }
  }, [api, onError]);

  useEffect(() => {
    load();
    return () => {
      latest.current++;
    };
  }, [load]);

  const cheer = async (item: FeedItem, emoji: string) => {
    const before = items;
    onError(null);
    setItems((list) => (list ?? []).map((x) => (x.id === item.id ? { ...x, ...applyCheer(x, emoji) } : x)));
    try {
      await api.cheer(item.id, emoji);
    } catch (e) {
      setItems(before); // put it back
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadMore = async () => {
    if (!items || items.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api.feed(items[items.length - 1].created_at);
      setItems((list) => [...(list ?? []), ...next]);
      setMore(next.length >= 30);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  if (items === null) return <ActivityIndicator style={{ marginTop: 30 }} color={dark.accent} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={dark.accent}
        />
      }
    >
      {items.length === 0 ? (
        <Text style={styles.empty}>Nothing here yet. Add friends in the Friends tab, and when you or they share an update it appears here. Updates disappear after 60 days.</Text>
      ) : (
        items.map((item) => {
          const d = describeEvent(item);
          const counts = cheerList(item.cheers);
          return (
            <View key={item.id} style={styles.card} accessible={false}>
              <View style={styles.eventTop}>
                <Text style={styles.eventIcon}>{d.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{d.title}</Text>
                  {d.detail ? <Text style={styles.eventDetail}>{d.detail}</Text> : null}
                </View>
                <Text style={styles.when}>{timeAgo(item.created_at)}</Text>
              </View>
              <View style={styles.cheerRow}>
                {item.is_mine
                  ? counts.length === 0
                    ? <Text style={styles.when}>No cheers yet</Text>
                    : counts.map((c) => (
                        <Text key={c.emoji} style={styles.cheerCount}>
                          {c.emoji} {c.count}
                        </Text>
                      ))
                  : CHEER_EMOJIS.map((emoji) => {
                      const count = item.cheers[emoji] ?? 0;
                      const mine = item.my_cheer === emoji;
                      return (
                        <Pressable key={emoji} style={[styles.cheer, mine && styles.cheerOn]} onPress={() => cheer(item, emoji)} accessibilityRole="button" accessibilityState={{ selected: mine }} accessibilityLabel={`Cheer ${emoji}${count ? `, ${count}` : ''}`}>
                          <Text style={styles.cheerEmoji}>
                            {emoji}
                            {count > 0 ? ` ${count}` : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
              </View>
            </View>
          );
        })
      )}
      {more ? (
        <Pressable style={styles.moreButton} onPress={loadMore} disabled={loadingMore} accessibilityRole="button">
          {loadingMore ? <ActivityIndicator color={dark.accent} size="small" /> : <Text style={styles.moreText}>Show older</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

// ── Friends ───────────────────────────────────────────────────────────────────
function FriendsPart({ api, block, onError, onNotice }: { api: FriendsApi; block: (userId: string) => Promise<void>; onError: (m: string | null) => void; onNotice: (m: string | null) => void }) {
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([api.friends(), api.requests()]);
      setFriends(f);
      setRequests(r);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setFriends((f) => f ?? []);
    }
  }, [api, onError]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, job: () => Promise<void>, note?: string) => {
    setBusyId(id);
    onError(null);
    onNotice(null);
    try {
      await job();
      if (note) onNotice(note);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const search = async (text: string) => {
    setQuery(text);
    const seq = ++searchSeq.current;
    if (!canSearch(text)) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await api.search(text.trim());
      if (seq === searchSeq.current) setResults(r);
    } catch (e) {
      if (seq === searchSeq.current) onError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  if (friends === null) return <ActivityIndicator style={{ marginTop: 30 }} color={dark.accent} />;
  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.section}>Add a friend</Text>
      <TextInput style={styles.search} value={query} onChangeText={search} placeholder="Search by display name" placeholderTextColor={dark.textFaint} autoCorrect={false} autoCapitalize="none" maxLength={40} accessibilityLabel="Search by display name" />
      <Text style={styles.small}>Only people who turned Friends on can be found. They must accept your request.</Text>
      {searching ? <ActivityIndicator color={dark.accent} style={{ marginTop: 8 }} /> : null}
      {results.map((c) => (
        <View key={c.user_id} style={styles.listRow}>
          <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>
            {c.display_name}
          </Text>
          <Pressable
            style={[styles.smallButton, busyId === c.user_id && styles.off]}
            disabled={busyId === c.user_id}
            onPress={() =>
              act(c.user_id, async () => {
                const r = await api.request(c.user_id);
                setResults((list) => list.filter((x) => x.user_id !== c.user_id));
                onNotice(r === 'accepted' ? `You and ${c.display_name} are now friends.` : `Request sent to ${c.display_name}.`);
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Add ${c.display_name} as a friend`}
          >
            <Text style={styles.smallButtonText}>Add</Text>
          </Pressable>
        </View>
      ))}
      {canSearch(query) && !searching && results.length === 0 ? <Text style={styles.small}>No one found. They may not have turned Friends on, or you may already be connected.</Text> : null}
      {query.trim().length > 0 && query.trim().length < MIN_SEARCH ? <Text style={styles.small}>Type at least {MIN_SEARCH} letters.</Text> : null}

      {incoming.length > 0 && <Text style={styles.section}>Requests for you</Text>}
      {incoming.map((r) => (
        <View key={r.id} style={styles.listRow}>
          <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>
            {r.display_name}
          </Text>
          <Pressable style={[styles.smallButton, busyId === r.id && styles.off]} disabled={busyId === r.id} onPress={() => act(r.id, () => api.respond(r.id, true), `You and ${r.display_name} are now friends.`)} accessibilityRole="button" accessibilityLabel={`Accept ${r.display_name}`}>
            <Text style={styles.smallButtonText}>Accept</Text>
          </Pressable>
          <Pressable disabled={busyId === r.id} onPress={() => act(r.id, () => api.respond(r.id, false))} accessibilityRole="button" accessibilityLabel={`Decline ${r.display_name}`}>
            <Text style={styles.danger}>Decline</Text>
          </Pressable>
        </View>
      ))}

      {outgoing.length > 0 && <Text style={styles.section}>Waiting for an answer</Text>}
      {outgoing.map((r) => (
        <View key={r.id} style={styles.listRow}>
          <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>
            {r.display_name}
          </Text>
          <Pressable disabled={busyId === r.id} onPress={() => act(r.id, () => api.remove(r.user_id))} accessibilityRole="button" accessibilityLabel={`Withdraw the request to ${r.display_name}`}>
            <Text style={styles.danger}>Withdraw</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.section}>Your friends ({friends.length})</Text>
      {friends.length === 0 ? <Text style={styles.small}>No friends yet.</Text> : null}
      {friends.map((f) => (
        <View key={f.friend_id} style={styles.friendCard}>
          <Text style={styles.rowName} numberOfLines={1}>
            {f.display_name}
          </Text>
          <View style={styles.friendActions}>
            <Pressable
              onPress={async () => {
                if (await confirmAction(`Remove ${f.display_name}?`, 'You will no longer see each other\'s updates. You can add each other again later.', 'Remove')) act(f.friend_id, () => api.remove(f.friend_id));
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${f.display_name}`}
            >
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (await confirmAction(`Block ${f.display_name}?`, 'You will be removed as friends, and neither of you will see the other here again unless you unblock them.', 'Block')) act(f.friend_id, () => block(f.friend_id), `Blocked ${f.display_name}.`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Block ${f.display_name}`}
            >
              <Text style={styles.danger}>Block</Text>
            </Pressable>
            <ReportContentButton kind="user" targetId={f.friend_id} reportedUserId={f.friend_id} label={f.display_name} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Sharing ───────────────────────────────────────────────────────────────────
function SharingPart({ api, settings, onSettings, onError, onLeft }: { api: FriendsApi; settings: FriendSettings; onSettings: (s: FriendSettings) => void; onError: (m: string | null) => void; onLeft: () => void }) {
  const [mine, setMine] = useState<SharedEvent[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMine(await api.myEvents());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setMine((m) => m ?? []);
    }
  }, [api, onError]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (k: ShareKey, on: boolean) => {
    const next = { ...settings, [k]: on };
    onSettings(next); // shown at once, put back if it does not save
    onError(null);
    try {
      await api.saveSettings(next);
    } catch (e) {
      onSettings(settings);
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.section}>What friends may see</Text>
      {SHARE_KEYS.map((k) => (
        <View key={k} style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.switchTitle}>{SHARE_LABEL[k].title}</Text>
            <Text style={styles.switchBlurb}>{SHARE_LABEL[k].blurb}</Text>
          </View>
          <Switch value={settings[k]} onValueChange={(v) => toggle(k, v)} trackColor={{ true: dark.accentDark }} thumbColor={settings[k] ? dark.accent : undefined} accessibilityLabel={SHARE_LABEL[k].title} />
        </View>
      ))}
      <Text style={styles.small}>Turning a kind off hides your updates of that kind from friends straight away.</Text>

      <Text style={styles.section}>What you have shared</Text>
      {mine === null ? <ActivityIndicator color={dark.accent} /> : mine.length === 0 ? <Text style={styles.small}>Nothing shared yet.</Text> : null}
      {(mine ?? []).slice(0, 50).map((e) => {
        const d = describeEvent({ kind: e.kind, payload: e.payload, display_name: '', is_mine: true });
        return (
          <View key={e.id} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{d.title}</Text>
              <Text style={styles.small}>
                {[d.detail, timeAgo(e.created_at), e.cheer_count ? `${e.cheer_count} cheer${e.cheer_count === 1 ? '' : 's'}` : null].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                try {
                  await api.deleteEvent(e.id);
                  setMine((list) => (list ?? []).filter((x) => x.id !== e.id));
                } catch (err) {
                  onError(err instanceof Error ? err.message : String(err));
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete this update"
            >
              <Text style={styles.danger}>Delete</Text>
            </Pressable>
          </View>
        );
      })}

      <View style={styles.leaveBox}>
        <Text style={styles.cardTitle}>Leave Friends</Text>
        <Text style={styles.small}>Turns Friends off and deletes your friendships, everything you shared and the cheers you gave. People you were friends with are not told.</Text>
        <Pressable
          style={[styles.leaveButton, busy && styles.off]}
          disabled={busy}
          onPress={async () => {
            if (!(await confirmAction('Leave Friends?', 'This deletes your friendships, your shared updates and your cheers. It cannot be undone.', 'Leave and delete'))) return;
            setBusy(true);
            try {
              await api.leave();
              onLeft();
            } catch (e) {
              onError(e instanceof Error ? e.message : friendlyError(String(e)));
            } finally {
              setBusy(false);
            }
          }}
          accessibilityRole="button"
        >
          <Text style={styles.leaveText}>Leave Friends and delete everything</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: dark.background },
  content: { padding: 16, paddingBottom: 48 },
  parts: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  part: { flex: 1, borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  partOn: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  partText: { color: dark.textMuted, fontSize: 13, fontWeight: '700' },
  partTextOn: { color: dark.accent },
  title: { color: dark.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  intro: { color: dark.textMuted, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  ok: { color: dark.accent, fontSize: 13, paddingHorizontal: 16, marginTop: 6 },
  err: { color: dark.danger, fontSize: 13, paddingHorizontal: 16, marginTop: 6, marginBottom: 4 },
  card: { borderWidth: 1, borderColor: dark.border, backgroundColor: dark.surface, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardTitle: { color: dark.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  line: { color: dark.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  section: { color: dark.text, fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 12 },
  switchTitle: { color: dark.text, fontSize: 15, fontWeight: '600' },
  switchBlurb: { color: dark.textFaint, fontSize: 12, lineHeight: 17, marginTop: 2 },
  primary: { backgroundColor: dark.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#0a0a0a', fontSize: 15, fontWeight: '800' },
  off: { opacity: 0.5 },
  empty: { color: dark.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 24 },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eventIcon: { fontSize: 22 },
  eventTitle: { color: dark.text, fontSize: 15, fontWeight: '700' },
  eventDetail: { color: dark.textMuted, fontSize: 13, marginTop: 2 },
  when: { color: dark.textFaint, fontSize: 11 },
  cheerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  cheer: { borderWidth: 1, borderColor: dark.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, minHeight: 36, justifyContent: 'center' },
  cheerOn: { borderColor: dark.accent, backgroundColor: dark.surfaceElevated },
  cheerEmoji: { color: dark.text, fontSize: 15 },
  cheerCount: { color: dark.textMuted, fontSize: 14 },
  moreButton: { borderWidth: 1, borderColor: dark.border, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginBottom: 10 },
  moreText: { color: dark.accent, fontSize: 13, fontWeight: '700' },
  search: { backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.border, borderRadius: 10, color: dark.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, minHeight: 46 },
  small: { color: dark.textFaint, fontSize: 12, lineHeight: 17, marginTop: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 10 },
  rowName: { color: dark.text, fontSize: 15, fontWeight: '600' },
  smallButton: { borderWidth: 1, borderColor: dark.accentDark, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  smallButtonText: { color: dark.accent, fontSize: 13, fontWeight: '700' },
  danger: { color: dark.danger, fontSize: 13, fontWeight: '700' },
  friendCard: { borderTopWidth: 1, borderTopColor: dark.border, paddingVertical: 12 },
  friendActions: { flexDirection: 'row', gap: 18, marginTop: 8, alignItems: 'center' },
  leaveBox: { borderWidth: 1, borderColor: dark.danger, borderRadius: 14, padding: 14, marginTop: 24 },
  leaveButton: { borderWidth: 1, borderColor: dark.danger, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  leaveText: { color: dark.danger, fontSize: 14, fontWeight: '700' },
});
