// Checks lib/friends.ts (the sentences, cheers and messages of the Friends feed). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-friends.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as F from '../lib/friends.ts';

let n = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log('  ok  ', name);
    n++;
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};

const ev = (kind, payload = {}, over = {}) => ({ kind, payload, display_name: 'Sam Lifter', is_mine: false, ...over });

t('the three kinds of update read as plain sentences', () => {
  assert.deepEqual(F.describeEvent(ev('workout')), { icon: '✅', title: 'Sam Lifter logged a workout', detail: null });
  assert.deepEqual(F.describeEvent(ev('streak', { days: 14 })), { icon: '🔥', title: 'Sam Lifter reached a 14-day streak', detail: null });
  const r = F.describeEvent(ev('record', { exercise: 'Bench Press', weight: 65, unit: 'kg', reps: 5, kinds: ['weight', 'e1rm'] }));
  assert.equal(r.title, 'Sam Lifter set a new record on Bench Press');
  assert.equal(r.detail, '65 kg × 5  ·  Heaviest weight · Est. 1RM');
  assert.equal(r.icon, '🏆');
});

t('your own updates say "You"', () => {
  assert.equal(F.describeEvent(ev('workout', {}, { is_mine: true })).title, 'You logged a workout');
  assert.equal(F.describeEvent(ev('streak', { days: 7 }, { is_mine: true })).title, 'You reached a 7-day streak');
});

t('numbers are tidied: decimals, pounds, whole reps, bodyweight', () => {
  assert.equal(F.describeEvent(ev('record', { exercise: 'Squat', weight: 102.5, unit: 'kg', reps: 3, kinds: ['weight'] })).detail, '102.5 kg × 3  ·  Heaviest weight');
  assert.equal(F.describeEvent(ev('record', { exercise: 'Row', weight: 135.04, unit: 'lb', reps: 8, kinds: ['reps'] })).detail, '135 lb × 8  ·  Rep record');
  assert.equal(F.describeEvent(ev('record', { exercise: 'Pull-up', weight: 0, unit: 'kg', reps: 11, kinds: ['reps'] })).detail, '11 reps  ·  Rep record');
});

t('odd or damaged payloads never show junk, only the plain fallback', () => {
  assert.equal(F.describeEvent(ev('streak', { days: 'many' })).title, 'Sam Lifter reached a streak milestone');
  assert.equal(F.describeEvent(ev('streak', { days: -3 })).title, 'Sam Lifter reached a streak milestone');
  assert.equal(F.describeEvent(ev('streak', null)).title, 'Sam Lifter reached a streak milestone');
  const bad = F.describeEvent(ev('record', { exercise: 5, weight: 'x', unit: 'stone', reps: null, kinds: 'weight' }));
  assert.equal(bad.title, 'Sam Lifter set a new personal record');
  assert.equal(bad.detail, null);
  assert.equal(F.describeEvent(ev('record', { exercise: 'Bench', kinds: ['weight', 'hack', 7] })).detail, 'Heaviest weight', 'unknown kinds are dropped, the known one is kept');
  assert.equal(F.describeEvent(ev('mystery')).title, 'Sam Lifter shared an update');
  assert.equal(F.describeEvent({ kind: 'workout', payload: undefined, display_name: '', is_mine: false }).title, 'A friend logged a workout');
});

t('what a friend can put in a sentence is limited: names and exercise names are cut short and tags are only text', () => {
  const long = 'x'.repeat(200);
  assert.ok(F.describeEvent(ev('workout', {}, { display_name: long })).title.length <= 'logged a workout'.length + 41);
  const d = F.describeEvent(ev('record', { exercise: `<b>${long}</b>`, weight: 1, unit: 'kg', reps: 1, kinds: ['weight'] }));
  assert.ok(Array.from(d.title).length < 140);
  assert.ok(!d.title.includes('undefined'));
});

t('time ago', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const ago = (s) => new Date(now.getTime() - s * 1000).toISOString();
  assert.equal(F.timeAgo(ago(5), now), 'just now');
  assert.equal(F.timeAgo(ago(59), now), 'just now');
  assert.equal(F.timeAgo(ago(60), now), '1 min ago');
  assert.equal(F.timeAgo(ago(59 * 60), now), '59 min ago');
  assert.equal(F.timeAgo(ago(3600), now), '1 h ago');
  assert.equal(F.timeAgo(ago(23 * 3600), now), '23 h ago');
  assert.equal(F.timeAgo(ago(86400), now), 'yesterday');
  assert.equal(F.timeAgo(ago(3 * 86400), now), '3 days ago');
  assert.equal(F.timeAgo(ago(-500), now), 'just now', 'a clock a little ahead is not "in the future"');
  assert.equal(F.timeAgo('garbage', now), '');
  assert.match(F.timeAgo(ago(40 * 86400), now), /\d/);
});

t('cheers: a fixed order, counts only, and the same four emoji the database allows', () => {
  assert.deepEqual(F.cheerList({ '🎉': 1, '💪': 3, '🔥': 0, '😈': 9 }), [{ emoji: '💪', count: 3 }, { emoji: '🎉', count: 1 }], 'unknown emoji ignored');
  assert.deepEqual(F.cheerList(null), []);
  assert.deepEqual(F.cheerList({ '💪': 'x' }), []);
  assert.equal(F.totalCheers({ '💪': 2, '🔥': 1 }), 3);
  const sql = readFileSync(fileURLToPath(new URL('../supabase/friends_feed.sql', import.meta.url)), 'utf8');
  assert.ok(sql.includes("check (emoji in ('💪', '🔥', '👏', '🎉'))"), 'table check');
  assert.ok(sql.includes("if p_emoji not in ('💪', '🔥', '👏', '🎉')"), 'function check');
  assert.deepEqual([...F.CHEER_EMOJIS], ['💪', '🔥', '👏', '🎉']);
});

t('cheering locally matches what the database does: add, swap, take back', () => {
  let item = { cheers: { '💪': 2 }, my_cheer: null };
  item = { ...item, ...F.applyCheer(item, '🔥') };
  assert.deepEqual(item, { cheers: { '💪': 2, '🔥': 1 }, my_cheer: '🔥' });
  item = { ...item, ...F.applyCheer(item, '💪') };
  assert.deepEqual(item, { cheers: { '💪': 3 }, my_cheer: '💪' }, 'a different emoji swaps yours and the old count goes away');
  item = { ...item, ...F.applyCheer(item, '💪') };
  assert.deepEqual(item, { cheers: { '💪': 2 }, my_cheer: null }, 'the same again takes it back');
  const solo = F.applyCheer({ cheers: { '🔥': 1 }, my_cheer: '🔥' }, '🔥');
  assert.deepEqual(solo, { cheers: {}, my_cheer: null });
  const orig = { cheers: { '💪': 1 }, my_cheer: null };
  F.applyCheer(orig, '🔥');
  assert.deepEqual(orig, { cheers: { '💪': 1 }, my_cheer: null }, 'the original is not changed');
});

t('records: kinds in the database order, no repeats, and sharing needs Friends and records on', () => {
  assert.deepEqual(F.recordKindsOf([{ kind: 'reps' }, { kind: 'weight' }, { kind: 'weight' }]), ['weight', 'reps']);
  assert.deepEqual(F.recordKindsOf([{ kind: 'e1rm' }, { kind: 'weight' }, { kind: 'reps' }]), ['weight', 'e1rm', 'reps']);
  assert.deepEqual(F.recordKindsOf([]), []);
  assert.deepEqual(F.recordKindsOf([{ kind: 'other' }]), []);
  assert.equal(F.shouldShareRecords({ enabled: true, share_workouts: false, share_records: true, share_streaks: false }), true);
  assert.equal(F.shouldShareRecords({ enabled: true, share_workouts: true, share_records: false, share_streaks: true }), false);
  assert.equal(F.shouldShareRecords({ enabled: false, share_workouts: false, share_records: true, share_streaks: false }), false);
  assert.equal(F.shouldShareRecords(null), false);
  assert.equal(F.shouldShareRecords(F.NO_SHARING), false);
});

t('everything starts off', () => {
  assert.deepEqual(F.NO_SHARING, { enabled: false, share_workouts: false, share_records: false, share_streaks: false });
  assert.equal(F.anySharing(F.NO_SHARING), false);
  assert.equal(F.anySharing({ ...F.NO_SHARING, share_streaks: true }), true);
  for (const k of ['share_workouts', 'share_records', 'share_streaks']) assert.ok(F.SHARE_LABEL[k].blurb.length > 20);
});

t('search needs 2 to 40 letters', () => {
  for (const [q, ok] of [['', false], ['a', false], [' a ', false], ['ab', true], ['  ab  ', true], ['x'.repeat(40), true], ['x'.repeat(41), false]]) assert.equal(F.canSearch(q), ok, JSON.stringify(q));
});

t('database codes become plain sentences, and unknown text passes through', () => {
  const cases = {
    friends_not_enabled: /Turn on Friends/,
    friend_unavailable: /cannot be added/,
    already_friends: /already friends/,
    friend_limit: /200 friends/,
    request_limit: /wait/,
    request_not_found: /no longer there/,
    event_not_found: /no longer available/,
    cheer_limit: /tomorrow/,
    sharing_off: /switched off/,
    record_invalid: /could not be shared/,
    record_limit: /could not be shared/,
    not_signed_in: /sign in/,
  };
  for (const [code, re] of Object.entries(cases)) assert.match(F.friendlyError(code), re, code);
  assert.equal(F.friendlyError('network down'), 'network down');
  assert.match(F.friendlyError('ERROR: friend_unavailable (P0001)'), /cannot be added/);
});

t('the milestone and limit numbers the screen promises match the database', () => {
  const sql = readFileSync(fileURLToPath(new URL('../supabase/friends_feed.sql', import.meta.url)), 'utf8');
  assert.ok(sql.includes('>= 200 then raise exception \'friend_limit\''));
  assert.ok(sql.includes("interval '60 days'"));
  for (const m of ['3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365']) assert.ok(sql.includes(m));
  assert.match(F.friendlyError('friend_limit'), /200/);
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
