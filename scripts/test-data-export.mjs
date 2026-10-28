// Checks lib/dataExport.ts (the rules behind "Export my data"). Node 22.6+ runs the TypeScript directly.
//   node scripts/test-data-export.mjs
import assert from 'node:assert/strict';
import * as E from '../lib/dataExport.ts';

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

// A small, strict CSV reader (RFC 4180), so the files can be read back and compared with what went in.
function parseCsv(text) {
  assert.ok(text.startsWith('﻿'), 'starts with a byte-order mark');
  const s = text.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && s[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  assert.equal(cell, '', 'file ends with a line break');
  assert.equal(row.length, 0);
  return rows;
}

// ── One cell ──────────────────────────────────────────────────────────────────
await t('cells: empty, numbers, text, quotes, commas, line breaks', () => {
  assert.equal(E.csvCell(null), '');
  assert.equal(E.csvCell(undefined), '');
  assert.equal(E.csvCell(0), '0');
  assert.equal(E.csvCell(82.5), '82.5');
  assert.equal(E.csvCell(-3), '-3');
  assert.equal(E.csvCell(NaN), '');
  assert.equal(E.csvCell(Infinity), '');
  assert.equal(E.csvCell(true), 'true');
  assert.equal(E.csvCell('plain'), 'plain');
  assert.equal(E.csvCell('a,b'), '"a,b"');
  assert.equal(E.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(E.csvCell('two\nlines'), '"two\nlines"');
  assert.equal(E.csvCell('café 🏋️'), 'café 🏋️');
});

await t('cells: text a spreadsheet would run as a formula is kept as text; real numbers are not touched', () => {
  assert.equal(E.csvCell('=1+1'), "'=1+1");
  assert.equal(E.csvCell('+44 7000'), "'+44 7000");
  assert.equal(E.csvCell('-2+3'), "'-2+3");
  assert.equal(E.csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(E.csvCell('\t=1'), "'\t=1");
  assert.equal(E.csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(E.csvCell('2026-10-28'), '2026-10-28');
  assert.equal(E.csvCell('2026-10-28T07:00:00+00:00'), '2026-10-28T07:00:00+00:00');
  assert.equal(E.csvCell(-12.5), '-12.5');
});

await t('cells: lists and objects are written as JSON text', () => {
  assert.equal(E.csvCell([1, 2]), '"[1,2]"');
});

// ── Whole file ────────────────────────────────────────────────────────────────
await t('a CSV file: byte-order mark, CRLF line breaks, header, one line per record, missing values blank', () => {
  const cols = [
    { key: 'a', header: 'A' },
    { key: 'b', header: 'B, with comma' },
  ];
  const text = E.toCsv(cols, [{ a: 1, b: 'x' }, { a: 2 }, {}]);
  assert.equal(text, '﻿A,"B, with comma"\r\n1,x\r\n2,\r\n,\r\n');
  assert.equal(E.toCsv(cols, []), '﻿A,"B, with comma"\r\n');
});

await t('a CSV file reads back to exactly what went in, including awkward text', () => {
  const cols = [
    { key: 'd', header: 'Date' },
    { key: 'note', header: 'Notes' },
  ];
  const notes = ['plain', 'a,b', 'say "hi"', 'line1\nline2', 'win\r\nline', '', 'ünïcode 🏋️', '  spaced  ', '"', ',', '""'];
  const recs = notes.map((note, i) => ({ d: `2026-01-${String(i + 1).padStart(2, '0')}`, note }));
  const back = parseCsv(E.toCsv(cols, recs));
  assert.equal(back.length, recs.length + 1);
  assert.deepEqual(back[0], ['Date', 'Notes']);
  recs.forEach((r, i) => {
    assert.equal(back[i + 1][0], r.d);
    assert.equal(back[i + 1][1], r.note);
  });
});

await t('large file: 100,000 rows builds quickly', () => {
  const cols = [
    { key: 'a', header: 'A' },
    { key: 'b', header: 'B' },
  ];
  const recs = Array.from({ length: 100_000 }, (_, i) => ({ a: i, b: `row ${i}, "x"` }));
  const t0 = Date.now();
  const text = E.toCsv(cols, recs);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
  assert.equal(text.split('\r\n').length, 100_002);
});

// ── Turning database rows into records ────────────────────────────────────────
const rowFor = {
  sets: { id: 'x', user_id: 'U', exercise_id: 'e', logged_date: '2026-10-01', weight: '82.5', weight_unit: 'kg', reps: 8, created_at: '2026-10-01T07:00:00Z', exercises: { name: 'Bench Press' } },
  workoutDays: { id: 'x', user_id: 'U', logged_date: '2026-10-01', duration_minutes: 45, created_at: '2026-10-01T07:00:00Z', workout_plans: { name: 'Push' }, programs: null },
  body: { id: 'x', user_id: 'U', logged_date: '2026-10-01', weight_kg: '82.4', body_fat_pct: 18.5, waist_cm: null, notes: 'felt good', created_at: 'c' },
  meals: { id: 'x', user_id: 'U', log_date: '2026-10-01', meal_type: 'lunch', description: '=bad name', calories: 500, protein_g: '30', carbs_g: 40, fat_g: 10, fiber_g: null, iron_mg: null, photo_url: 'https://secret/photo.jpg', source: 'scan' },
  sleep: { id: 'x', user_id: 'U', sleep_date: '2026-10-01', duration_minutes: 450, bedtime: 'b', wake_time: 'w', quality_rating: 4, sleep_score: 80, notes: '', source: 'oura', deep_minutes: 90, sleep_phase_5min: 'AAAA' },
  mood: { id: 'x', user_id: 'U', log_date: '2026-10-01', mood: 4, notes: 'ok', ai_reflection: 'r' },
  hydration: { id: 'x', user_id: 'U', log_date: '2026-10-01', glasses: 6 },
  habitCheckins: { id: 'x', user_id: 'U', habit_id: 'h', logged_date: '2026-10-01', progress_value: '2.5', source: 'manual', habits: [{ name: 'Walk', unit: 'km' }] },
  outdoor: { id: 'x', user_id: 'U', activity_type: 'run', started_at: '2026-10-01T06:00:00Z', ended_at: '2026-10-01T06:30:00Z', distance_meters: '5000.5', duration_seconds: 1800, route: [{ lat: 1, lng: 2, t: 3 }] },
  habits: { id: 'x', user_id: 'U', name: 'Walk', habit_type: 'quantity', target_value: '5', unit: 'km', time_of_day: 'anytime', created_at: 'c', auto_sync_source: 'secret' },
  plans: {
    id: 'x',
    user_id: 'U',
    name: 'Push',
    description: null,
    emoji: '💪',
    created_at: 'c',
    workout_plan_exercises: [
      { order_index: 2, sets: 3, reps: 10, notes: null, exercises: { name: 'Dips' } },
      { order_index: 1, sets: 4, reps: 8, notes: 'slow', exercises: { name: 'Bench Press' } },
    ],
  },
  profile: { id: 'x', display_name: 'Sam', height_cm: '180', weight_kg: 80, age: 30, sex: 'male', activity_level: 'moderate', goal: 'maintain', is_premium: true, stripe_customer_id: 'cus_secret' },
  aiHistory: { id: 'x', user_id: 'U', kind: 'coach_chat', query: 'q', result: 'r', created_at: 'c' },
};

await t('every dataset: a record has a value slot for every CSV column, and nothing outside the allow-list leaks', () => {
  const secrets = ['U', 'cus_secret', 'https://secret/photo.jpg', 'secret', 'AAAA'];
  for (const d of E.DATASETS) {
    const raw = rowFor[d.key];
    assert.ok(raw, `test row for ${d.key}`);
    const rec = d.toRecord(raw);
    for (const c of d.columns) assert.ok(c.key in rec, `${d.key} has ${c.key}`);
    const json = JSON.stringify(rec);
    for (const s of secrets) assert.ok(!json.includes(`"${s}"`), `${d.key} leaks ${s}`);
    assert.ok(!('user_id' in rec) && !('id' in rec), `${d.key} has no ids`);
    d.toRecord({}); // an all-empty row never throws
  }
  assert.equal(E.DATASETS.length, 13);
  assert.equal(new Set(E.DATASETS.map((d) => d.key)).size, 13);
  assert.equal(E.CSV_DATASETS.length, 9);
});

await t('records: names from related rows (object, list or missing), numbers from text', () => {
  const sets = E.datasetByKey('sets').toRecord(rowFor.sets);
  assert.deepEqual(sets, { date: '2026-10-01', exercise: 'Bench Press', weight: 82.5, unit: 'kg', reps: 8, logged_at: '2026-10-01T07:00:00Z' });
  assert.equal(E.datasetByKey('sets').toRecord({ ...rowFor.sets, exercises: null }).exercise, null);
  assert.equal(E.datasetByKey('habitCheckins').toRecord(rowFor.habitCheckins).habit, 'Walk');
  assert.equal(E.datasetByKey('habitCheckins').toRecord(rowFor.habitCheckins).progress_value, 2.5);
  const w = E.datasetByKey('workoutDays').toRecord(rowFor.workoutDays);
  assert.equal(w.plan, 'Push');
  assert.equal(w.program, null);
  assert.equal(E.datasetByKey('body').toRecord(rowFor.body).weight_kg, 82.4);
  assert.equal(E.datasetByKey('body').toRecord({ ...rowFor.body, weight_kg: 'abc' }).weight_kg, null);
  assert.equal(E.datasetByKey('outdoor').toRecord(rowFor.outdoor).distance_meters, 5000.5);
});

await t('plans: exercises come out in plan order with their names', () => {
  const p = E.datasetByKey('plans').toRecord(rowFor.plans);
  assert.deepEqual(
    p.exercises.map((e) => e.exercise),
    ['Bench Press', 'Dips']
  );
  assert.equal(E.datasetByKey('plans').toRecord({ ...rowFor.plans, workout_plan_exercises: null }).exercises.length, 0);
});

await t('outdoor: the spreadsheet has no GPS route, the full copy does', () => {
  const d = E.datasetByKey('outdoor');
  assert.ok(!d.columns.some((c) => c.key === 'route'));
  const rec = d.toRecord(rowFor.outdoor);
  assert.deepEqual(rec.route, [{ lat: 1, lng: 2, t: 3 }]);
  assert.ok(!E.toCsv(d.columns, [rec]).includes('lat'));
  assert.deepEqual(d.toRecord({ ...rowFor.outdoor, route: null }).route, []);
});

await t('a meal named like a formula is exported as text', () => {
  const d = E.datasetByKey('meals');
  const csv = E.toCsv(d.columns, [d.toRecord(rowFor.meals)]);
  assert.ok(csv.includes("'=bad name"));
  assert.equal(parseCsv(csv)[1][2], "'=bad name");
});

await t('sorting: oldest first by date, then start time, equal dates keep their order', () => {
  const s = E.sortRecords([{ date: '2026-03-01', k: 'b1' }, { date: '2026-01-01', k: 'a' }, { date: '2026-03-01', k: 'b2' }, { started_at: '2026-02-01T00:00:00Z', k: 'm' }]);
  assert.deepEqual(
    s.map((r) => r.k),
    ['a', 'm', 'b1', 'b2']
  );
});

// ── Reading ───────────────────────────────────────────────────────────────────
const readerOf = (map) => async (d) => {
  const v = map[d.key];
  if (v instanceof Error) throw v;
  if (v === undefined) return { rows: [], complete: true };
  return Array.isArray(v) ? { rows: v, complete: true } : v;
};

await t('collect: reads each chosen dataset and nothing else', async () => {
  const seen = [];
  const reader = async (d) => {
    seen.push(d.key);
    return { rows: [rowFor[d.key]], complete: true };
  };
  const c = await E.collect(reader, ['sets', 'body']);
  assert.deepEqual(seen, ['sets', 'body']);
  assert.deepEqual(Object.keys(c.records), ['sets', 'body']);
  assert.deepEqual(c.problems, []);
});

await t('collect: one dataset failing is reported and the others are kept', async () => {
  const c = await E.collect(readerOf({ sets: [rowFor.sets], sleep: new Error('permission denied for table sleep_logs'), body: [rowFor.body] }), ['sets', 'sleep', 'body']);
  assert.equal(c.records.sets.length, 1);
  assert.equal(c.records.body.length, 1);
  assert.ok(!('sleep' in c.records));
  assert.equal(c.problems.length, 1);
  assert.equal(c.problems[0].dataset, 'sleep');
  assert.equal(c.problems[0].label, 'Sleep');
  assert.match(c.problems[0].message, /permission denied/);
});

await t('collect: a dataset that stopped early is kept but reported as incomplete', async () => {
  const c = await E.collect(readerOf({ sets: { rows: [rowFor.sets, rowFor.sets], complete: false } }), ['sets']);
  assert.equal(c.records.sets.length, 2);
  assert.equal(c.problems.length, 1);
  assert.match(c.problems[0].message, /incomplete/);
});

await t('collect: an empty dataset is an empty list, not a problem', async () => {
  const c = await E.collect(readerOf({}), ['meals']);
  assert.deepEqual(c.records.meals, []);
  assert.deepEqual(c.problems, []);
});

await t('collect: records come out oldest first', async () => {
  const rows = [
    { ...rowFor.hydration, log_date: '2026-10-03' },
    { ...rowFor.hydration, log_date: '2026-10-01' },
    { ...rowFor.hydration, log_date: '2026-10-02' },
  ];
  const c = await E.collect(readerOf({ hydration: rows }), ['hydration']);
  assert.deepEqual(
    c.records.hydration.map((r) => r.date),
    ['2026-10-01', '2026-10-02', '2026-10-03']
  );
});

// ── Files ─────────────────────────────────────────────────────────────────────
await t('file names and types', () => {
  const f = E.csvFile('sets', [], '2026-10-28');
  assert.equal(f.name, 'fitnfree-exercise-sets-2026-10-28.csv');
  assert.equal(f.mime, 'text/csv');
  assert.equal(E.csvFile('outdoor', [], '2026-10-28').name, 'fitnfree-runs-walks-and-rides-2026-10-28.csv');
  const j = E.jsonFile({ records: {}, problems: [] }, '2026-10-28', '2026-10-28T09:00:00.000Z');
  assert.equal(j.name, 'fitnfree-all-my-data-2026-10-28.json');
  assert.equal(j.mime, 'application/json');
  for (const d of E.CSV_DATASETS) assert.match(E.csvFile(d.key, [], '2026-10-28').name, /^fitnfree-[a-z0-9-]+-2026-10-28\.csv$/);
});

await t('the full copy is valid JSON that says what it holds, what is missing and what is not included', async () => {
  const keys = E.everythingKeys();
  assert.equal(keys.length, 13);
  const reader = async (d) => ({ rows: [rowFor[d.key]], complete: d.key !== 'meals' });
  const c = await E.collect(reader, keys);
  const f = E.jsonFile(c, '2026-10-28', '2026-10-28T09:00:00.000Z');
  const o = JSON.parse(f.text);
  assert.equal(o.app, 'FitNFree');
  assert.equal(o.format_version, 1);
  assert.equal(o.exported_at, '2026-10-28T09:00:00.000Z');
  assert.deepEqual(Object.keys(o.data).sort(), [...keys].sort());
  assert.deepEqual(o.not_included, E.NOT_INCLUDED);
  assert.equal(o.problems.length, 1);
  assert.equal(o.problems[0].dataset, 'meals');
  assert.deepEqual(o.data.outdoor[0].route, [{ lat: 1, lng: 2, t: 3 }]);
  assert.equal(o.data.profile[0].display_name, 'Sam');
  assert.ok(!f.text.includes('cus_secret') && !f.text.includes('photo.jpg'));
});

await t('a spreadsheet lists the same rows as the full copy', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ ...rowFor.sets, logged_date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, reps: i + 1, exercises: { name: `Ex, ${i} "q"` } }));
  const c = await E.collect(readerOf({ sets: rows }), ['sets']);
  const csv = parseCsv(E.csvFile('sets', c.records.sets, '2026-10-28').text);
  const json = JSON.parse(E.jsonFile(c, '2026-10-28', 'x').text).data.sets;
  assert.equal(csv.length - 1, json.length);
  json.forEach((r, i) => {
    assert.equal(csv[i + 1][0], r.date);
    assert.equal(csv[i + 1][1], r.exercise);
    assert.equal(csv[i + 1][4], String(r.reps));
  });
});

await t('what is not included is stated', () => {
  assert.ok(E.NOT_INCLUDED.some((l) => /photos/i.test(l)));
  assert.ok(E.NOT_INCLUDED.some((l) => /messages/i.test(l)));
});

console.log(`\n${n} checks passed${process.exitCode ? ' (some FAILED)' : ''}`);
