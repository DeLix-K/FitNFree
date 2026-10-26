// Turns raw Apple Health readings into what FitNFree shows: nights of sleep, steps per day, workouts. Pure functions with no imports, so the
// rules can be tested on their own (scripts/test-health-summary.mjs). The native HealthKit calls live in lib/appleHealth.ts.
//
// Nothing is invented: a sleep stage is only reported when Health actually recorded stages, and a night is only reported when there is a real
// block of sleep in the data.

export type SleepSample = { start: Date; end: Date; value: number };
// Apple's sleep-analysis values.
export const SLEEP_VALUE = { inBed: 0, asleepUnspecified: 1, awake: 2, core: 3, deep: 4, rem: 5 } as const;

export type Night = {
  sleepDate: string; // the local date you woke up, YYYY-MM-DD (the same convention as Oura in this app)
  bedtime: Date;
  wakeTime: Date;
  asleepMinutes: number;
  // Present only when Health recorded stages for the night.
  deepMinutes: number | null;
  remMinutes: number | null;
  lightMinutes: number | null; // Apple's "core" sleep
  awakeMinutes: number | null;
  usedInBedOnly: boolean; // true if no "asleep" data existed and in-bed time was used instead
};

type Label = 'inBed' | 'unspecified' | 'awake' | 'core' | 'deep' | 'rem';
const LABEL_OF: Record<number, Label> = { 0: 'inBed', 1: 'unspecified', 2: 'awake', 3: 'core', 4: 'deep', 5: 'rem' };
// When two sources disagree about the same minute, the one with real stages wins over "asleep" without stages, which wins over "in bed".
const PRIORITY: Record<Label, number> = { inBed: 0, unspecified: 1, core: 2, deep: 2, rem: 2, awake: 2 };

const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function sleepNights(samples: SleepSample[], opts: { minAsleepMinutes?: number; sessionGapMinutes?: number } = {}): Night[] {
  const minAsleep = opts.minAsleepMinutes ?? 120; // shorter blocks are naps and are left out
  const gap = opts.sessionGapMinutes ?? 120; // a pause longer than this starts a new block
  const valid = samples.filter((s) => s.value in LABEL_OF && s.end > s.start && Number.isFinite(s.start.getTime()) && Number.isFinite(s.end.getTime()));
  if (!valid.length) return [];

  // One slot per minute, labelled by the best source for that minute.
  const t0 = Math.floor(Math.min(...valid.map((s) => s.start.getTime())) / MIN);
  const t1 = Math.ceil(Math.max(...valid.map((s) => s.end.getTime())) / MIN);
  if (t1 - t0 > 60 * 24 * 40) return []; // refuse silly spans (more than 40 days at once)
  const slots: (Label | null)[] = new Array(t1 - t0).fill(null);
  for (const s of valid) {
    const label = LABEL_OF[s.value];
    const from = Math.floor(s.start.getTime() / MIN) - t0;
    const to = Math.ceil(s.end.getTime() / MIN) - t0;
    for (let i = from; i < to; i++) {
      const cur = slots[i];
      if (cur === null || PRIORITY[label] >= PRIORITY[cur]) slots[i] = label;
    }
  }

  const isAsleep = (l: Label | null) => l === 'unspecified' || l === 'core' || l === 'deep' || l === 'rem';
  const hasAnyAsleep = slots.some(isAsleep);
  const counts = (l: Label | null) => (hasAnyAsleep ? isAsleep(l) : l === 'inBed');

  // Group into blocks of sleep separated by long pauses.
  const blocks: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  for (let i = 0; i < slots.length; i++) {
    if (!counts(slots[i])) continue;
    if (cur && i - cur.to <= gap) cur.to = i + 1;
    else {
      if (cur) blocks.push(cur);
      cur = { from: i, to: i + 1 };
    }
  }
  if (cur) blocks.push(cur);

  const nights: Night[] = [];
  for (const b of blocks) {
    let asleep = 0;
    let deep = 0;
    let rem = 0;
    let core = 0;
    let awake = 0;
    let staged = false;
    for (let i = b.from; i < b.to; i++) {
      const l = slots[i];
      if (counts(l)) asleep++;
      if (l === 'deep') (deep++, (staged = true));
      else if (l === 'rem') (rem++, (staged = true));
      else if (l === 'core') (core++, (staged = true));
      else if (l === 'awake') awake++;
    }
    if (asleep < minAsleep) continue;
    const wake = new Date((t0 + b.to) * MIN);
    nights.push({
      sleepDate: localDate(wake),
      bedtime: new Date((t0 + b.from) * MIN),
      wakeTime: wake,
      asleepMinutes: asleep,
      deepMinutes: staged ? deep : null,
      remMinutes: staged ? rem : null,
      lightMinutes: staged ? core : null,
      awakeMinutes: staged ? awake : null,
      usedInBedOnly: !hasAnyAsleep,
    });
  }

  // One night per date: keep the longest block that woke up on that date.
  const best = new Map<string, Night>();
  for (const n of nights) {
    const prev = best.get(n.sleepDate);
    if (!prev || n.asleepMinutes > prev.asleepMinutes) best.set(n.sleepDate, n);
  }
  return [...best.values()].sort((a, b) => (a.sleepDate < b.sleepDate ? 1 : a.sleepDate > b.sleepDate ? -1 : 0));
}

// ── Steps and other daily totals ────────────────────────────────────────────────────────────────
export type DayTotal = { date: string; value: number };

// `buckets` are Health's per-day statistics, oldest first. Fills any missing day with 0 so a chart always has the same number of bars.
export function dailyTotals(buckets: { start: Date; value: number | null | undefined }[], days: number, today: Date): DayTotal[] {
  const byDate = new Map<string, number>();
  for (const b of buckets) {
    if (b.value === null || b.value === undefined || !Number.isFinite(b.value) || b.value < 0) continue;
    byDate.set(localDate(b.start), (byDate.get(localDate(b.start)) ?? 0) + b.value);
  }
  const out: DayTotal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push({ date: localDate(d), value: Math.round(byDate.get(localDate(d)) ?? 0) });
  }
  return out;
}

export function averageOf(totals: DayTotal[], skipToday = true): number {
  const list = skipToday ? totals.slice(0, -1) : totals;
  const days = list.filter((d) => d.value > 0);
  return days.length ? Math.round(days.reduce((a, d) => a + d.value, 0) / days.length) : 0;
}

// ── Workouts ───────────────────────────────────────────────────────────────────────────────────
export type WorkoutSummary = { type: number; label: string; start: Date; minutes: number; kcal: number | null; km: number | null };

// A readable name for the most common Apple workout types (the numbers are Apple's HKWorkoutActivityType values).
const WORKOUT_LABELS: Record<number, string> = {
  8: 'Boxing', 9: 'Climbing', 11: 'Cross training', 13: 'Cycling', 14: 'Dance', 16: 'Elliptical', 20: 'Functional strength', 24: 'Hiking',
  35: 'Rowing', 37: 'Running', 46: 'Swimming', 50: 'Traditional strength', 52: 'Walking', 57: 'Yoga', 58: 'Barre', 59: 'Core training',
  60: 'Cross-country skiing', 62: 'Flexibility', 63: 'High intensity interval training', 66: 'Pilates', 71: 'Stair climbing', 73: 'Mixed cardio',
  77: 'Kickboxing', 78: 'Cooldown', 80: 'Wheelchair', 3000: 'Other',
};
export const workoutLabel = (type: number): string => WORKOUT_LABELS[type] ?? 'Workout';

export function summarizeWorkouts(
  raw: { type: number; start: Date; durationSeconds: number; kcal?: number | null; meters?: number | null }[],
  limit = 10
): WorkoutSummary[] {
  return raw
    .filter((w) => Number.isFinite(w.durationSeconds) && w.durationSeconds >= 60 && Number.isFinite(w.start.getTime()))
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, limit)
    .map((w) => ({
      type: w.type,
      label: workoutLabel(w.type),
      start: w.start,
      minutes: Math.round(w.durationSeconds / 60),
      kcal: w.kcal !== null && w.kcal !== undefined && w.kcal > 0 ? Math.round(w.kcal) : null,
      km: w.meters !== null && w.meters !== undefined && w.meters > 0 ? Math.round(w.meters / 100) / 10 : null,
    }));
}

// ── What to put into the sleep log ──────────────────────────────────────────────────────────────
export type ExistingSleepRow = { sleep_date: string; source: string };
export type SleepRowToWrite = {
  sleep_date: string;
  duration_minutes: number;
  bedtime: string;
  wake_time: string;
  deep_minutes: number | null;
  rem_minutes: number | null;
  light_minutes: number | null;
  awake_minutes: number | null;
  source: 'apple_health';
};

// Writes only nights that have no entry yet, or whose entry came from Apple Health before (so a refresh can correct it).
// A night the person logged by hand, or that Oura recorded, is never overwritten.
export function planSleepWrites(nights: Night[], existing: ExistingSleepRow[]): { write: SleepRowToWrite[]; skipped: number } {
  const taken = new Map(existing.map((r) => [r.sleep_date, r.source]));
  const write: SleepRowToWrite[] = [];
  let skipped = 0;
  for (const n of nights) {
    const src = taken.get(n.sleepDate);
    if (src && src !== 'apple_health') {
      skipped++;
      continue;
    }
    write.push({
      sleep_date: n.sleepDate,
      duration_minutes: n.asleepMinutes,
      bedtime: n.bedtime.toISOString(),
      wake_time: n.wakeTime.toISOString(),
      deep_minutes: n.deepMinutes,
      rem_minutes: n.remMinutes,
      light_minutes: n.lightMinutes,
      awake_minutes: n.awakeMinutes,
      source: 'apple_health',
    });
  }
  return { write, skipped };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${pad(m)} min` : `${m} min`;
}
