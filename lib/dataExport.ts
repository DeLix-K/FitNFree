// The rules for "Export my data". Pure functions with no imports, so they can be tested on their own (scripts/test-data-export.mjs).
//
// Each dataset is one of the person's own logs. A raw database row is turned into a flat record by `toRecord`; CSV files use the dataset's
// `columns`, and the full JSON copy uses the whole record. Only columns named here are exported, so an id from a payment provider or any
// column added to a table later never leaks into a file by accident. `user_id` is left out everywhere: it is the person's own id and means nothing outside the app.

export type Raw = Record<string, unknown>;
export type Rec = Record<string, unknown>;

export type DatasetKey =
  | 'sets'
  | 'workoutDays'
  | 'body'
  | 'meals'
  | 'sleep'
  | 'mood'
  | 'hydration'
  | 'habitCheckins'
  | 'outdoor'
  | 'habits'
  | 'plans'
  | 'profile'
  | 'aiHistory';

export type Column = { key: string; header: string };

export type Dataset = {
  key: DatasetKey;
  label: string;
  blurb: string;
  // Where it comes from. `select` is '*' (so a column that an older database does not have yet cannot make the whole read fail; `toRecord` is what picks
  // the columns that are exported), plus a related name where one is needed (the exercise's name, the plan's name). The profile names its columns:
  // the same ones the Profile screen already reads, and no payment or subscription columns are even requested.
  table: string;
  select: string;
  single?: boolean; // exactly one row (the profile)
  csv: boolean; // offered as a spreadsheet file on its own
  columns: Column[]; // the CSV columns; the JSON copy always has the whole record
  toRecord: (raw: Raw) => Rec;
};

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
// Numbers can arrive as text from the database (numeric columns); keep them as numbers, and keep anything unreadable as nothing.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
// A related row embedded by the database comes back as an object, or occasionally a one-item list.
const related = (v: unknown): Raw | null => {
  const one = Array.isArray(v) ? v[0] : v;
  return one && typeof one === 'object' ? (one as Raw) : null;
};
const pick = (raw: Raw, keys: string[]): Rec => {
  const out: Rec = {};
  for (const k of keys) out[k] = raw[k] ?? null;
  return out;
};

export const DATASETS: Dataset[] = [
  {
    key: 'sets',
    label: 'Exercise sets',
    blurb: 'Every set you logged: exercise, weight, reps.',
    table: 'exercise_set_logs',
    select: '*, exercises(name)',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'exercise', header: 'Exercise' },
      { key: 'weight', header: 'Weight' },
      { key: 'unit', header: 'Unit' },
      { key: 'reps', header: 'Reps' },
      { key: 'logged_at', header: 'Logged at' },
    ],
    toRecord: (r) => ({
      date: r.logged_date ?? null,
      exercise: str(related(r.exercises)?.name),
      weight: num(r.weight),
      unit: r.weight_unit ?? null,
      reps: num(r.reps),
      logged_at: r.created_at ?? null,
    }),
  },
  {
    key: 'workoutDays',
    label: 'Workout days',
    blurb: 'The days you logged a workout, with the plan and length if you set them.',
    table: 'workout_logs',
    select: '*, workout_plans(name), programs(name)',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'plan', header: 'Plan' },
      { key: 'program', header: 'Program' },
      { key: 'duration_minutes', header: 'Minutes' },
      { key: 'logged_at', header: 'Logged at' },
    ],
    toRecord: (r) => ({
      date: r.logged_date ?? null,
      plan: str(related(r.workout_plans)?.name),
      program: str(related(r.programs)?.name),
      duration_minutes: num(r.duration_minutes),
      logged_at: r.created_at ?? null,
    }),
  },
  {
    key: 'body',
    label: 'Body log',
    blurb: 'Weight, body fat and measurements. Progress photos are not included: they only ever existed on your phone.',
    table: 'body_log',
    select: '*',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'weight_kg', header: 'Weight (kg)' },
      { key: 'body_fat_pct', header: 'Body fat (%)' },
      { key: 'waist_cm', header: 'Waist (cm)' },
      { key: 'chest_cm', header: 'Chest (cm)' },
      { key: 'hips_cm', header: 'Hips (cm)' },
      { key: 'thigh_cm', header: 'Thigh (cm)' },
      { key: 'arm_cm', header: 'Arm (cm)' },
      { key: 'notes', header: 'Notes' },
    ],
    toRecord: (r) => ({
      date: r.logged_date ?? null,
      weight_kg: num(r.weight_kg),
      body_fat_pct: num(r.body_fat_pct),
      waist_cm: num(r.waist_cm),
      chest_cm: num(r.chest_cm),
      hips_cm: num(r.hips_cm),
      thigh_cm: num(r.thigh_cm),
      arm_cm: num(r.arm_cm),
      notes: str(r.notes),
    }),
  },
  {
    key: 'meals',
    label: 'Meals',
    blurb: 'Food you logged with calories and macros.',
    table: 'meal_logs',
    select: '*',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'meal', header: 'Meal' },
      { key: 'description', header: 'Description' },
      { key: 'calories', header: 'Calories' },
      { key: 'protein_g', header: 'Protein (g)' },
      { key: 'carbs_g', header: 'Carbs (g)' },
      { key: 'fat_g', header: 'Fat (g)' },
      { key: 'fiber_g', header: 'Fibre (g)' },
      { key: 'iron_mg', header: 'Iron (mg)' },
      { key: 'source', header: 'How it was added' },
    ],
    toRecord: (r) => ({
      date: r.log_date ?? null,
      meal: r.meal_type ?? null,
      description: str(r.description),
      calories: num(r.calories),
      protein_g: num(r.protein_g),
      carbs_g: num(r.carbs_g),
      fat_g: num(r.fat_g),
      fiber_g: num(r.fiber_g),
      iron_mg: num(r.iron_mg),
      source: r.source ?? null,
    }),
  },
  {
    key: 'sleep',
    label: 'Sleep',
    blurb: 'Nights you logged or synced: length, times, quality, notes.',
    table: 'sleep_logs',
    select: '*',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'duration_minutes', header: 'Minutes asleep' },
      { key: 'bedtime', header: 'Bedtime' },
      { key: 'wake_time', header: 'Wake time' },
      { key: 'quality_rating', header: 'Quality (1-5)' },
      { key: 'sleep_score', header: 'Sleep score' },
      { key: 'deep_minutes', header: 'Deep (min)' },
      { key: 'rem_minutes', header: 'REM (min)' },
      { key: 'light_minutes', header: 'Light (min)' },
      { key: 'awake_minutes', header: 'Awake (min)' },
      { key: 'average_hrv', header: 'Average HRV' },
      { key: 'lowest_heart_rate', header: 'Lowest heart rate' },
      { key: 'source', header: 'Source' },
      { key: 'notes', header: 'Notes' },
    ],
    toRecord: (r) => ({
      date: r.sleep_date ?? null,
      duration_minutes: num(r.duration_minutes),
      bedtime: r.bedtime ?? null,
      wake_time: r.wake_time ?? null,
      quality_rating: num(r.quality_rating),
      sleep_score: num(r.sleep_score),
      deep_minutes: num(r.deep_minutes),
      rem_minutes: num(r.rem_minutes),
      light_minutes: num(r.light_minutes),
      awake_minutes: num(r.awake_minutes),
      average_hrv: num(r.average_hrv),
      lowest_heart_rate: num(r.lowest_heart_rate),
      source: r.source ?? null,
      notes: str(r.notes),
    }),
  },
  {
    key: 'mood',
    label: 'Mood',
    blurb: 'Your mood ratings and the notes you wrote.',
    table: 'mood_logs',
    select: '*',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'mood', header: 'Mood (1-5)' },
      { key: 'notes', header: 'Notes' },
      { key: 'ai_reflection', header: 'AI reflection' },
    ],
    toRecord: (r) => ({ date: r.log_date ?? null, mood: num(r.mood), notes: str(r.notes), ai_reflection: str(r.ai_reflection) }),
  },
  {
    key: 'hydration',
    label: 'Water',
    blurb: 'Glasses of water per day.',
    table: 'hydration_logs',
    select: '*',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'glasses', header: 'Glasses' },
    ],
    toRecord: (r) => ({ date: r.log_date ?? null, glasses: num(r.glasses) }),
  },
  {
    key: 'habitCheckins',
    label: 'Habit check-ins',
    blurb: 'Each day you ticked off a habit.',
    table: 'habit_logs',
    select: '*, habits(name, unit)',
    csv: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'habit', header: 'Habit' },
      { key: 'progress_value', header: 'Amount' },
      { key: 'unit', header: 'Unit' },
      { key: 'source', header: 'How it was added' },
    ],
    toRecord: (r) => {
      const h = related(r.habits);
      return { date: r.logged_date ?? null, habit: str(h?.name), progress_value: num(r.progress_value), unit: str(h?.unit), source: r.source ?? null };
    },
  },
  {
    key: 'outdoor',
    label: 'Runs, walks and rides',
    blurb: 'Distance and time. The full copy also has the GPS route of each one; the spreadsheet does not.',
    table: 'outdoor_activities',
    select: '*',
    csv: true,
    columns: [
      { key: 'type', header: 'Type' },
      { key: 'started_at', header: 'Started' },
      { key: 'ended_at', header: 'Ended' },
      { key: 'distance_meters', header: 'Distance (m)' },
      { key: 'duration_seconds', header: 'Seconds' },
    ],
    toRecord: (r) => ({
      type: r.activity_type ?? null,
      started_at: r.started_at ?? null,
      ended_at: r.ended_at ?? null,
      distance_meters: num(r.distance_meters),
      duration_seconds: num(r.duration_seconds),
      route: Array.isArray(r.route) ? r.route : [],
    }),
  },
  {
    key: 'habits',
    label: 'Habits',
    blurb: 'The habits you set up.',
    table: 'habits',
    select: '*',
    csv: false,
    columns: [],
    toRecord: (r) => ({ ...pick(r, ['name', 'habit_type', 'unit', 'time_of_day', 'created_at']), target_value: num(r.target_value) }),
  },
  {
    key: 'plans',
    label: 'Workout plans',
    blurb: 'Your plans and the exercises in them.',
    table: 'workout_plans',
    select: '*, workout_plan_exercises(order_index, sets, reps, notes, exercises(name))',
    csv: false,
    columns: [],
    toRecord: (r) => {
      const items = Array.isArray(r.workout_plan_exercises) ? (r.workout_plan_exercises as Raw[]) : [];
      return {
        ...pick(r, ['name', 'description', 'emoji', 'created_at']),
        exercises: items
          .map((e) => ({ order: num(e.order_index), exercise: str(related(e.exercises)?.name), sets: num(e.sets), reps: num(e.reps), notes: str(e.notes) }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      };
    },
  },
  {
    key: 'profile',
    label: 'Profile',
    blurb: 'Your name and the body details you gave for calorie targets.',
    table: 'profiles',
    select: 'display_name, height_cm, weight_kg, age, sex, activity_level, goal',
    single: true,
    csv: false,
    columns: [],
    toRecord: (r) => ({
      display_name: str(r.display_name),
      height_cm: num(r.height_cm),
      weight_kg: num(r.weight_kg),
      age: num(r.age),
      sex: r.sex ?? null,
      activity_level: r.activity_level ?? null,
      goal: r.goal ?? null,
    }),
  },
  {
    key: 'aiHistory',
    label: 'AI history',
    blurb: 'Coach chats, insights and scans from Activity History.',
    table: 'ai_history',
    select: '*',
    csv: false,
    columns: [],
    toRecord: (r) => pick(r, ['kind', 'query', 'result', 'created_at']),
  },
];

export const CSV_DATASETS = DATASETS.filter((d) => d.csv);
export const datasetByKey = (key: DatasetKey): Dataset => {
  const d = DATASETS.find((x) => x.key === key);
  if (!d) throw new Error(`Unknown dataset ${key}`);
  return d;
};

// What is deliberately NOT in an export, written into the JSON file and shown on the screen so nobody assumes otherwise.
export const NOT_INCLUDED: string[] = [
  'Progress photos (they are only on your phone and never reach us).',
  'Direct messages with trainers, and the orders, purchases and receipts of the shop, courses, trainers and merch.',
  'Challenge, leaderboard and friends activity, which also involves other people.',
  'Your email address, password and Premium receipts, which your sign-in provider and the App Store or Google Play hold.',
];

// ── CSV ───────────────────────────────────────────────────────────────────────────────────────────────
const BOM = '﻿'; // lets Excel read accents and emoji as UTF-8
const FORMULA_START = /^[=+\-@\t\r]/;

// One cell. Text that a spreadsheet would run as a formula (it starts with = + - @) is prefixed with an apostrophe so it stays text;
// this matters because meal names can come from scans and food databases, not only from the person. Real numbers are untouched.
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: Column[], records: Rec[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const rec of records) lines.push(columns.map((c) => csvCell(rec[c.key])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

const byDate = (a: Rec, b: Rec): number => {
  const da = String(a.date ?? a.started_at ?? a.created_at ?? '');
  const db = String(b.date ?? b.started_at ?? b.created_at ?? '');
  return da < db ? -1 : da > db ? 1 : 0;
};

// Oldest first, and a stable order for equal dates (the order the rows were read).
export const sortRecords = (records: Rec[]): Rec[] => records.map((r, i) => ({ r, i })).sort((a, b) => byDate(a.r, b.r) || a.i - b.i).map((x) => x.r);

// ── What was read ─────────────────────────────────────────────────────────────────────────────────────
export type Problem = { dataset: DatasetKey; label: string; message: string };
export type Collected = { records: Partial<Record<DatasetKey, Rec[]>>; problems: Problem[] };

// How a dataset is read: the rows, and whether every row was read (false if a safety limit stopped it early).
export type ReadResult = { rows: Raw[]; complete: boolean };
export type ExportReader = (dataset: Dataset) => Promise<ReadResult>;

// Reads the chosen datasets one at a time. One dataset failing does not stop the others; it is recorded as a problem, and the person is told
// (a file that is quietly missing something would be worse than no file). A dataset that stopped early is kept but also recorded as a problem.
export async function collect(read: ExportReader, keys: DatasetKey[]): Promise<Collected> {
  const records: Collected['records'] = {};
  const problems: Problem[] = [];
  for (const key of keys) {
    const d = datasetByKey(key);
    try {
      const { rows, complete } = await read(d);
      records[key] = sortRecords(rows.map(d.toRecord));
      if (!complete) problems.push({ dataset: key, label: d.label, message: `Stopped early after ${rows.length} rows, so this part is incomplete.` });
    } catch (e) {
      problems.push({ dataset: key, label: d.label, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { records, problems };
}

// ── Files ─────────────────────────────────────────────────────────────────────────────────────────────
export type ExportFile = { name: string; mime: string; text: string };

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function csvFile(key: DatasetKey, records: Rec[], day: string): ExportFile {
  const d = datasetByKey(key);
  return { name: `fitnfree-${slug(d.label)}-${day}.csv`, mime: 'text/csv', text: toCsv(d.columns, records) };
}

export function jsonFile(collected: Collected, day: string, exportedAt: string): ExportFile {
  const body = {
    app: 'FitNFree',
    format_version: 1,
    exported_at: exportedAt,
    about:
      'A copy of your own data. Dates are YYYY-MM-DD; times are UTC (ISO 8601). Each exercise set keeps the unit it was logged in (kg or lb); the body log is in kg and cm; GPS routes are lists of {lat, lng, t} points.',
    not_included: NOT_INCLUDED,
    problems: collected.problems,
    data: collected.records,
  };
  return { name: `fitnfree-all-my-data-${day}.json`, mime: 'application/json', text: JSON.stringify(body, null, 2) };
}

export const everythingKeys = (): DatasetKey[] => DATASETS.map((d) => d.key);
