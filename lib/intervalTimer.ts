// The maths behind the interval clock (Tabata, boxing rounds, HIIT, rest timer). Pure functions with no imports, so the
// timing can be tested on its own (scripts/test-interval-timer.mjs). The screen only draws what these return.
//
// Time is measured as milliseconds elapsed since the clock started, not by counting ticks. That keeps it correct when the phone
// is busy or the app is paused for a moment: whatever the screen last drew, the next draw catches up to the true time.

export type Phase = 'prepare' | 'work' | 'rest';

export type TimerConfig = {
  prepareSec: number; // lead-in before round 1 (0 = none)
  workSec: number; // one work interval, or one boxing round
  restSec: number; // rest between work intervals (none after the last one)
  rounds: number;
};

export type Segment = { phase: Phase; round: number; startSec: number; durationSec: number };

export type Preset = { id: string; label: string; blurb: string; config: TimerConfig };

export const LIMITS = { prepareSec: [0, 60], workSec: [1, 3600], restSec: [0, 3600], rounds: [1, 99] } as const;

export const PRESETS: Preset[] = [
  { id: 'tabata', label: 'Tabata', blurb: '20 s work, 10 s rest, 8 rounds (4 min)', config: { prepareSec: 10, workSec: 20, restSec: 10, rounds: 8 } },
  { id: 'boxing-3', label: 'Boxing, 3 rounds', blurb: '3 min rounds, 1 min rest (beginner or bag work)', config: { prepareSec: 10, workSec: 180, restSec: 60, rounds: 3 } },
  { id: 'boxing-12', label: 'Boxing, 12 rounds', blurb: '3 min rounds, 1 min rest (full fight pace)', config: { prepareSec: 10, workSec: 180, restSec: 60, rounds: 12 } },
  { id: 'hiit', label: 'HIIT', blurb: '40 s work, 20 s rest, 10 rounds', config: { prepareSec: 10, workSec: 40, restSec: 20, rounds: 10 } },
  { id: 'emom', label: 'EMOM', blurb: 'Every minute on the minute, 10 minutes', config: { prepareSec: 10, workSec: 60, restSec: 0, rounds: 10 } },
];

// A single countdown for rest between sets.
export const REST_PRESETS: { id: string; label: string; config: TimerConfig }[] = [
  { id: 'rest-60', label: '1:00', config: { prepareSec: 0, workSec: 60, restSec: 0, rounds: 1 } },
  { id: 'rest-90', label: '1:30', config: { prepareSec: 0, workSec: 90, restSec: 0, rounds: 1 } },
  { id: 'rest-120', label: '2:00', config: { prepareSec: 0, workSec: 120, restSec: 0, rounds: 1 } },
  { id: 'rest-180', label: '3:00', config: { prepareSec: 0, workSec: 180, restSec: 0, rounds: 1 } },
];

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

// Keeps whatever a person types or a saved setting holds inside sensible bounds.
export function sanitizeConfig(c: Partial<TimerConfig> | null | undefined): TimerConfig {
  return {
    prepareSec: clamp(c?.prepareSec ?? 0, LIMITS.prepareSec),
    workSec: clamp(c?.workSec ?? 20, LIMITS.workSec),
    restSec: clamp(c?.restSec ?? 0, LIMITS.restSec),
    rounds: clamp(c?.rounds ?? 1, LIMITS.rounds),
  };
}

export function buildSchedule(config: TimerConfig): Segment[] {
  const c = sanitizeConfig(config);
  const out: Segment[] = [];
  let t = 0;
  const add = (phase: Phase, round: number, durationSec: number) => {
    if (durationSec <= 0) return;
    out.push({ phase, round, startSec: t, durationSec });
    t += durationSec;
  };
  add('prepare', 0, c.prepareSec);
  for (let r = 1; r <= c.rounds; r++) {
    add('work', r, c.workSec);
    if (r < c.rounds) add('rest', r, c.restSec);
  }
  return out;
}

export const totalSeconds = (config: TimerConfig): number => {
  const s = buildSchedule(config);
  const last = s[s.length - 1];
  return last ? last.startSec + last.durationSec : 0;
};

export type ClockState =
  | { done: false; index: number; phase: Phase; round: number; rounds: number; remainingSec: number; segmentSec: number; totalRemainingSec: number; progress: number }
  | { done: true; index: number; phase: 'done'; round: number; rounds: number; remainingSec: 0; segmentSec: 0; totalRemainingSec: 0; progress: 1 };

export function stateAt(schedule: Segment[], elapsedMs: number, rounds: number): ClockState {
  const total = schedule.length ? schedule[schedule.length - 1].startSec + schedule[schedule.length - 1].durationSec : 0;
  const elapsed = Math.max(0, elapsedMs) / 1000;
  if (!schedule.length || elapsed >= total) return { done: true, index: schedule.length, phase: 'done', round: rounds, rounds, remainingSec: 0, segmentSec: 0, totalRemainingSec: 0, progress: 1 };
  let index = 0;
  while (index < schedule.length - 1 && elapsed >= schedule[index + 1].startSec) index++;
  const seg = schedule[index];
  const into = elapsed - seg.startSec;
  return {
    done: false,
    index,
    phase: seg.phase,
    round: seg.round,
    rounds,
    remainingSec: Math.max(0, seg.durationSec - into),
    segmentSec: seg.durationSec,
    totalRemainingSec: Math.max(0, total - elapsed),
    progress: total > 0 ? elapsed / total : 1,
  };
}

// The big number is rounded UP, so a 20-second interval shows 20 at the start and 1 until it ends, never 0 while time is left.
export const wholeSeconds = (remainingSec: number): number => {
  const whole = Math.ceil(Math.max(0, remainingSec) - 1e-9);
  return whole === 0 ? 0 : whole; // never negative zero
};

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec - 1e-9));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export type Cue = { kind: 'phase'; phase: Phase; round: number } | { kind: 'countdown'; second: 3 | 2 | 1 } | { kind: 'finish' };

// What to signal (buzz, speak) as the clock moves from one reading to the next. Never repeats a cue for the same moment.
export function cuesBetween(prev: ClockState | null, next: ClockState): Cue[] {
  const out: Cue[] = [];
  if (next.done) {
    if (!prev || !prev.done) out.push({ kind: 'finish' });
    return out;
  }
  if (!prev || prev.done || prev.index !== next.index) out.push({ kind: 'phase', phase: next.phase, round: next.round });
  const prevWhole = prev && !prev.done && prev.index === next.index ? wholeSeconds(prev.remainingSec) : Infinity;
  const nowWhole = wholeSeconds(next.remainingSec);
  for (const s of [3, 2, 1] as const) {
    if (nowWhole === s && prevWhole > s && next.segmentSec > s) out.push({ kind: 'countdown', second: s });
  }
  return out;
}

export function describeCue(c: Cue): string {
  if (c.kind === 'finish') return 'Finished. Great work.';
  if (c.kind === 'countdown') return String(c.second);
  if (c.phase === 'prepare') return 'Get ready';
  if (c.phase === 'rest') return 'Rest';
  return c.round > 0 ? `Round ${c.round}. Go` : 'Go';
}
