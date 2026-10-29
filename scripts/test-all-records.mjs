// Checks the "My records" list (recordsOverview, filterExercises, sortExercises in lib/prBadges.ts). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-all-records.mjs
import assert from 'node:assert/strict';
import * as P from '../lib/prBadges.ts';

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

let seq = 0;
const s = (exercise_id, date, weight, reps, unit = 'kg') => ({ exercise_id, logged_date: date, weight, weight_unit: unit, reps, created_at: `${date}T07:00:${String(seq++ % 60).padStart(2, '0')}Z` });
const NAMES = { bench: 'Bench Press', squat: 'Back Squat', pullup: 'Pull-up', dead: 'Deadlift' };

t('nothing logged: nothing to show', () => {
  const o = P.recordsOverview([], NAMES);
  assert.deepEqual(o, { exercises: [], events: [], setCount: 0 });
});

t('one exercise with one set: a starting point, not a record', () => {
  const o = P.recordsOverview([s('bench', '2026-10-01', 60, 8)], NAMES);
  assert.equal(o.exercises.length, 1);
  const e = o.exercises[0];
  assert.equal(e.name, 'Bench Press');
  assert.equal(e.totalSets, 1);
  assert.equal(e.prCount, 0);
  assert.equal(e.lastPrDate, null);
  assert.equal(e.heaviest.weight, 60);
  assert.equal(e.lastDate, '2026-10-01');
  assert.deepEqual(o.events, []);
});

t('records per exercise are the same ones the exercise page works out', () => {
  const rows = [
    s('bench', '2026-09-01', 60, 8), s('bench', '2026-09-08', 62.5, 8), s('bench', '2026-09-15', 62.5, 8), s('bench', '2026-09-22', 65, 5),
    s('squat', '2026-09-02', 100, 5), s('squat', '2026-09-09', 100, 5), s('squat', '2026-09-16', 105, 3),
  ];
  const o = P.recordsOverview(rows, NAMES);
  for (const ex of o.exercises) {
    const mine = rows.filter((r) => r.exercise_id === ex.exerciseId);
    const hist = P.prHistory(mine);
    const best = P.bestRecords(mine);
    assert.equal(ex.prCount, hist.length, ex.name);
    assert.deepEqual(ex.heaviest, best.heaviest, ex.name);
    assert.deepEqual(ex.bestE1rm, best.bestE1rm, ex.name);
    assert.equal(ex.totalSets, mine.length);
  }
  const events = o.events.filter((e) => e.exerciseId === 'bench');
  assert.deepEqual(events.map((e) => e.set.logged_date), ['2026-09-22', '2026-09-08']);
});

t('the feed is every badge, newest first, across exercises', () => {
  const rows = [
    s('bench', '2026-09-01', 60, 8), s('bench', '2026-09-20', 65, 8),
    s('squat', '2026-09-02', 100, 5), s('squat', '2026-09-25', 110, 5),
    s('dead', '2026-09-03', 120, 5), s('dead', '2026-09-25', 130, 5),
  ];
  const o = P.recordsOverview(rows, NAMES);
  assert.deepEqual(o.events.map((e) => `${e.set.logged_date} ${e.name}`), ['2026-09-25 Deadlift', '2026-09-25 Back Squat', '2026-09-20 Bench Press'].map((x) => x));
  assert.ok(o.events.every((e) => e.prs.length > 0 && e.exerciseId && e.name));
  const sum = o.exercises.reduce((a, e) => a + e.prCount, 0);
  assert.equal(sum, o.events.length);
});

t('two badges on one day: the one logged later comes first', () => {
  const a = { ...s('bench', '2026-09-01', 60, 8), created_at: '2026-09-01T07:00:00Z' };
  const b = { ...s('bench', '2026-09-10', 62.5, 8), created_at: '2026-09-10T08:00:00Z' };
  const c = { ...s('squat', '2026-09-02', 100, 5), created_at: '2026-09-02T07:00:00Z' };
  const d = { ...s('squat', '2026-09-10', 105, 5), created_at: '2026-09-10T09:00:00Z' };
  const o = P.recordsOverview([a, b, c, d], NAMES);
  assert.deepEqual(o.events.map((e) => e.name), ['Back Squat', 'Bench Press']);
});

t('bodyweight exercises: best reps, no heaviest, and a rep record is a badge', () => {
  const rows = [s('pullup', '2026-09-01', 0, 8), s('pullup', '2026-09-08', 0, 10), s('pullup', '2026-09-15', 0, 9)];
  const o = P.recordsOverview(rows, NAMES);
  const e = o.exercises[0];
  assert.equal(e.heaviest, null);
  assert.equal(e.bestE1rm, null);
  assert.equal(e.mostBodyweightReps, 10);
  assert.equal(e.prCount, 1);
  assert.equal(e.lastPrDate, '2026-09-08');
  assert.equal(P.recordsOverview([s('bench', '2026-09-01', 60, 8)], NAMES).exercises[0].mostBodyweightReps, null);
});

t('kg and lb: compared properly, shown in the unit logged', () => {
  const rows = [s('bench', '2026-09-01', 100, 5, 'kg'), s('bench', '2026-09-08', 225, 5, 'lb'), s('bench', '2026-09-15', 220, 5, 'lb')];
  const e = P.recordsOverview(rows, NAMES).exercises[0];
  assert.equal(e.heaviest.weight, 225);
  assert.equal(e.heaviest.weight_unit, 'lb');
  assert.equal(e.prCount, 1, '225 lb beats 100 kg; 220 lb does not beat 225 lb');
});

t('an exercise with no name known is labelled, not dropped', () => {
  const o = P.recordsOverview([s('mystery', '2026-09-01', 50, 5)], NAMES);
  assert.equal(o.exercises[0].name, P.UNKNOWN_EXERCISE);
  assert.equal(P.recordsOverview([s('bench', '2026-09-01', 50, 5)], new Map([['bench', 'Map Bench']])).exercises[0].name, 'Map Bench');
});

t('rows may arrive in any order', () => {
  const rows = [s('bench', '2026-09-22', 65, 5), s('bench', '2026-09-01', 60, 8), s('squat', '2026-09-16', 105, 3), s('bench', '2026-09-08', 62.5, 8), s('squat', '2026-09-02', 100, 5)];
  const a = P.recordsOverview(rows, NAMES);
  const b = P.recordsOverview([...rows].reverse(), NAMES);
  const key = (o) => o.exercises.map((e) => [e.name, e.prCount, e.lastPrDate, e.heaviest.weight]).sort().join('|');
  assert.equal(key(a), key(b));
  assert.deepEqual(a.events.map((e) => `${e.name} ${e.set.logged_date}`), b.events.map((e) => `${e.name} ${e.set.logged_date}`));
});

const SUMMARY = P.recordsOverview(
  [
    s('bench', '2026-09-01', 60, 8), s('bench', '2026-10-05', 65, 8),
    s('squat', '2026-09-02', 100, 5), s('squat', '2026-09-09', 100, 5),
    s('pullup', '2026-10-10', 0, 8), s('pullup', '2026-10-12', 0, 9),
    s('dead', '2026-08-01', 225, 5, 'lb'), s('dead', '2026-08-08', 230, 5, 'lb'),
  ],
  NAMES
).exercises;

t('search: case-insensitive, trims, empty keeps all', () => {
  assert.equal(P.filterExercises(SUMMARY, '').length, 4);
  assert.equal(P.filterExercises(SUMMARY, '   ').length, 4);
  assert.deepEqual(P.filterExercises(SUMMARY, ' PRESS ').map((x) => x.name), ['Bench Press']);
  assert.deepEqual(P.filterExercises(SUMMARY, 'up').map((x) => x.name), ['Pull-up']);
  assert.equal(P.filterExercises(SUMMARY, 'zzz').length, 0);
});

t('sort: recent badge first, A to Z, heaviest (lb compared with kg, no-weight last)', () => {
  assert.deepEqual(P.sortExercises(SUMMARY, 'recent').map((x) => x.name), ['Pull-up', 'Bench Press', 'Deadlift', 'Back Squat']);
  assert.deepEqual(P.sortExercises(SUMMARY, 'name').map((x) => x.name), ['Back Squat', 'Bench Press', 'Deadlift', 'Pull-up']);
  // 230 lb is 104.3 kg, which is heavier than 100 kg for the squat and 65 kg for the bench
  assert.deepEqual(P.sortExercises(SUMMARY, 'heaviest').map((x) => x.name), ['Deadlift', 'Back Squat', 'Bench Press', 'Pull-up']);
  const before = SUMMARY.map((x) => x.name).join();
  P.sortExercises(SUMMARY, 'name');
  assert.equal(SUMMARY.map((x) => x.name).join(), before, 'sorting does not change the list it is given');
});

t('sort: exercises with no badge fall back to the most recently trained, then name', () => {
  const list = P.recordsOverview([s('a', '2026-01-01', 10, 5), s('b', '2026-03-01', 10, 5), s('c', '2026-03-01', 10, 5)], { a: 'Alpha', b: 'Beta', c: 'Charlie' }).exercises;
  assert.deepEqual(P.sortExercises(list, 'recent').map((x) => x.name), ['Beta', 'Charlie', 'Alpha']);
});

t('large logbook: 50,000 sets across 80 exercises in under 2 seconds, and it agrees with the per-exercise rules', () => {
  const rows = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 50_000; i++) {
    const d = new Date(Date.UTC(2020, 0, 1) + Math.floor(i / 30) * 86400000).toISOString().slice(0, 10);
    rows.push({ exercise_id: `e${i % 80}`, logged_date: d, weight_unit: rnd() < 0.3 ? 'lb' : 'kg', weight: Math.round(rnd() * 200) / 2, reps: 1 + Math.floor(rnd() * 15), created_at: `${d}T07:${String(i % 60).padStart(2, '0')}:00Z` });
  }
  const t0 = Date.now();
  const o = P.recordsOverview(rows, {});
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.equal(o.exercises.length, 80);
  assert.equal(o.setCount, 50_000);
  for (const id of ['e0', 'e17', 'e79']) {
    const mine = rows.filter((r) => r.exercise_id === id);
    const ex = o.exercises.find((x) => x.exerciseId === id);
    assert.equal(ex.prCount, P.prHistory(mine).length);
    assert.equal(ex.totalSets, mine.length);
  }
  assert.equal(o.events.length, o.exercises.reduce((a, e) => a + e.prCount, 0));
  for (let i = 1; i < o.events.length; i++) assert.ok(o.events[i - 1].set.logged_date >= o.events[i].set.logged_date, 'newest first');
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
