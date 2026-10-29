// Checks lib/healthConnectSource.ts (how FitNFree reads Android Health Connect) against a made-up Health Connect, since the real one only exists on a phone.
// The shapes of the made-up answers follow the react-native-health-connect 4.1.3 types (records, aggregates, grouped aggregates).
//   node scripts/test-health-connect.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

// The source file imports its neighbours without ".ts"; let Node find them.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith('.') && !/\\.[a-z]+$/.test(s)) return next(s + '.ts', c); throw e; } }`),
  import.meta.url
);
const S = await import('../lib/healthConnectSource.ts');

let n = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log('  ok  ', name);
    n++;
  } catch (e) {
    console.log('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};

const ALL = S.HC_READ_TYPES.map((recordType) => ({ accessType: 'read', recordType }));
const day = (ago, h = 0, m = 0) => {
  const x = new Date();
  x.setHours(h, m, 0, 0);
  x.setDate(x.getDate() - ago);
  return x;
};
const iso = (ago, h, m) => day(ago, h, m).toISOString();

// A made-up Health Connect. `data` holds what it would answer; `calls` records what the app asked.
function fake(over = {}) {
  const calls = [];
  const d = { sdk: 3, init: true, granted: ALL, onRequest: ALL, records: {}, aggregates: {}, groups: [], ...over };
  const api = {
    getSdkStatus: async () => {
      if (d.sdk instanceof Error) throw d.sdk;
      return d.sdk;
    },
    initialize: async () => {
      calls.push(['initialize']);
      if (d.init instanceof Error) throw d.init;
      return d.init;
    },
    requestPermission: async (p) => {
      calls.push(['requestPermission', p]);
      return d.onRequest;
    },
    getGrantedPermissions: async () => d.granted,
    readRecords: async (type, o) => {
      calls.push(['readRecords', type, o]);
      const r = d.records[type];
      if (r instanceof Error) throw r;
      if (typeof r === 'function') return r(o);
      return { records: r ?? [] };
    },
    aggregateRecord: async (req) => {
      calls.push(['aggregateRecord', req.recordType, req.timeRangeFilter]);
      const r = d.aggregates[req.recordType];
      if (r instanceof Error) throw r;
      if (typeof r === 'function') return r(req);
      return r ?? {};
    },
    aggregateGroupByPeriod: async (req) => {
      calls.push(['aggregateGroupByPeriod', req.recordType, req.timeRangeFilter, req.timeRangeSlicer]);
      if (d.groups instanceof Error) throw d.groups;
      return d.groups;
    },
    openHealthConnectSettings: () => calls.push(['openSettings']),
  };
  return { api, calls, src: S.createHealthConnectSource(api, { 8: 'BIKING', 56: 'RUNNING', 70: 'STRENGTH_TRAINING', 0: 'OTHER_WORKOUT', 82: 'YOGA' }) };
}
const asked = (calls, kind, type) => calls.filter((c) => c[0] === kind && (type === undefined || c[1] === type));

// ── Connecting ────────────────────────────────────────────────────────────────
await t('availability: only when Health Connect is present and starts', async () => {
  assert.equal(await fake().src.available(), true);
  assert.equal(await fake({ sdk: 1 }).src.available(), false, 'not installed');
  assert.equal(await fake({ sdk: 2 }).src.available(), false, 'needs an update');
  assert.equal(await fake({ sdk: new Error('boom') }).src.available(), false);
  assert.equal(await fake({ init: false }).src.available(), false);
  assert.equal(await fake({ init: new Error('boom') }).src.available(), false);
});

await t('it asks only to READ, only the listed types, and never to write', async () => {
  const { src, calls } = fake();
  assert.equal(await src.requestAccess(), true);
  const req = asked(calls, 'requestPermission')[0][1];
  assert.deepEqual(req.map((p) => p.recordType), [...S.HC_READ_TYPES]);
  assert.ok(req.every((p) => p.accessType === 'read'));
});

await t('if nothing is allowed it says so instead of pretending to be connected', async () => {
  await assert.rejects(() => fake({ onRequest: [] }).src.requestAccess(), /Nothing was allowed/);
  await assert.rejects(() => fake({ onRequest: [{ accessType: 'write', recordType: 'Steps' }] }).src.requestAccess(), /Nothing was allowed/);
  assert.equal(await fake({ onRequest: [{ accessType: 'read', recordType: 'Steps' }] }).src.requestAccess(), true, 'one type is enough');
  await assert.rejects(() => fake({ init: false }).src.requestAccess(), /could not be started/);
});

await t('what is declared in app.json is exactly what is read: the same seven read permissions, no write, no extras', async () => {
  const app = JSON.parse(readFileSync(fileURLToPath(new URL('../app.json', import.meta.url)), 'utf8'));
  const health = app.expo.android.permissions.filter((p) => p.startsWith('android.permission.health.'));
  assert.deepEqual([...health].sort(), [...S.HC_MANIFEST_PERMISSIONS].sort());
  assert.ok(health.every((p) => p.startsWith('android.permission.health.READ_')));
  const need = { Steps: 'READ_STEPS', ActiveCaloriesBurned: 'READ_ACTIVE_CALORIES_BURNED', Distance: 'READ_DISTANCE', RestingHeartRate: 'READ_RESTING_HEART_RATE', Weight: 'READ_WEIGHT', SleepSession: 'READ_SLEEP', ExerciseSession: 'READ_EXERCISE' };
  assert.deepEqual(Object.keys(need).sort(), [...S.HC_READ_TYPES].sort());
  for (const [type, perm] of Object.entries(need)) assert.ok(health.includes(`android.permission.health.${perm}`), `${type} needs ${perm}`);
  const plugins = app.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  assert.ok(plugins.includes('react-native-health-connect'));
  const bp = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties');
  assert.equal(bp[1].android.minSdkVersion, 26, 'Health Connect needs Android 8.0 or later');
});

// ── Today ─────────────────────────────────────────────────────────────────────
await t('today: steps, energy and distance come from Health Connect\'s own totals; heart rate and weight are the latest reading', async () => {
  const { src, calls } = fake({
    aggregates: { Steps: { COUNT_TOTAL: 8234.4 }, ActiveCaloriesBurned: { ACTIVE_CALORIES_TOTAL: { inKilocalories: 412.6 } }, Distance: { DISTANCE: { inKilometers: 5.678 } } },
    records: { RestingHeartRate: [{ beatsPerMinute: 58.4 }], Weight: [{ weight: { value: 180.4, unit: 'pounds' } }] },
  });
  const t0 = await src.today();
  assert.deepEqual(t0, { steps: 8234, activeKcal: 413, distanceKm: 5.7, restingHr: 58, weightKg: 81.8 });
  const range = asked(calls, 'aggregateRecord', 'Steps')[0][2];
  const start = new Date(range.startTime);
  assert.deepEqual([start.getHours(), start.getMinutes(), start.getSeconds()], [0, 0, 0], 'today starts at local midnight');
  const hr = asked(calls, 'readRecords', 'RestingHeartRate')[0][2];
  assert.equal(hr.ascendingOrder, false);
  assert.equal(hr.pageSize, 1);
});

await t('today: types that were not allowed are not even asked for, and read as nothing', async () => {
  const { src, calls } = fake({ granted: [{ accessType: 'read', recordType: 'Steps' }], aggregates: { Steps: { COUNT_TOTAL: 5000 } } });
  assert.deepEqual(await src.today(), { steps: 5000, activeKcal: 0, distanceKm: 0, restingHr: null, weightKg: null });
  assert.equal(asked(calls, 'aggregateRecord').length, 1);
  assert.equal(asked(calls, 'readRecords').length, 0);
  assert.deepEqual(await fake({ granted: [] }).src.today(), { steps: 0, activeKcal: 0, distanceKm: 0, restingHr: null, weightKg: null });
});

await t('today: one failing read does not spoil the rest, and junk values read as nothing', async () => {
  const { src } = fake({
    aggregates: { Steps: new Error('permission'), ActiveCaloriesBurned: { ACTIVE_CALORIES_TOTAL: { inKilocalories: 'lots' } }, Distance: { DISTANCE: { inKilometers: 3 } } },
    records: { RestingHeartRate: new Error('boom'), Weight: [{ weight: { value: -5, unit: 'kilograms' } }] },
  });
  assert.deepEqual(await src.today(), { steps: 0, activeKcal: 0, distanceKm: 3, restingHr: null, weightKg: null });
});

await t('weights in any unit become kilograms', () => {
  assert.equal(S.massToKg({ value: 82.5, unit: 'kilograms' }), 82.5);
  assert.equal(Math.round(S.massToKg({ value: 180, unit: 'pounds' }) * 100) / 100, 81.65);
  assert.equal(S.massToKg({ value: 82500, unit: 'grams' }), 82.5);
  assert.equal(S.massToKg({ value: 1, unit: 'stone' }), null);
  assert.equal(S.massToKg({ value: 0, unit: 'kilograms' }), null);
  assert.equal(S.massToKg(undefined), null);
});

// ── Steps by day ──────────────────────────────────────────────────────────────
await t('steps by day: one bar per day, missing days are zero, the last bar is today', async () => {
  const groups = [{ startTime: iso(2, 0, 0), endTime: iso(1, 0, 0), result: { COUNT_TOTAL: 6000 } }, { startTime: iso(0, 0, 0), endTime: iso(0, 23, 0), result: { COUNT_TOTAL: 1234 } }];
  const { src, calls } = fake({ groups });
  const out = await src.stepsLastDays(7);
  assert.equal(out.length, 7);
  assert.deepEqual(out.map((x) => x.value), [0, 0, 0, 0, 6000, 0, 1234]);
  const call = asked(calls, 'aggregateGroupByPeriod')[0];
  assert.deepEqual(call[3], { period: 'DAYS', length: 1 });
  const anchor = new Date(call[2].startTime);
  assert.deepEqual([anchor.getHours(), anchor.getMinutes()], [0, 0]);
  assert.equal(anchor.getTime(), day(6, 0, 0).getTime(), '7 days including today: it starts at midnight 6 days ago');
});

await t('steps by day: local-time bucket starts without a zone are read as local days; steps not allowed means zeros and no call', async () => {
  const x = day(1);
  const local = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T00:00:00`;
  const out = await fake({ groups: [{ startTime: local, endTime: local, result: { COUNT_TOTAL: 4321 } }] }).src.stepsLastDays(3);
  assert.deepEqual(out.map((v) => v.value), [0, 4321, 0]);
  const { src, calls } = fake({ granted: [] });
  assert.deepEqual((await src.stepsLastDays(7)).map((v) => v.value), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(asked(calls, 'aggregateGroupByPeriod').length, 0);
});

// ── Sleep ─────────────────────────────────────────────────────────────────────
await t('sleep: sessions (with or without stages) become samples; the last 3 days are asked for in order', async () => {
  const records = [{ startTime: iso(1, 23, 0), endTime: iso(0, 7, 0), stages: [{ startTime: iso(1, 23, 0), endTime: iso(0, 3, 0), stage: 4 }, { startTime: iso(0, 3, 0), endTime: iso(0, 5, 0), stage: 5 }, { startTime: iso(0, 5, 0), endTime: iso(0, 7, 0), stage: 6 }] }];
  const { src, calls } = fake({ records: { SleepSession: records } });
  const samples = await src.sleepSamples(3);
  assert.deepEqual(samples.map((s) => s.value), [3, 4, 5]);
  assert.ok(samples.every((s) => s.start instanceof Date && s.end instanceof Date));
  const o = asked(calls, 'readRecords', 'SleepSession')[0][2];
  assert.equal(o.ascendingOrder, true);
});

await t('sleep: reads every page, and stops after 10 pages even if the answer never ends', async () => {
  const pages = [
    { records: [{ startTime: iso(3, 23, 0), endTime: iso(2, 7, 0) }], pageToken: 'p2' },
    { records: [{ startTime: iso(2, 23, 0), endTime: iso(1, 7, 0) }], pageToken: 'p3' },
    { records: [{ startTime: iso(1, 23, 0), endTime: iso(0, 7, 0) }] },
  ];
  let i = 0;
  const { src, calls } = fake({ records: { SleepSession: () => pages[i++] } });
  assert.equal((await src.sleepSamples(7)).length, 3);
  assert.equal(asked(calls, 'readRecords', 'SleepSession').length, 3);
  assert.equal(asked(calls, 'readRecords', 'SleepSession')[1][2].pageToken, 'p2');
  const endless = fake({ records: { SleepSession: () => ({ records: [{ startTime: iso(1, 23, 0), endTime: iso(0, 7, 0) }], pageToken: 'more' }) } });
  await endless.src.sleepSamples(7);
  assert.equal(asked(endless.calls, 'readRecords', 'SleepSession').length, 10);
});

await t('sleep: not allowed means nothing read', async () => {
  const { src, calls } = fake({ granted: [{ accessType: 'read', recordType: 'Steps' }] });
  assert.deepEqual(await src.sleepSamples(3), []);
  assert.equal(asked(calls, 'readRecords').length, 0);
});

// ── Workouts ──────────────────────────────────────────────────────────────────
await t('workouts: named, newest first, with energy and distance when Health Connect has them', async () => {
  const records = [
    { exerciseType: 56, startTime: iso(5, 7, 0), endTime: iso(5, 7, 45) },
    { exerciseType: 70, startTime: iso(1, 18, 0), endTime: iso(1, 18, 50) },
    { exerciseType: 0, startTime: iso(2, 12, 0), endTime: iso(2, 12, 30) },
  ];
  const { src, calls } = fake({
    records: { ExerciseSession: records },
    aggregates: {
      ActiveCaloriesBurned: (req) => (req.timeRangeFilter.startTime === records[0].startTime ? { ACTIVE_CALORIES_TOTAL: { inKilocalories: 420.4 } } : { ACTIVE_CALORIES_TOTAL: { inKilocalories: 0 } }),
      Distance: (req) => (req.timeRangeFilter.startTime === records[0].startTime ? { DISTANCE: { inKilometers: 6.04 } } : { DISTANCE: { inKilometers: 0 } }),
    },
  });
  const w = await src.workouts(14);
  assert.deepEqual(w.map((x) => x.label), ['Strength training', 'Workout', 'Running']);
  assert.deepEqual(w.map((x) => x.minutes), [50, 30, 45]);
  assert.equal(w[2].kcal, 420);
  assert.equal(w[2].km, 6);
  assert.equal(w[0].kcal, null);
  assert.equal(w[0].km, null);
  assert.equal(asked(calls, 'readRecords', 'ExerciseSession')[0][2].pageSize, 40);
});

await t('workouts: a failing energy read leaves that workout without a number, not out of the list; junk records are dropped', async () => {
  const records = [
    { exerciseType: 8, startTime: iso(1, 7, 0), endTime: iso(1, 8, 0) },
    { exerciseType: 8, startTime: 'nope', endTime: iso(1, 8, 0) },
    { exerciseType: 82, startTime: iso(2, 7, 0), endTime: iso(2, 7, 0) },
    { exerciseType: 82, startTime: iso(2, 9, 0), endTime: iso(2, 9, 0, 30) },
  ];
  records[3].endTime = new Date(Date.parse(records[3].startTime) + 30_000).toISOString();
  const { src } = fake({ records: { ExerciseSession: records }, aggregates: { ActiveCaloriesBurned: new Error('boom'), Distance: { DISTANCE: { inKilometers: 20 } } } });
  const w = await src.workouts(14);
  assert.equal(w.length, 1, 'the zero-length, the 30-second and the unreadable ones are dropped');
  assert.equal(w[0].label, 'Biking');
  assert.equal(w[0].kcal, null);
  assert.equal(w[0].km, 20);
});

await t('workouts: at most 10, and not allowed means none and nothing asked', async () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ exerciseType: 56, startTime: iso(i % 10, 6 + (i % 5), 0), endTime: iso(i % 10, 7 + (i % 5), 0) }));
  const { src, calls } = fake({ records: { ExerciseSession: many } });
  assert.equal((await src.workouts(14)).length, 10);
  assert.ok(asked(calls, 'aggregateRecord').length <= 20, 'two reads per workout at most');
  const none = fake({ granted: [] });
  assert.deepEqual(await none.src.workouts(14), []);
  assert.equal(asked(none.calls, 'readRecords').length, 0);
});

await t('exercise type names read well', () => {
  assert.equal(S.humanizeExerciseType('STRENGTH_TRAINING'), 'Strength training');
  assert.equal(S.humanizeExerciseType('HIGH_INTENSITY_INTERVAL_TRAINING'), 'High intensity interval training');
  assert.equal(S.humanizeExerciseType('OTHER_WORKOUT'), 'Workout');
  assert.equal(S.humanizeExerciseType(undefined), 'Workout');
});

await t('the source says what it is and opens Health Connect\'s own settings', async () => {
  const { src, calls } = fake();
  assert.equal(src.id, 'health_connect');
  assert.equal(src.name, 'Health Connect');
  await src.openSettings();
  assert.equal(asked(calls, 'openSettings').length, 1);
  for (const k of ['intro', 'unavailable', 'settingsLink', 'disconnected', 'nothingCameThrough']) assert.ok(src.copy[k].length > 20, k);
  assert.ok(/30 days/.test(src.copy.nothingCameThrough), 'the 30-day history limit is explained');
  assert.ok(!/apple/i.test(Object.values(src.copy).join(' ')), 'no Apple wording on Android');
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
