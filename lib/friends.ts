// The words and rules behind the Friends feed. Pure functions with no imports, so they can be tested on their own (scripts/test-friends.mjs).
// The database decides who may see what (supabase/friends_feed.sql); this file only turns what it returns into plain sentences and friendly errors.
// Nothing a person types is ever shown in the feed: every line is built from fixed wording plus a name, a number or a library exercise name.

export type EventKind = 'workout' | 'record' | 'streak';
export type RecordKind = 'weight' | 'e1rm' | 'reps';

export type FriendSettings = { enabled: boolean; share_workouts: boolean; share_records: boolean; share_streaks: boolean };
export const NO_SHARING: FriendSettings = { enabled: false, share_workouts: false, share_records: false, share_streaks: false };

export type FeedItem = {
  id: string;
  user_id: string;
  display_name: string;
  kind: EventKind;
  payload: Record<string, unknown>;
  created_at: string;
  cheers: Record<string, number>;
  my_cheer: string | null;
  is_mine: boolean;
};
export type FriendRow = { friend_id: string; display_name: string; since: string | null };
export type RequestRow = { id: string; direction: 'incoming' | 'outgoing'; user_id: string; display_name: string; created_at: string };
export type Candidate = { user_id: string; display_name: string };
export type SharedEvent = { id: string; kind: EventKind; payload: Record<string, unknown>; created_at: string; cheer_count: number };

export const CHEER_EMOJIS = ['💪', '🔥', '👏', '🎉'] as const;
export const MIN_SEARCH = 2;

export const SHARE_LABEL: Record<'share_workouts' | 'share_records' | 'share_streaks', { title: string; blurb: string }> = {
  share_workouts: { title: 'Workouts', blurb: 'Friends see that you logged a workout on a day. Nothing about the workout itself.' },
  share_records: { title: 'Personal records', blurb: 'Friends see a new record on a library exercise, for example "Bench Press 65 kg × 5". Custom exercises are never shared.' },
  share_streaks: { title: 'Streak milestones', blurb: 'Friends see when you reach a streak milestone such as 7, 14 or 30 days.' },
};

// ── Sentences ─────────────────────────────────────────────────────────────────
const KIND_TEXT: Record<RecordKind, string> = { weight: 'Heaviest weight', e1rm: 'Est. 1RM', reps: 'Rep record' };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const short = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? Array.from(v.trim()).slice(0, max).join('') : null);
const round1 = (n: number): string => String(Math.round(n * 10) / 10);

export type Described = { icon: string; title: string; detail: string | null };

export function describeEvent(item: Pick<FeedItem, 'kind' | 'payload' | 'display_name' | 'is_mine'>): Described {
  const who = item.is_mine ? 'You' : short(item.display_name, 40) ?? 'A friend';
  const p = item.payload ?? {};
  switch (item.kind) {
    case 'workout':
      return { icon: '✅', title: `${who} logged a workout`, detail: null };
    case 'streak': {
      const days = num(p.days);
      return days !== null && days > 0
        ? { icon: '🔥', title: `${who} reached a ${Math.floor(days)}-day streak`, detail: null }
        : { icon: '🔥', title: `${who} reached a streak milestone`, detail: null };
    }
    case 'record': {
      const name = short(p.exercise, 60);
      const weight = num(p.weight);
      const reps = num(p.reps);
      const unit = p.unit === 'lb' ? 'lb' : p.unit === 'kg' ? 'kg' : null;
      const kinds = Array.isArray(p.kinds) ? (p.kinds.filter((k): k is RecordKind => k === 'weight' || k === 'e1rm' || k === 'reps').map((k) => KIND_TEXT[k])) : [];
      const set = weight !== null && weight > 0 && unit && reps !== null ? `${round1(weight)} ${unit} × ${Math.floor(reps)}` : reps !== null ? `${Math.floor(reps)} reps` : null;
      return {
        icon: '🏆',
        title: name ? `${who} set a new record on ${name}` : `${who} set a new personal record`,
        detail: [set, kinds.length ? kinds.join(' · ') : null].filter(Boolean).join('  ·  ') || null,
      };
    }
    default:
      return { icon: '✨', title: `${who} shared an update`, detail: null };
  }
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86_400);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The cheers on an item as a list in a fixed order, so it never jumps around.
export function cheerList(cheers: Record<string, number> | null | undefined): { emoji: string; count: number }[] {
  return CHEER_EMOJIS.map((emoji) => ({ emoji, count: Math.max(0, Math.floor(Number(cheers?.[emoji] ?? 0)) || 0) })).filter((c) => c.count > 0);
}
export const totalCheers = (cheers: Record<string, number> | null | undefined): number => cheerList(cheers).reduce((a, c) => a + c.count, 0);

// What changes locally when you cheer: the same emoji again takes your cheer back, a different one swaps it.
export function applyCheer(item: Pick<FeedItem, 'cheers' | 'my_cheer'>, emoji: string): { cheers: Record<string, number>; my_cheer: string | null } {
  const cheers = { ...item.cheers };
  const drop = (e: string | null) => {
    if (e && cheers[e]) {
      cheers[e] -= 1;
      if (cheers[e] <= 0) delete cheers[e];
    }
  };
  if (item.my_cheer === emoji) {
    drop(emoji);
    return { cheers, my_cheer: null };
  }
  drop(item.my_cheer);
  cheers[emoji] = (cheers[emoji] ?? 0) + 1;
  return { cheers, my_cheer: emoji };
}

// ── Records ───────────────────────────────────────────────────────────────────
// The kinds of a personal-record result (lib/prBadges.ts), in the order the database expects, without repeats.
export function recordKindsOf(prs: { kind: string }[]): RecordKind[] {
  const out: RecordKind[] = [];
  for (const k of ['weight', 'e1rm', 'reps'] as const) if (prs.some((p) => p.kind === k)) out.push(k);
  return out;
}

export const shouldShareRecords = (s: FriendSettings | null | undefined): boolean => !!s && s.enabled && s.share_records;

export const canSearch = (q: string): boolean => q.trim().length >= MIN_SEARCH && q.trim().length <= 40;

export const anySharing = (s: FriendSettings): boolean => s.share_workouts || s.share_records || s.share_streaks;

// ── Messages ──────────────────────────────────────────────────────────────────
const KNOWN: [RegExp, string][] = [
  [/friends_not_enabled/, 'Turn on Friends first.'],
  [/friend_unavailable/, 'That person cannot be added right now.'],
  [/already_friends/, 'You are already friends.'],
  [/friend_limit/, 'You have reached the limit of 200 friends.'],
  [/request_limit/, 'You have sent a lot of requests. Please wait a while before sending more.'],
  [/request_not_found/, 'That request is no longer there.'],
  [/event_not_found/, 'That update is no longer available.'],
  [/cheer_limit/, 'You have cheered a lot today. Try again tomorrow.'],
  [/sharing_off/, 'That kind of update is switched off.'],
  [/record_limit|record_invalid/, 'That record could not be shared.'],
  [/not_signed_in/, 'Please sign in again.'],
];
export function friendlyError(message: string): string {
  for (const [re, text] of KNOWN) if (re.test(message)) return text;
  return message;
}
