// Checks lib/watchSync.ts (what the iPhone and the Apple Watch app say to each other). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-watch-sync.mjs          (also run with TZ=Europe/London, TZ=America/New_York, TZ=Pacific/Auckland: the days are local days)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from '../lib/watchSync.ts';

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

const l = (day, h = 12, m = 0) => new Date(2026, 9, day, h, m); // local time in October 2026
const ds = (day) => `2026-10-${String(day).padStart(2, '0')}`;
const NOW = l(28, 14, 30);

const snapshot = { v: 1, streak: 6, weekDone: 3, weekTarget: 5, days: [true, false, true, true, false, false, false], loggedToday: true, streakValidUntil: null, weekEndsAt: 1793000000, updatedAt: 1792900000 };

t('the watch is given the widget snapshot as one piece of text, and signed out is an empty text', () => {
  const ctx = S.buildWatchContext(snapshot);
  assert.deepEqual(Object.keys(ctx).sort(), ['snapshot', 'v']);
  assert.equal(ctx.v, 1);
  assert.equal(typeof ctx.snapshot, 'string');
  assert.deepEqual(JSON.parse(ctx.snapshot), snapshot);
  assert.deepEqual(S.buildWatchContext(null), { v: 1, snapshot: '' });
});

t('the context holds only plain values the phone-to-watch link accepts (no null, no nested objects)', () => {
  for (const v of Object.values(S.buildWatchContext(snapshot))) assert.ok(typeof v === 'string' || typeof v === 'number');
  // the snapshot has a null (no streak to expire): that is exactly why it travels as text
  assert.equal(snapshot.streakValidUntil, null);
});

t('calendar days: real days only', () => {
  for (const ok of ['2026-10-28', '2024-02-29', '2026-01-01']) assert.equal(S.isCalendarDate(ok), true, ok);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-10-32', '2026-1-5', '28/10/2026', '2026-10-28T10:00', '', null, undefined, 20261028, {}]) assert.equal(S.isCalendarDate(bad), false, String(bad));
});

t('only a well-formed "log-workout" request is accepted', () => {
  assert.deepEqual(S.parseWatchRequest({ v: 1, type: 'log-workout', date: '2026-10-28' }), { type: 'log-workout', date: '2026-10-28' });
  assert.deepEqual(S.parseWatchRequest({ v: 1, type: 'log-workout', date: '2026-10-28', extra: 'ignored', note: '<script>' }), { type: 'log-workout', date: '2026-10-28' }, 'extra fields are dropped');
  for (const bad of [null, undefined, 5, 'log-workout', [], {}, { v: 2, type: 'log-workout', date: '2026-10-28' }, { v: 1, type: 'delete-everything', date: '2026-10-28' }, { v: 1, type: 'log-workout' }, { v: 1, type: 'log-workout', date: '2026-02-30' }, { v: 1, type: 'log-workout', date: 20261028 }, { v: '1', type: 'log-workout', date: '2026-10-28' }]) {
    assert.equal(S.parseWatchRequest(bad), null, JSON.stringify(bad));
  }
});

t('which day is logged: today, yesterday and the day before count; a future day becomes today; older is dropped', () => {
  assert.equal(S.resolveLogDate(ds(28), NOW), ds(28));
  assert.equal(S.resolveLogDate(ds(27), NOW), ds(27));
  assert.equal(S.resolveLogDate(ds(26), NOW), ds(26));
  assert.equal(S.resolveLogDate(ds(25), NOW), null, 'three days old');
  assert.equal(S.resolveLogDate(ds(29), NOW), ds(28), 'tomorrow (time zones disagree) is logged as today, never in the future');
  assert.equal(S.resolveLogDate('2027-01-01', NOW), ds(28));
  assert.equal(S.resolveLogDate('2020-01-01', NOW), null);
  assert.equal(S.resolveLogDate('nonsense', NOW), null);
});

t('a tap just before midnight that arrives after midnight is still logged for the day it was tapped', () => {
  const lateTap = ds(28);
  assert.equal(S.resolveLogDate(lateTap, l(29, 0, 10)), lateTap);
  assert.equal(S.resolveLogDate(lateTap, l(30, 9)), lateTap, 'two days later still counts');
  assert.equal(S.resolveLogDate(lateTap, l(31, 9)), null, 'three days later is stale');
});

t('the same days work across a month and year change', () => {
  const jan2 = new Date(2027, 0, 2, 10);
  assert.equal(S.resolveLogDate('2026-12-31', jan2), '2026-12-31');
  assert.equal(S.resolveLogDate('2026-12-30', jan2), null);
  const mar1 = new Date(2028, 2, 1, 10);
  assert.equal(S.resolveLogDate('2028-02-29', mar1), '2028-02-29', 'leap day');
});

t('waiting days: real recent days, once each, oldest first, capped', () => {
  assert.deepEqual(S.normalizePending([ds(28), ds(27), ds(28), 'junk', 5, null, '2020-01-01', ds(29)], NOW), [ds(27), ds(28)], 'future becomes today and merges with today');
  assert.deepEqual(S.normalizePending('not a list', NOW), []);
  assert.deepEqual(S.normalizePending(undefined, NOW), []);
  assert.deepEqual(S.normalizePending([], NOW), []);
  assert.ok(S.normalizePending(Array.from({ length: 50 }, () => ds(28)), NOW).length <= S.MAX_PENDING);
});

t('adding and removing waiting days', () => {
  assert.deepEqual(S.addPending([], ds(28), NOW), [ds(28)]);
  assert.deepEqual(S.addPending([ds(28)], ds(28), NOW), [ds(28)], 'twice is once');
  assert.deepEqual(S.addPending([ds(28)], ds(27), NOW), [ds(27), ds(28)]);
  assert.deepEqual(S.addPending([ds(28)], '2020-01-01', NOW), [ds(28)], 'a stale day is not added');
  assert.deepEqual(S.addPending(undefined, 'junk', NOW), []);
  assert.deepEqual(S.removePending([ds(27), ds(28)], ds(27), NOW), [ds(28)]);
  assert.deepEqual(S.removePending([ds(28)], ds(26), NOW), [ds(28)]);
  assert.deepEqual(S.removePending([ds(28)], ds(28), NOW), []);
});

t('the day goes stale while waiting: a request kept for days is dropped, not logged late', () => {
  const waiting = S.addPending([], ds(28), NOW);
  assert.deepEqual(S.normalizePending(waiting, l(30, 8)), [ds(28)]);
  assert.deepEqual(S.normalizePending(waiting, l(31, 8)), []);
});

t('the Swift watch app uses the same names and rules (a text check; the Swift is not compiled here)', () => {
  const swift = readFileSync(fileURLToPath(new URL('../targets/watch/FitNFreeWatch.swift', import.meta.url)), 'utf8');
  assert.ok(swift.includes('"snapshot"'), 'context key');
  assert.ok(swift.includes('"log-workout"'), 'request type');
  assert.ok(swift.includes('"type"') && swift.includes('"date"') && swift.includes('"v"'), 'request keys');
  assert.ok(swift.includes('transferUserInfo'), 'queued, not instant');
  assert.ok(swift.includes('yyyy-MM-dd'), 'the day is a local YYYY-MM-DD');
  assert.ok(!/URLSession|https?:\/\//.test(swift.replace(/\/\/.*$/gm, '')), 'the watch never contacts a server');
  assert.ok(!/HealthKit|HKHealthStore|WKExtendedRuntimeSession/.test(swift), 'no health data, no background sessions');
});

t('the watch is declared with the companion identifier and no extra capabilities', () => {
  const cfg = readFileSync(fileURLToPath(new URL('../targets/watch/expo-target.config.js', import.meta.url)), 'utf8');
  assert.ok(/type:\s*'watch'/.test(cfg));
  assert.ok(/bundleIdentifier:\s*'\.watchkitapp'/.test(cfg));
  assert.ok(!/entitlements/.test(cfg.replace(/\/\/.*$/gm, '')), 'no App Group or other entitlement on the watch');
  const plist = readFileSync(fileURLToPath(new URL('../targets/watch/Info.plist', import.meta.url)), 'utf8');
  assert.ok(plist.includes('<key>WKApplication</key>'));
  assert.ok(plist.includes('<string>com.teamk.fitnfree</string>'), 'companion app identifier');
  const app = JSON.parse(readFileSync(fileURLToPath(new URL('../app.json', import.meta.url)), 'utf8')).expo;
  assert.equal(app.ios.bundleIdentifier, 'com.teamk.fitnfree');
  assert.ok(!app.ios.infoPlist?.UIBackgroundModes, 'no background modes added to the iPhone app');
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
