// Checks lib/healthSummary.ts (turning Apple Health readings into nights, steps and workouts). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-health-summary.mjs
import assert from 'node:assert/strict';
import * as H from '../lib/healthSummary.ts';

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

// Local-time helper so the tests give the same answer in any time zone: d(day, hour, minute) in October 2026.
const d = (day, h = 0, m = 0) => new Date(2026, 9, day, h, m);
const S = (start, end, value) => ({ start, end, value });
const V = H.SLEEP_VALUE;

t('a night recorded with stages gives asleep time, each stage, awake time and the wake date', () => {
  const nights = H.sleepNights([
    S(d(27, 23, 0), d(27, 23, 20), V.core),
    S(d(27, 23, 20), d(28, 0, 20), V.deep),
    S(d(28, 0, 20), d(28, 1, 0), V.core),
    S(d(28, 1, 0), d(28, 1, 15), V.awake),
    S(d(28, 1, 15), d(28, 2, 15), V.rem),
    S(d(28, 2, 15), d(28, 6, 45), V.core),
  ]);
  assert.equal(nights.length, 1);
  const x = nights[0];
  assert.equal(x.sleepDate, '2026-10-28');
  assert.equal(x.deepMinutes, 60);
  assert.equal(x.remMinutes, 60);
  assert.equal(x.lightMinutes, 20 + 40 + 270);
  assert.equal(x.awakeMinutes, 15);
  assert.equal(x.asleepMinutes, 60 + 60 + 330);
  assert.deepEqual([x.bedtime.getTime(), x.wakeTime.getTime()], [d(27, 23, 0).getTime(), d(28, 6, 45).getTime()]);
  assert.equal(x.usedInBedOnly, false);
});

t('two sources covering the same night are not double counted, and the one with stages wins', () => {
  const nights = H.sleepNights([
    S(d(27, 23, 0), d(28, 7, 0), V.asleepUnspecified), // a phone: asleep, no stages
    S(d(27, 23, 10), d(28, 1, 10), V.deep), // a watch: stages for part of the night
    S(d(28, 1, 10), d(28, 6, 50), V.core),
  ]);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].asleepMinutes, 8 * 60); // 23:00 to 07:00, once
  assert.equal(nights[0].deepMinutes, 120);
  assert.equal(nights[0].lightMinutes, 340);
});

t('with no stages at all, the stage fields are null rather than made up', () => {
  const x = H.sleepNights([S(d(27, 23, 30), d(28, 6, 30), V.asleepUnspecified)])[0];
  assert.equal(x.asleepMinutes, 420);
  assert.deepEqual([x.deepMinutes, x.remMinutes, x.lightMinutes, x.awakeMinutes], [null, null, null, null]);
});

t('if only "in bed" was recorded, that is used and flagged', () => {
  const x = H.sleepNights([S(d(27, 23, 0), d(28, 7, 0), V.inBed)])[0];
  assert.equal(x.asleepMinutes, 480);
  assert.equal(x.usedInBedOnly, true);
});

t('in-bed time is ignored when real asleep data exists', () => {
  const x = H.sleepNights([S(d(27, 22, 30), d(28, 7, 30), V.inBed), S(d(27, 23, 0), d(28, 6, 0), V.core)])[0];
  assert.equal(x.asleepMinutes, 420);
  assert.equal(x.usedInBedOnly, false);
});

t('a short nap is left out, and a night with a nap earlier the same day keeps only the night', () => {
  const nights = H.sleepNights([S(d(28, 14, 0), d(28, 14, 40), V.core), S(d(27, 23, 0), d(28, 6, 30), V.core)]);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].asleepMinutes, 450);
  assert.deepEqual(H.sleepNights([S(d(28, 14, 0), d(28, 14, 40), V.core)]), []);
});

t('a long wake in the middle of the night (over the gap) splits it, and the longer part is kept for that date', () => {
  const nights = H.sleepNights([S(d(27, 22, 0), d(28, 0, 30), V.core), S(d(28, 3, 30), d(28, 8, 0), V.core)]);
  assert.equal(nights.length, 1);
  assert.equal(nights[0].asleepMinutes, 270);
});

t('several nights come back newest first, one per wake date', () => {
  const nights = H.sleepNights([S(d(25, 23, 0), d(26, 7, 0), V.core), S(d(26, 23, 30), d(27, 6, 30), V.core), S(d(27, 23, 0), d(28, 7, 15), V.core)]);
  assert.deepEqual(nights.map((x) => x.sleepDate), ['2026-10-28', '2026-10-27', '2026-10-26']);
  assert.deepEqual(nights.map((x) => x.asleepMinutes), [495, 420, 480]);
});

t('empty, junk and backwards samples are ignored', () => {
  assert.deepEqual(H.sleepNights([]), []);
  assert.deepEqual(H.sleepNights([S(d(28, 7, 0), d(27, 23, 0), V.core), S(d(27, 23, 0), d(27, 23, 0), V.core), S(d(27, 23, 0), d(28, 7, 0), 99), S(new Date('x'), d(28, 7, 0), V.core)]), []);
});

t('daily totals fill missing days with zero and keep a fixed number of bars', () => {
  const today = d(28, 15, 0);
  const out = H.dailyTotals([{ start: d(26), value: 8000 }, { start: d(28), value: 3210.4 }, { start: d(24), value: null }, { start: d(25), value: -5 }], 7, today);
  assert.equal(out.length, 7);
  assert.deepEqual(out.map((x) => x.date), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);
  assert.deepEqual(out.map((x) => x.value), [0, 0, 0, 0, 8000, 0, 3210]);
});

t('the average ignores today and days with nothing recorded', () => {
  const totals = [{ date: 'a', value: 10000 }, { date: 'b', value: 0 }, { date: 'c', value: 6000 }, { date: 'today', value: 1000 }];
  assert.equal(H.averageOf(totals), 8000);
  assert.equal(H.averageOf(totals, false), 5667);
  assert.equal(H.averageOf([]), 0);
});

t('workouts: newest first, tiny ones dropped, readable names, rounded numbers', () => {
  const list = H.summarizeWorkouts([
    { type: 37, start: d(26, 7, 0), durationSeconds: 1800, kcal: 312.6, meters: 5234 },
    { type: 50, start: d(27, 18, 0), durationSeconds: 3600, kcal: 0, meters: null },
    { type: 52, start: d(27, 12, 0), durationSeconds: 30 },
    { type: 999, start: d(25, 9, 0), durationSeconds: 600 },
  ]);
  assert.deepEqual(list.map((w) => [w.label, w.minutes, w.kcal, w.km]), [['Traditional strength', 60, null, null], ['Running', 30, 313, 5.2], ['Workout', 10, null, null]]);
  assert.equal(H.summarizeWorkouts(Array.from({ length: 30 }, (_, i) => ({ type: 37, start: d(1 + (i % 25)), durationSeconds: 600 })), 5).length, 5);
});

t('sleep log writes: new nights are added, Apple-Health nights refreshed, hand-logged and Oura nights are never overwritten', () => {
  const nights = H.sleepNights([S(d(25, 23, 0), d(26, 7, 0), V.core), S(d(26, 23, 30), d(27, 6, 30), V.core), S(d(27, 23, 0), d(28, 7, 15), V.core)]);
  const plan = H.planSleepWrites(nights, [{ sleep_date: '2026-10-28', source: 'manual' }, { sleep_date: '2026-10-27', source: 'apple_health' }, { sleep_date: '2026-10-26', source: 'oura' }]);
  assert.deepEqual(plan.write.map((r) => r.sleep_date), ['2026-10-27']);
  assert.equal(plan.skipped, 2);
  const fresh = H.planSleepWrites(nights, []);
  assert.equal(fresh.write.length, 3);
  assert.ok(fresh.write.every((r) => r.source === 'apple_health' && r.duration_minutes > 0 && /T/.test(r.bedtime)));
});

t('duration text', () => {
  assert.equal(H.formatDuration(450), '7 h 30 min');
  assert.equal(H.formatDuration(45), '45 min');
  assert.equal(H.formatDuration(480), '8 h 00 min');
});

// ── Android Health Connect ────────────────────────────────────────────────────
const iso = (day, h = 0, m = 0) => d(day, h, m).toISOString();

t('Health Connect: a session with stages becomes the same samples Apple gives, so the same night comes out', () => {
  const stages = [
    { startTime: iso(27, 23, 0), endTime: iso(27, 23, 20), stage: 4 }, // light
    { startTime: iso(27, 23, 20), endTime: iso(28, 0, 20), stage: 5 }, // deep
    { startTime: iso(28, 0, 20), endTime: iso(28, 1, 0), stage: 4 },
    { startTime: iso(28, 1, 0), endTime: iso(28, 1, 15), stage: 1 }, // awake
    { startTime: iso(28, 1, 15), endTime: iso(28, 2, 15), stage: 6 }, // REM
    { startTime: iso(28, 2, 15), endTime: iso(28, 6, 45), stage: 4 },
  ];
  const samples = H.healthConnectSleepSamples([{ startTime: iso(27, 23, 0), endTime: iso(28, 6, 45), stages }]);
  assert.equal(samples.length, 6);
  const apple = [S(d(27, 23, 0), d(27, 23, 20), V.core), S(d(27, 23, 20), d(28, 0, 20), V.deep), S(d(28, 0, 20), d(28, 1, 0), V.core), S(d(28, 1, 0), d(28, 1, 15), V.awake), S(d(28, 1, 15), d(28, 2, 15), V.rem), S(d(28, 2, 15), d(28, 6, 45), V.core)];
  assert.deepEqual(H.sleepNights(samples), H.sleepNights(apple));
  const night = H.sleepNights(samples)[0];
  assert.equal(night.sleepDate, '2026-10-28');
  assert.equal(night.deepMinutes, 60);
  assert.equal(night.remMinutes, 60);
  assert.equal(night.awakeMinutes, 15);
});

t('Health Connect: a session without stages is plain "asleep", and no stage detail is invented', () => {
  for (const stages of [undefined, null, []]) {
    const nights = H.sleepNights(H.healthConnectSleepSamples([{ startTime: iso(27, 23, 30), endTime: iso(28, 7, 0), stages }]));
    assert.equal(nights.length, 1);
    assert.equal(nights[0].asleepMinutes, 450);
    assert.equal(nights[0].deepMinutes, null);
    assert.equal(nights[0].remMinutes, null);
    assert.equal(nights[0].usedInBedOnly, false);
  }
});

t('Health Connect: out-of-bed and unknown stages are not sleep; "sleeping" and "awake in bed" are mapped', () => {
  const samples = H.healthConnectSleepSamples([
    { startTime: iso(27, 23, 0), endTime: iso(28, 7, 0), stages: [
      { startTime: iso(27, 23, 0), endTime: iso(27, 23, 30), stage: 0 },
      { startTime: iso(27, 23, 30), endTime: iso(28, 1, 0), stage: 2 },
      { startTime: iso(28, 1, 0), endTime: iso(28, 1, 30), stage: 3 },
      { startTime: iso(28, 1, 30), endTime: iso(28, 1, 45), stage: 7 },
      { startTime: iso(28, 1, 45), endTime: iso(28, 7, 0), stage: 2 },
    ] },
  ]);
  assert.deepEqual(samples.map((x) => x.value), [V.asleepUnspecified, V.awake, V.asleepUnspecified]);
  const n1 = H.sleepNights(samples)[0];
  assert.equal(n1.asleepMinutes, 90 + 315);
});

t('Health Connect: bad times and unknown stage numbers are ignored, not turned into sleep', () => {
  assert.deepEqual(H.healthConnectSleepSamples([]), []);
  assert.deepEqual(H.healthConnectSleepSamples([{ startTime: 'nope', endTime: iso(28, 7, 0) }]), []);
  assert.deepEqual(H.healthConnectSleepSamples([{ startTime: iso(28, 7, 0), endTime: iso(28, 6, 0) }]), []);
  assert.deepEqual(H.healthConnectSleepSamples([{ startTime: iso(27, 23, 0), endTime: iso(28, 7, 0), stages: [{ startTime: iso(27, 23, 0), endTime: iso(28, 7, 0), stage: 99 }] }]), []);
});

t('two Health Connect sessions in a night with a nap: the nap is left out, the night kept', () => {
  const nights = H.sleepNights(H.healthConnectSleepSamples([
    { startTime: iso(27, 23, 0), endTime: iso(28, 7, 0) },
    { startTime: iso(28, 14, 0), endTime: iso(28, 14, 40) },
  ]));
  assert.equal(nights.length, 1);
  assert.equal(nights[0].asleepMinutes, 480);
});

t('sleep log writes: a night from the other health source is never overwritten, and the source is recorded', () => {
  const nights = H.sleepNights(H.healthConnectSleepSamples([{ startTime: iso(26, 23, 0), endTime: iso(27, 7, 0) }, { startTime: iso(27, 23, 0), endTime: iso(28, 7, 0) }]));
  const plan = H.planSleepWrites(nights, [{ sleep_date: '2026-10-27', source: 'apple_health' }, { sleep_date: '2026-10-28', source: 'health_connect' }], 'health_connect');
  assert.equal(plan.skipped, 1, 'the Apple Health night is protected');
  assert.deepEqual(plan.write.map((r) => [r.sleep_date, r.source]), [['2026-10-28', 'health_connect']], 'the earlier Health Connect night can be refreshed');
  const apple = H.planSleepWrites(nights, [{ sleep_date: '2026-10-27', source: 'health_connect' }]);
  assert.equal(apple.write.every((r) => r.source === 'apple_health'), true, 'the default is still Apple Health');
  assert.equal(apple.skipped, 1);
});

t('workouts can carry their own name (Health Connect) instead of Apple\'s numbers', () => {
  const w = H.summarizeWorkouts([{ type: 70, label: 'Strength training', start: d(27, 7, 0), durationSeconds: 3000, kcal: 220.4, meters: null }, { type: 37, start: d(26, 7, 0), durationSeconds: 1800 }]);
  assert.deepEqual(w.map((x) => x.label), ['Strength training', 'Running']);
  assert.equal(w[0].kcal, 220);
});

console.log(n, 'passed');
