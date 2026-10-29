// Checks lib/widgetSnapshot.ts (what the home-screen widget is given and how it reads it). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-widget-snapshot.mjs          (also run with TZ=Europe/London, TZ=America/New_York, TZ=Pacific/Auckland: the maths is in local time)
import assert from 'node:assert/strict';
import * as W from '../lib/widgetSnapshot.ts';

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

// Local times: l(day, hour, minute) in October 2026. 28 Oct 2026 is a Wednesday; the week started Sunday 25 Oct.
const l = (day, h = 0, m = 0) => new Date(2026, 9, day, h, m);
const date = (day) => W.toDateStr(l(day));
const NOW = l(28, 14, 30);

const snap = (over = {}) =>
  W.buildSnapshot({ now: NOW, currentStreak: 6, weeklyTarget: 5, weekLoggedDates: [date(25), date(27), date(28)], recentActiveDates: [date(26), date(27), date(28)], ...over });

t('the week starts on Sunday, as the Streaks screen does, and the trained days line up', () => {
  assert.equal(W.toDateStr(W.startOfWeek(NOW)), '2026-10-25');
  assert.equal(W.toDateStr(W.startOfWeek(l(25, 0, 1))), '2026-10-25');
  assert.equal(W.toDateStr(W.startOfWeek(l(31, 23, 59))), '2026-10-25');
  assert.equal(W.toDateStr(W.startOfWeek(l(18, 12))), '2026-10-18');
  const s = snap();
  assert.deepEqual(s.days, [true, false, true, true, false, false, false]);
  assert.equal(s.weekDone, 3);
  assert.equal(s.loggedToday, true);
  assert.equal(s.weekTarget, 5);
  assert.equal(s.streak, 6);
  assert.equal(s.v, 1);
});

t('logged days from other weeks do not count toward this week', () => {
  const s = snap({ weekLoggedDates: [date(24), date(25), date(32), date(33)] });
  assert.deepEqual(s.days, [true, false, false, false, false, false, false]);
  assert.equal(s.weekDone, 1);
  assert.equal(s.loggedToday, false);
});

t('the streak is valid until midnight at the start of the day after tomorrow of the last active day', () => {
  const s = snap();
  assert.equal(s.streakValidUntil, Math.floor(l(30).getTime() / 1000), 'last active 28 Oct: runs out at the start of 30 Oct');
  const yesterdayOnly = snap({ weekLoggedDates: [], recentActiveDates: [date(27)] });
  assert.equal(yesterdayOnly.streakValidUntil, Math.floor(l(29).getTime() / 1000));
  assert.equal(yesterdayOnly.loggedToday, false);
  // a freeze-covered day counts as the last active day
  const frozen = snap({ weekLoggedDates: [], recentActiveDates: [date(26), date(28)] });
  assert.equal(frozen.streakValidUntil, Math.floor(l(30).getTime() / 1000));
});

t('no streak means nothing to expire; a streak with no recent day found is shown only until midnight', () => {
  assert.equal(snap({ currentStreak: 0 }).streakValidUntil, null);
  const odd = snap({ weekLoggedDates: [], recentActiveDates: [] });
  assert.equal(odd.streak, 6);
  assert.equal(odd.streakValidUntil, Math.floor(l(29).getTime() / 1000));
});

t('days in the future and junk dates are ignored when working out the last active day', () => {
  const s = snap({ weekLoggedDates: [date(25)], recentActiveDates: [date(27), date(31), 'garbage', '', '2026-13-45x'] });
  assert.equal(s.streakValidUntil, Math.floor(l(29).getTime() / 1000), 'last real active day is 27 Oct');
});

t('numbers are kept sane: streak never negative or fractional, target between 1 and 7', () => {
  assert.equal(snap({ currentStreak: -4 }).streak, 0);
  assert.equal(snap({ currentStreak: 6.9 }).streak, 6);
  assert.equal(snap({ currentStreak: NaN }).streak, 0);
  assert.equal(snap({ currentStreak: 1e9 }).streak, 99_999);
  assert.equal(snap({ weeklyTarget: 0 }).weekTarget, 1);
  assert.equal(snap({ weeklyTarget: 12 }).weekTarget, 7);
  assert.equal(snap({ weeklyTarget: NaN }).weekTarget, 5);
  assert.equal(snap({ weeklyTarget: 3.6 }).weekTarget, 4);
});

t('the week ends at the next Sunday midnight', () => {
  assert.equal(snap().weekEndsAt, Math.floor(l(32).getTime() / 1000), '1 Nov 2026');
  const sunday = W.buildSnapshot({ now: l(25, 9), currentStreak: 1, weeklyTarget: 5, weekLoggedDates: [date(25)], recentActiveDates: [date(25)] });
  assert.equal(sunday.weekEndsAt, Math.floor(l(32).getTime() / 1000));
  assert.deepEqual(sunday.days, [true, false, false, false, false, false, false]);
});

t('what is shown right after writing it is what was written', () => {
  const shown = W.snapshotAt(snap(), NOW);
  assert.deepEqual(shown, { hasData: true, streak: 6, weekDone: 3, weekTarget: 5, days: [true, false, true, true, false, false, false], loggedToday: true });
});

t('later the same day nothing changes; the next day "trained today" resets but the streak and week stay', () => {
  const s = snap();
  assert.equal(W.snapshotAt(s, l(28, 23, 59)).loggedToday, true);
  const next = W.snapshotAt(s, l(29, 0, 1));
  assert.equal(next.loggedToday, false);
  assert.equal(next.streak, 6);
  assert.equal(next.weekDone, 3);
  assert.deepEqual(next.days, s.days);
});

t('the streak runs out exactly when it should, without the app being opened', () => {
  const s = snap();
  assert.equal(W.snapshotAt(s, l(29, 23, 59)).streak, 6, 'still alive on the day after the last workout');
  assert.equal(W.snapshotAt(s, l(30, 0, 0)).streak, 0, 'gone at midnight starting the second day');
  assert.equal(W.snapshotAt(s, l(30, 0, 0)).weekDone, 3, 'the week count is not affected');
  assert.equal(W.snapshotAt(s, new Date(2027, 0, 1)).streak, 0);
});

t('when the week ends, the week starts again from zero', () => {
  const s = snap();
  const before = W.snapshotAt(s, l(31, 23, 59));
  assert.equal(before.weekDone, 3);
  const after = W.snapshotAt(s, l(32, 0, 0));
  assert.equal(after.weekDone, 0);
  assert.deepEqual(after.days, [false, false, false, false, false, false, false]);
  assert.equal(after.weekTarget, 5);
  assert.equal(after.loggedToday, false);
  assert.equal(after.hasData, true);
});

t('a missing, damaged or different-version snapshot shows the "open the app" state', () => {
  const none = { hasData: false, streak: 0, weekDone: 0, weekTarget: 0, days: [false, false, false, false, false, false, false], loggedToday: false };
  for (const bad of [null, undefined, 'x', 7, {}, { ...snap(), v: 2 }, { ...snap(), v: undefined }, { ...snap(), days: [true] }, { ...snap(), days: Array(7).fill(1) }, { ...snap(), streak: '6' }, { ...snap(), weekEndsAt: NaN }, { ...snap(), loggedToday: 'yes' }, { ...snap(), streakValidUntil: undefined }]) {
    assert.deepEqual(W.snapshotAt(bad, NOW), none, JSON.stringify(bad)?.slice(0, 60));
    assert.deepEqual(W.changeMoments(bad, NOW), []);
  }
});

t('it survives being written as text and read back (that is how it travels)', () => {
  const s = snap();
  const back = JSON.parse(W.serializeSnapshot(s));
  assert.deepEqual(back, s);
  assert.equal(W.isValidSnapshot(back), true);
  const noStreak = snap({ currentStreak: 0 });
  assert.equal(JSON.parse(W.serializeSnapshot(noStreak)).streakValidUntil, null);
  assert.equal(W.isValidSnapshot(JSON.parse(W.serializeSnapshot(noStreak))), true);
});

t('change moments: only future ones, soonest first, each shown once', () => {
  const s = snap();
  const m = W.changeMoments(s, NOW).map((d) => d.getTime());
  assert.deepEqual(m, [l(29).getTime(), l(30).getTime(), l(32).getTime()], 'midnight, streak runs out, week ends');
  assert.deepEqual(m, [...m].sort((a, b) => a - b));
  // late on 29 Oct: midnight into the 30th is both "next midnight" and "streak runs out": listed once
  const late = W.changeMoments(s, l(29, 20)).map((d) => d.getTime());
  assert.deepEqual(late, [l(30).getTime(), l(32).getTime()]);
  // after the streak has run out and before the week ends
  assert.deepEqual(W.changeMoments(s, l(30, 5)).map((d) => d.getTime()), [l(31).getTime(), l(32).getTime()]);
  // once everything has passed only the next midnight remains
  assert.deepEqual(W.changeMoments(s, l(40, 5)).map((d) => d.getTime()), [l(41).getTime()]);
  assert.deepEqual(W.changeMoments(snap({ currentStreak: 0 }), NOW).map((d) => d.getTime()), [l(29).getTime(), l(32).getTime()]);
});

t('walking through every change moment gives the same answer as asking at any time between them', () => {
  const s = snap();
  const moments = W.changeMoments(s, NOW);
  let prev = NOW;
  for (const m of [...moments, new Date(moments.at(-1).getTime() + 5 * 3600_000)]) {
    const a = JSON.stringify(W.snapshotAt(s, prev));
    const mid = new Date((prev.getTime() + m.getTime()) / 2);
    assert.equal(JSON.stringify(W.snapshotAt(s, mid)), a, `between ${prev.toISOString()} and ${m.toISOString()}`);
    prev = m;
  }
});

t('the group name and key are the ones the Swift widget reads', () => {
  assert.equal(W.WIDGET_APP_GROUP, 'group.com.teamk.fitnfree');
  assert.equal(W.SNAPSHOT_KEY, 'streakSnapshot');
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
