// Checks lib/reminderPlan.ts (workout reminders and the rest timer). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-reminders.mjs
import assert from 'node:assert/strict';
import { DEFAULT_REMINDERS, DEFAULT_REST, MAX_REST_SECONDS, REST_CHOICES, describeNext, extendRest, formatRest, isReminderId, isoDate, reminderId, reminderText, restRemaining, sanitizeRest, sanitizeReminders, timeLabel, upcomingReminderTimes } from '../lib/reminderPlan.ts';

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
const S = (over = {}) => ({ enabled: true, days: [1, 3, 5], hour: 18, minute: 0, ...over });
// Monday 2026-11-02 at 09:00 local
const monday9 = new Date(2026, 10, 2, 9, 0, 0);

t('sanitize: junk becomes the defaults, bounds are enforced, days are unique and sorted, no days means off', () => {
  assert.deepEqual(sanitizeReminders(null), DEFAULT_REMINDERS);
  assert.deepEqual(sanitizeReminders('x'), DEFAULT_REMINDERS);
  const s = sanitizeReminders({ enabled: true, days: [5, 1, 1, 9, -1, 2.5, 'x', 3], hour: 99, minute: -4 });
  assert.deepEqual(s, { enabled: true, days: [1, 3, 5], hour: 23, minute: 0 });
  assert.equal(sanitizeReminders({ enabled: true, days: [] }).enabled, false);
  assert.equal(sanitizeReminders({ enabled: 'yes', days: [1] }).enabled, false);
  assert.equal(sanitizeReminders({ enabled: true, days: [1], hour: 7.6, minute: 29.4 }).hour, 8);
});

t('plans the chosen weekdays at the chosen time, soonest first, within 14 days', () => {
  const times = upcomingReminderTimes(S(), monday9, null);
  assert.deepEqual(times.map((d) => `${isoDate(d)} ${timeLabel(d.getHours(), d.getMinutes())}`), [
    '2026-11-02 18:00', '2026-11-04 18:00', '2026-11-06 18:00', '2026-11-09 18:00', '2026-11-11 18:00', '2026-11-13 18:00',
  ]);
  assert.ok(times.every((d) => d.getTime() < new Date(2026, 10, 16).getTime()));
});

t("today's reminder is dropped once the person has trained today, and only today's", () => {
  const times = upcomingReminderTimes(S(), monday9, '2026-11-02');
  assert.equal(isoDate(times[0]), '2026-11-04');
  assert.equal(times.length, 5);
  // having trained yesterday changes nothing
  assert.equal(isoDate(upcomingReminderTimes(S(), monday9, '2026-11-01')[0]), '2026-11-02');
});

t('a time that has already passed (or is under a minute away) is not scheduled', () => {
  const evening = new Date(2026, 10, 2, 18, 30, 0);
  assert.equal(isoDate(upcomingReminderTimes(S(), evening, null)[0]), '2026-11-04');
  const almost = new Date(2026, 10, 2, 17, 59, 30);
  assert.equal(isoDate(upcomingReminderTimes(S(), almost, null)[0]), '2026-11-04');
  const fine = new Date(2026, 10, 2, 17, 58, 0);
  assert.equal(isoDate(upcomingReminderTimes(S(), fine, null)[0]), '2026-11-02');
});

t('off, or no days, plans nothing', () => {
  assert.deepEqual(upcomingReminderTimes(S({ enabled: false }), monday9, null), []);
  assert.deepEqual(upcomingReminderTimes(S({ days: [] }), monday9, null), []);
});

t('every day selected gives one reminder per day for 14 days (13 if tonight has passed)', () => {
  const all = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(upcomingReminderTimes(S({ days: all }), monday9, null).length, 14);
  assert.equal(upcomingReminderTimes(S({ days: all }), new Date(2026, 10, 2, 20, 0, 0), null).length, 13);
});

t('works across a month and year end, and across the clocks changing', () => {
  const dec30 = new Date(2026, 11, 30, 9, 0, 0); // Wednesday
  const times = upcomingReminderTimes(S({ days: [4] }), dec30, null); // Thursdays
  assert.deepEqual(times.map(isoDate), ['2026-12-31', '2027-01-07']);
  // UK clocks go back on 2026-10-25, US on 2026-11-01: the wall-clock time must stay 18:00 either way
  const before = new Date(2026, 9, 22, 9, 0, 0);
  for (const d of upcomingReminderTimes(S({ days: [0, 1, 2, 3, 4, 5, 6] }), before, null)) assert.equal(d.getHours(), 18);
});

t('ids are deterministic per date and recognised', () => {
  const d = new Date(2026, 10, 4, 18, 0, 0);
  assert.equal(reminderId(d), 'fitnfree-workout-2026-11-04');
  assert.ok(isReminderId(reminderId(d)));
  assert.ok(!isReminderId('fitnfree-wake-reminder'));
  assert.ok(!isReminderId('fitnfree-workout-2026-11-04-x'));
  assert.ok(!isReminderId('fitnfree-rest-timer'));
});

t('the message for a date never changes, and rotates between dates', () => {
  const a = reminderText(new Date(2026, 10, 4, 18, 0));
  assert.deepEqual(a, reminderText(new Date(2026, 10, 4, 7, 0)));
  const seen = new Set([0, 1, 2, 3].map((i) => reminderText(new Date(2026, 10, 4 + i, 18, 0)).body));
  assert.equal(seen.size, 4);
  assert.ok(a.title.length > 0 && a.body.length > 0);
});

t('describes the next reminder in words', () => {
  const times = upcomingReminderTimes(S(), monday9, null);
  assert.equal(describeNext(times, monday9), 'today at 18:00');
  assert.equal(describeNext(times.slice(1), monday9), 'Wed at 18:00');
  assert.equal(describeNext(upcomingReminderTimes(S({ days: [2] }), monday9, null), monday9), 'tomorrow at 18:00');
  assert.equal(describeNext([], monday9), null);
});

t('rest settings: only the offered lengths are kept, anything else means off', () => {
  assert.deepEqual(sanitizeRest(undefined), DEFAULT_REST);
  assert.deepEqual(sanitizeRest({ seconds: 90, notify: true }), { seconds: 90, notify: true });
  assert.equal(sanitizeRest({ seconds: 45 }).seconds, 0);
  assert.equal(sanitizeRest({ seconds: '90' }).seconds, 0);
  assert.equal(sanitizeRest({ seconds: 90, notify: 'yes' }).notify, false);
  assert.deepEqual([...REST_CHOICES], [60, 90, 120, 180, 300]);
});

t('rest remaining rounds up, never shows 0 while time is left, and is never negative', () => {
  assert.equal(restRemaining(10_000, 0), 10);
  assert.equal(restRemaining(10_000, 9_500), 1);
  assert.equal(restRemaining(10_000, 9_999), 1);
  assert.equal(restRemaining(10_000, 10_000), 0);
  assert.equal(restRemaining(10_000, 15_000), 0);
  assert.ok(Object.is(restRemaining(10_000, 15_000), 0));
});

t('+15 seconds extends a running rest, restarts an ended one, and stops at the maximum', () => {
  assert.equal(extendRest(60_000, 0), 75_000);
  assert.equal(extendRest(0, 50_000), 65_000);
  let end = 100_000;
  for (let i = 0; i < 200; i++) end = extendRest(end, 0);
  assert.equal(end, MAX_REST_SECONDS * 1000);
});

t('rest is shown as minutes and seconds', () => {
  assert.equal(formatRest(90), '1:30');
  assert.equal(formatRest(60), '1:00');
  assert.equal(formatRest(5), '0:05');
  assert.equal(formatRest(-3), '0:00');
  assert.equal(formatRest(300), '5:00');
});

console.log(n, 'passed');
