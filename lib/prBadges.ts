// The rules for personal records (PRs). Pure functions with no imports, so they can be tested on their own (scripts/test-pr-badges.mjs).
//
// A set is compared with every set logged BEFORE it for the same exercise. Three kinds of record:
//   weight  the heaviest weight ever lifted (any number of reps)
//   e1rm    the best estimated one-rep max (Epley), counting only sets of 12 reps or fewer, because the formula is unreliable beyond that
//   reps    a "rep record": more weight than any earlier set that had at least as many reps (so 100 kg for 8 reps beats an earlier 95 kg for 8 or 10).
//           For bodyweight sets (weight 0) it is simply more reps than any earlier bodyweight set.
// The first set ever logged is a baseline, never a PR, and a record needs something earlier to beat. Weights in kg and lb are compared in kg,
// and a record must beat the old one by more than rounding noise, so equalling a record is not a new record.

export type Unit = 'kg' | 'lb';
export type SetRow = { weight: number; weight_unit: Unit; reps: number; logged_date: string; created_at?: string };

export const KG_PER_LB = 0.45359237;
export const E1RM_MAX_REPS = 12;
const EPS = 0.01; // kg

export const toKg = (weight: number, unit: Unit): number => (unit === 'lb' ? weight * KG_PER_LB : weight);
export const fromKg = (kg: number, unit: Unit): number => (unit === 'lb' ? kg / KG_PER_LB : kg);
const round1 = (n: number): number => Math.round(n * 10) / 10;

// Epley, the standard estimate. One rep is just the weight.
export const epley = (weight: number, reps: number): number => (reps <= 1 ? weight : weight * (1 + reps / 30));

// Est. 1RM in kg, or null where it should not count (bodyweight, or more than 12 reps).
export function e1rmKg(set: Pick<SetRow, 'weight' | 'weight_unit' | 'reps'>): number | null {
  if (!(set.weight > 0) || !(set.reps >= 1) || set.reps > E1RM_MAX_REPS) return null;
  return epley(toKg(set.weight, set.weight_unit), set.reps);
}

export type PrKind = 'weight' | 'e1rm' | 'reps';
export type Pr = { kind: PrKind; value: number; previous: number | null; text: string };
export type PrResult = { baseline: boolean; prs: Pr[] };

// ── Running state, so a long history is read once ───────────────────────────────────────────────────
type Tracker = { count: number; maxKg: number; bestE1rm: number | null; byReps: Map<number, number>; zeroMaxReps: number | null };

const newTracker = (): Tracker => ({ count: 0, maxKg: 0, bestE1rm: null, byReps: new Map(), zeroMaxReps: null });

function addSet(t: Tracker, s: SetRow): void {
  const kg = toKg(s.weight, s.weight_unit);
  t.count++;
  if (kg > t.maxKg) t.maxKg = kg;
  const e = e1rmKg(s);
  if (e !== null && (t.bestE1rm === null || e > t.bestE1rm)) t.bestE1rm = e;
  if (kg > 0) t.byReps.set(s.reps, Math.max(t.byReps.get(s.reps) ?? 0, kg));
  else t.zeroMaxReps = Math.max(t.zeroMaxReps ?? 0, s.reps);
}

// The heaviest earlier set that had at least `reps` reps (kg), or null if there was none.
function heaviestForReps(t: Tracker, reps: number): number | null {
  let best: number | null = null;
  for (const [r, kg] of t.byReps) if (r >= reps && (best === null || kg > best)) best = kg;
  return best;
}

const num = (n: number): string => String(round1(n));

function check(t: Tracker, s: SetRow): PrResult {
  if (t.count === 0) return { baseline: true, prs: [] };
  const unit = s.weight_unit;
  const kg = toKg(s.weight, unit);
  const prs: Pr[] = [];

  if (s.weight > 0 && kg > t.maxKg + EPS) {
    const prev = t.maxKg > 0 ? round1(fromKg(t.maxKg, unit)) : null;
    prs.push({ kind: 'weight', value: round1(s.weight), previous: prev, text: `Heaviest weight: ${num(s.weight)} ${unit}${prev === null ? '' : ` (was ${num(prev)} ${unit})`}` });
  }

  const e = e1rmKg(s);
  if (e !== null && t.bestE1rm !== null && e > t.bestE1rm + EPS) {
    const value = round1(fromKg(e, unit));
    const prev = round1(fromKg(t.bestE1rm, unit));
    prs.push({ kind: 'e1rm', value, previous: prev, text: `Est. 1RM: ${num(value)} ${unit} (was ${num(prev)} ${unit})` });
  }

  const hasWeightPr = prs.some((p) => p.kind === 'weight');
  if (s.weight > 0) {
    const prevBest = heaviestForReps(t, s.reps);
    if (!hasWeightPr && prevBest !== null && kg > prevBest + EPS) {
      const prev = round1(fromKg(prevBest, unit));
      prs.push({ kind: 'reps', value: s.reps, previous: prev, text: `Rep record: ${num(s.weight)} ${unit} for ${s.reps} rep${s.reps === 1 ? '' : 's'} (best for ${s.reps}+ reps was ${num(prev)} ${unit})` });
    }
  } else if (t.zeroMaxReps !== null && s.reps > t.zeroMaxReps) {
    prs.push({ kind: 'reps', value: s.reps, previous: t.zeroMaxReps, text: `Most reps: ${s.reps} (was ${t.zeroMaxReps})` });
  }

  return { baseline: false, prs };
}

// Would this set be a PR, given everything logged before it?
export function evaluateSet(prior: SetRow[], next: SetRow): PrResult {
  const t = newTracker();
  for (const s of prior) addSet(t, s);
  return check(t, next);
}

// ── Reading a whole history ───────────────────────────────────────────────────────────────────────
const order = (a: { s: SetRow; i: number }, b: { s: SetRow; i: number }): number => {
  if (a.s.logged_date !== b.s.logged_date) return a.s.logged_date < b.s.logged_date ? -1 : 1;
  const ca = a.s.created_at ?? '';
  const cb = b.s.created_at ?? '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.i - b.i;
};
const chronological = (sets: SetRow[]): SetRow[] => sets.map((s, i) => ({ s, i })).sort(order).map((x) => x.s);

export type PrEvent = { set: SetRow; prs: Pr[] };

// Every set that was a PR when it was logged, oldest first.
export function prHistory(history: SetRow[]): PrEvent[] {
  const t = newTracker();
  const out: PrEvent[] = [];
  for (const s of chronological(history)) {
    const r = check(t, s);
    if (r.prs.length) out.push({ set: s, prs: r.prs });
    addSet(t, s);
  }
  return out;
}

export type Records = { heaviest: SetRow | null; bestE1rm: { set: SetRow; kg: number } | null; totalSets: number };

// The current records. When two sets tie, the earlier one holds it.
export function bestRecords(history: SetRow[]): Records {
  let heaviest: SetRow | null = null;
  let heaviestKg = 0;
  let bestE1rm: { set: SetRow; kg: number } | null = null;
  for (const s of chronological(history)) {
    const kg = toKg(s.weight, s.weight_unit);
    if (s.weight > 0 && kg > heaviestKg + EPS) {
      heaviest = s;
      heaviestKg = kg;
    }
    const e = e1rmKg(s);
    if (e !== null && (bestE1rm === null || e > bestE1rm.kg + EPS)) bestE1rm = { set: s, kg: e };
  }
  return { heaviest, bestE1rm, totalSets: history.length };
}

export const KIND_LABEL: Record<PrKind, string> = { weight: 'Heaviest weight', e1rm: 'Est. 1RM', reps: 'Rep record' };
export const prSummary = (prs: Pr[]): string => prs.map((p) => KIND_LABEL[p.kind]).join(' + ');

export function formatSet(s: Pick<SetRow, 'weight' | 'weight_unit' | 'reps'>): string {
  return s.weight > 0 ? `${num(s.weight)} ${s.weight_unit} × ${s.reps}` : `${s.reps} reps (bodyweight)`;
}

// ── Reading a long list a page at a time ──────────────────────────────────────────────────────────
// The database may return fewer rows per request than asked for (it has its own limit), so a short page does NOT mean the end; only an empty one does.
// `complete` is false if the safety limits were hit first, and records must not be announced from an incomplete list.
export async function readAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = 1000, maxRows = 10_000, maxRequests = 60): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  for (let i = 0; i < maxRequests; i++) {
    const page = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (page.length === 0) return { rows, complete: true };
    rows.push(...page);
    if (rows.length >= maxRows) return { rows, complete: false };
  }
  return { rows, complete: false };
}
