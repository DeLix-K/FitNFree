// The rules behind the weight and measurements log. Pure functions with no imports, so they can be tested on their own (scripts/test-body-log.mjs).
// Weights are stored in kilograms and lengths in centimetres whatever the person chooses to see; conversion and rounding happen only at the edges.

export type WeightUnit = 'kg' | 'lb' | 'st';
export type LengthUnit = 'cm' | 'in';

export type BodyEntry = {
  id: string;
  logged_date: string; // YYYY-MM-DD
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
  body_fat_pct: number | null;
  notes: string | null;
};

export type MeasureKey = 'waist_cm' | 'chest_cm' | 'hips_cm' | 'thigh_cm' | 'arm_cm';
export const MEASURES: { key: MeasureKey; label: string }[] = [
  { key: 'waist_cm', label: 'Waist' },
  { key: 'chest_cm', label: 'Chest' },
  { key: 'hips_cm', label: 'Hips' },
  { key: 'thigh_cm', label: 'Thigh' },
  { key: 'arm_cm', label: 'Arm' },
];

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function isValidIsoDate(s: string | null | undefined): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000 && y <= 2100;
}

const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const daysBetween = (a: string, b: string): number => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000);
export const addDays = (iso: string, days: number): string => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};

// ── Weight in and out ─────────────────────────────────────────────────────────────────────────────
// Returns kilograms rounded to one decimal, or null if the text is not a sensible weight.
//   kg: "82.4"   lb: "181.7"   st: "12 st 13", "12st13", "12 13", "12.5 st" (stone and pounds, or decimal stone)
export function parseWeight(input: string, unit: WeightUnit): number | null {
  const t = input.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  let kg: number | null = null;
  if (unit === 'kg') {
    if (!/^\d{2,3}(\.\d{1,2})?$/.test(t.replace(/\s*kg$/, ''))) return null;
    kg = Number(t.replace(/\s*kg$/, ''));
  } else if (unit === 'lb') {
    const m = /^(\d{2,4}(?:\.\d{1,2})?)\s*(?:lbs?)?$/.exec(t);
    if (!m) return null;
    kg = Number(m[1]) * KG_PER_LB;
  } else {
    const dec = /^(\d{1,2}\.\d{1,2})\s*(?:st)?$/.exec(t);
    const both = /^(\d{1,2})\s*(?:st|stone|:)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:lbs?)?$/.exec(t);
    const only = /^(\d{1,2})\s*(?:st|stone)$/.exec(t);
    if (dec) kg = Number(dec[1]) * 14 * KG_PER_LB;
    else if (both && Number(both[2]) < 14) kg = (Number(both[1]) * 14 + Number(both[2])) * KG_PER_LB;
    else if (only) kg = Number(only[1]) * 14 * KG_PER_LB;
    else return null;
  }
  const r = round1(kg);
  return r >= 20 && r < 500 ? r : null;
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  if (unit === 'kg') return `${round1(kg)} kg`;
  const lb = kg / KG_PER_LB;
  if (unit === 'lb') return `${round1(lb)} lb`;
  let st = Math.floor(lb / 14);
  let rest = round1(lb - st * 14);
  if (rest >= 14) {
    st += 1;
    rest = 0;
  }
  return `${st} st ${rest} lb`;
}

// A change in weight, signed, in the chosen unit ("+0.8 kg", "-1.5 lb", "-1 st 2 lb").
export function formatWeightChange(deltaKg: number, unit: WeightUnit): string {
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '-' : '';
  const abs = Math.abs(deltaKg);
  if (unit === 'kg') return `${sign}${round1(abs)} kg`;
  const lb = abs / KG_PER_LB;
  if (unit === 'lb') return `${sign}${round1(lb)} lb`;
  const st = Math.floor(lb / 14);
  const rest = round1(lb - st * 14);
  return st > 0 ? `${sign}${st} st ${rest} lb` : `${sign}${rest} lb`;
}

// ── Lengths ───────────────────────────────────────────────────────────────────────────────────────
export function parseLength(input: string, unit: LengthUnit): number | null {
  const t = input.trim().toLowerCase().replace(',', '.').replace(/\s*(cm|in|"|inch|inches)$/, '');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const cm = round1(Number(t) * (unit === 'in' ? CM_PER_IN : 1));
  return cm >= 10 && cm <= 300 ? cm : null;
}

export const formatLength = (cm: number, unit: LengthUnit): string => (unit === 'cm' ? `${round1(cm)} cm` : `${round1(cm / CM_PER_IN)} in`);
export const lengthToInput = (cm: number, unit: LengthUnit): string => String(unit === 'cm' ? round1(cm) : round1(cm / CM_PER_IN));
export const weightToInput = (kg: number, unit: WeightUnit): string => (unit === 'kg' ? String(round1(kg)) : unit === 'lb' ? String(round1(kg / KG_PER_LB)) : formatWeight(kg, 'st').replace(' st ', ' ').replace(' lb', ''));

export function parseBodyFat(input: string): number | null {
  const t = input.trim().replace(',', '.').replace(/\s*%$/, '');
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return null;
  const v = Number(t);
  return v >= 2 && v <= 70 ? v : null;
}

// ── Entries ───────────────────────────────────────────────────────────────────────────────────────
export const hasAnyValue = (e: Partial<Omit<BodyEntry, 'id' | 'logged_date' | 'notes'>>): boolean =>
  [e.weight_kg, e.waist_cm, e.chest_cm, e.hips_cm, e.thigh_cm, e.arm_cm, e.body_fat_pct].some((v) => v !== null && v !== undefined);

export const sortEntries = (list: BodyEntry[]): BodyEntry[] => [...list].sort((a, b) => (a.logged_date < b.logged_date ? 1 : a.logged_date > b.logged_date ? -1 : 0));

export type Point = { date: string; value: number };
export function series(entries: BodyEntry[], key: 'weight_kg' | MeasureKey | 'body_fat_pct'): Point[] {
  return entries
    .filter((e) => typeof e[key] === 'number' && Number.isFinite(e[key] as number) && isValidIsoDate(e.logged_date))
    .map((e) => ({ date: e.logged_date, value: e[key] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// The average of the readings in the 7 days up to and including each point. It smooths the day-to-day wobble that is mostly water, not fat.
export function trailingAverage(points: Point[], windowDays = 7): Point[] {
  return points.map((p) => {
    const inWindow = points.filter((q) => q.date <= p.date && daysBetween(q.date, p.date) < windowDays);
    return { date: p.date, value: round1(inWindow.reduce((a, q) => a + q.value, 0) / inWindow.length) };
  });
}

// Change since about `days` days before the latest reading (uses the reading nearest that day, and only if there is one within 3 days of it).
export function changeOver(points: Point[], days: number): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const target = addDays(last.date, -days);
  let best: Point | null = null;
  for (const p of points.slice(0, -1)) {
    const d = Math.abs(daysBetween(p.date, target));
    if (d <= 3 && (!best || d < Math.abs(daysBetween(best.date, target)))) best = p;
  }
  return best ? round1(last.value - best.value) : null;
}

// Average change per week over the last 4 weeks, from a straight line through the readings. Needs 3 readings spread over at least 14 days.
export function weeklyRate(points: Point[]): number | null {
  if (points.length < 3) return null;
  const last = points[points.length - 1].date;
  const recent = points.filter((p) => daysBetween(p.date, last) <= 28);
  if (recent.length < 3 || daysBetween(recent[0].date, last) < 14) return null;
  const xs = recent.map((p) => daysBetween(recent[0].date, p.date));
  const ys = recent.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (den === 0) return null;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den; // per day
  const perWeek = Math.round(slope * 7 * 100) / 100;
  return perWeek === 0 ? 0 : perWeek; // never negative zero
}

// How far from the starting weight towards the goal, as 0 to 100 (more than 100 is clamped). Null if there is no goal or it is already the start.
export function goalProgress(startKg: number | null, currentKg: number | null, goalKg: number | null): number | null {
  if (startKg === null || currentKg === null || goalKg === null || startKg === goalKg) return null;
  const done = (startKg - currentKg) / (startKg - goalKg);
  return Math.max(0, Math.min(100, Math.round(done * 100)));
}

export type Summary = { latestKg: number | null; latestDate: string | null; firstKg: number | null; change30: number | null; changeAll: number | null; weekly: number | null; entries: number };

export function summarize(entries: BodyEntry[]): Summary {
  const w = series(entries, 'weight_kg');
  const last = w[w.length - 1] ?? null;
  return {
    latestKg: last ? last.value : null,
    latestDate: last ? last.date : null,
    firstKg: w[0] ? w[0].value : null,
    change30: changeOver(w, 30),
    changeAll: w.length >= 2 ? round1(w[w.length - 1].value - w[0].value) : null,
    weekly: weeklyRate(w),
    entries: entries.length,
  };
}

// ── Chart geometry ────────────────────────────────────────────────────────────────────────────────
export type ChartPoint = { x: number; y: number; date: string; value: number };

// Scales points into a width x height box with padding. Time runs left to right by real date, so gaps look like gaps.
export function chartPoints(points: Point[], width: number, height: number, pad = 12): { points: ChartPoint[]; min: number; max: number } {
  if (points.length === 0) return { points: [], min: 0, max: 0 };
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1) {
    min -= 0.5;
    max += 0.5;
  }
  const margin = (max - min) * 0.1;
  min -= margin;
  max += margin;
  const t0 = fromIso(points[0].date).getTime();
  const t1 = fromIso(points[points.length - 1].date).getTime();
  const span = t1 - t0;
  return {
    min,
    max,
    points: points.map((p) => ({
      date: p.date,
      value: p.value,
      x: span === 0 ? width / 2 : pad + ((fromIso(p.date).getTime() - t0) / span) * (width - 2 * pad),
      y: pad + (1 - (p.value - min) / (max - min)) * (height - 2 * pad),
    })),
  };
}

export const pathOf = (pts: { x: number; y: number }[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ');

// Only the readings in the last `days` days (or all of them).
export function lastDays(points: Point[], days: number | null): Point[] {
  if (days === null || points.length === 0) return points;
  const last = points[points.length - 1].date;
  return points.filter((p) => daysBetween(p.date, last) <= days);
}

// ── Export ────────────────────────────────────────────────────────────────────────────────────────
const cell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function bodyLogCsv(entries: BodyEntry[]): string {
  const rows = [...entries].sort((a, b) => (a.logged_date < b.logged_date ? -1 : a.logged_date > b.logged_date ? 1 : 0));
  return [['Date', 'Weight (kg)', 'Body fat (%)', 'Waist (cm)', 'Chest (cm)', 'Hips (cm)', 'Thigh (cm)', 'Arm (cm)', 'Notes'], ...rows.map((e) => [e.logged_date, e.weight_kg, e.body_fat_pct, e.waist_cm, e.chest_cm, e.hips_cm, e.thigh_cm, e.arm_cm, e.notes])]
    .map((r) => r.map((v) => cell(v as string | number | null)).join(','))
    .join('\n');
}
