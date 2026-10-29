import { supabase } from './supabase';
import { NO_SHARING, friendlyError, recordKindsOf, shouldShareRecords, type Candidate, type FeedItem, type FriendRow, type FriendSettings, type RequestRow, type SharedEvent } from './friends';

// Database calls for the Friends feed (see supabase/friends_feed.sql). The database decides who may see what; the tables cannot be read directly, only through
// these functions, and your own switches through the one table that is yours.

export type FriendsApi = {
  getSettings: () => Promise<FriendSettings>;
  saveSettings: (s: FriendSettings) => Promise<void>;
  feed: (before?: string | null) => Promise<FeedItem[]>;
  cheer: (eventId: string, emoji: string) => Promise<string>;
  friends: () => Promise<FriendRow[]>;
  requests: () => Promise<RequestRow[]>;
  search: (query: string) => Promise<Candidate[]>;
  request: (userId: string) => Promise<'sent' | 'accepted'>;
  respond: (requestId: string, accept: boolean) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  myEvents: () => Promise<SharedEvent[]>;
  deleteEvent: (eventId: string) => Promise<void>;
  leave: () => Promise<void>;
};

function fail(error: { message: string }): never {
  throw new Error(friendlyError(error.message));
}

const PAGE = 30;

export const realFriendsApi: FriendsApi = {
  async getSettings() {
    const { data, error } = await supabase.from('friend_settings').select('enabled, share_workouts, share_records, share_streaks').maybeSingle();
    if (error) fail(error);
    return (data as FriendSettings | null) ?? NO_SHARING;
  },

  async saveSettings(s) {
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id;
    if (!id) throw new Error('Please sign in again.');
    const { error } = await supabase.from('friend_settings').upsert({ user_id: id, ...s }, { onConflict: 'user_id' });
    if (error) fail(error);
    settingsCache = { at: Date.now(), value: s.enabled ? s : NO_SHARING };
  },

  async feed(before) {
    const { data, error } = await supabase.rpc('friend_feed', { p_limit: PAGE, p_before: before ?? null });
    if (error) fail(error);
    return (data ?? []) as FeedItem[];
  },

  async cheer(eventId, emoji) {
    const { data, error } = await supabase.rpc('cheer_event', { p_event: eventId, p_emoji: emoji });
    if (error) fail(error);
    return String(data ?? '');
  },

  async friends() {
    const { data, error } = await supabase.rpc('friend_list');
    if (error) fail(error);
    return (data ?? []) as FriendRow[];
  },

  async requests() {
    const { data, error } = await supabase.rpc('friend_requests');
    if (error) fail(error);
    return (data ?? []) as RequestRow[];
  },

  async search(query) {
    const { data, error } = await supabase.rpc('friend_search', { p_query: query });
    if (error) fail(error);
    return (data ?? []) as Candidate[];
  },

  async request(userId) {
    const { data, error } = await supabase.rpc('friend_request', { p_user: userId });
    if (error) fail(error);
    return data === 'accepted' ? 'accepted' : 'sent';
  },

  async respond(requestId, accept) {
    const { error } = await supabase.rpc('friend_respond', { p_id: requestId, p_accept: accept });
    if (error) fail(error);
  },

  async remove(userId) {
    const { error } = await supabase.rpc('friend_remove', { p_user: userId });
    if (error) fail(error);
  },

  async myEvents() {
    const { data, error } = await supabase.rpc('my_shared_events');
    if (error) fail(error);
    return (data ?? []) as SharedEvent[];
  },

  async deleteEvent(eventId) {
    const { error } = await supabase.rpc('delete_feed_event', { p_id: eventId });
    if (error) fail(error);
  },

  async leave() {
    const { error } = await supabase.rpc('friends_leave');
    if (error) fail(error);
    settingsCache = { at: Date.now(), value: NO_SHARING };
  },
};

// ── Sharing a record from the log-a-set card ──────────────────────────────────
// The switches are read at most once every few minutes, so logging a set does not wait on the network when Friends is off (the usual case).
let settingsCache: { at: number; value: FriendSettings } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function cachedSettings(): Promise<FriendSettings> {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_MS) return settingsCache.value;
  const value = await realFriendsApi.getSettings();
  settingsCache = { at: Date.now(), value };
  return value;
}

export function forgetFriendSettings(): void {
  settingsCache = null;
}

// Called after a personal record is set. Shares it only if the person has Friends and records switched on; the database checks it is real. Never throws and
// never slows or breaks logging a set.
export async function shareRecordIfOn(exerciseId: string, set: { weight: number; weight_unit: 'kg' | 'lb'; reps: number }, prs: { kind: string }[]): Promise<void> {
  try {
    if (!shouldShareRecords(await cachedSettings())) return;
    const kinds = recordKindsOf(prs);
    if (kinds.length === 0) return;
    await supabase.rpc('post_record_event', { p_exercise_id: exerciseId, p_weight: set.weight, p_unit: set.weight_unit, p_reps: set.reps, p_kinds: kinds });
  } catch {
    /* sharing is a bonus; a failure here is not worth interrupting the person */
  }
}
