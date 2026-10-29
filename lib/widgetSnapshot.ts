// What the iPhone home-screen widget shows, and how the app hands it over. Pure functions with no imports, so the rules can be tested on their own
// (scripts/test-widget-snapshot.mjs). The widget itself is Swift (targets/widget/), which cannot read the app's data, so the app writes this small
// snapshot into a shared App Group and the widget reads it.
//
// The widget cannot ask the server anything and may be looked at days after the app was last opened, so the snapshot carries the moments when what it shows
// stops being true (the streak runs out, the week ends, the day changes). snapshotAt() works out what to show at any moment; the Swift widget does the same
// sums in the same way (targets/widget/FitNFreeWidget.swift, `shown(_:at:)`), so keep the two in step.
//
// PRIVACY: only a streak count, this week's trained days and the weekly target are shared. No health data, no names, no workout details. Widgets show on the
// home screen only (no lock screen), and the snapshot is erased when the person signs out.

export const WIDGET_APP_GROUP = 'group.com.teamk.fitnfree';
export const SNAPSHOT_KEY = 'streakSnapshot';
export const SNAPSHOT_VERSION = 1;

export type WidgetSnapshot = {
  v: 1;
  streak: number; // the streak as of updatedAt
  weekDone: number; // days trained so far this week (the week starts on Sunday, as the Streaks screen does)
  weekTarget: number;
  days: boolean[]; // Sunday to Saturday of this week, true = trained
  loggedToday: boolean;
  streakValidUntil: number | null; // epoch seconds: after this the streak has run out
  weekEndsAt: number; // epoch seconds: after this the week's days start again
  updatedAt: number; // epoch seconds
};

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateStr = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const midnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const secs = (d: Date): number => Math.floor(d.getTime() / 1000);

// Sunday 00:00 of the week containing d (the same week the Streaks screen uses).
export const startOfWeek = (d: Date): Date => addDays(midnight(d), -d.getDay());

export type SnapshotInput = {
  now: Date;
  currentStreak: number; // from the leaderboard view
  weeklyTarget: number;
  weekLoggedDates: Iterable<string>; // YYYY-MM-DD workouts logged this week
  recentActiveDates: Iterable<string>; // YYYY-MM-DD logged or freeze-covered days in the last few days
};

export function buildSnapshot(input: SnapshotInput): WidgetSnapshot {
  const { now } = input;
  const weekStart = startOfWeek(now);
  const logged = new Set(input.weekLoggedDates);
  const days = Array.from({ length: 7 }, (_, i) => logged.has(toDateStr(addDays(weekStart, i))));
  const streak = Number.isFinite(input.currentStreak) ? Math.min(99_999, Math.max(0, Math.floor(input.currentStreak))) : 0;
  const target = Number.isFinite(input.weeklyTarget) ? Math.min(7, Math.max(1, Math.round(input.weeklyTarget))) : 5;

  // A streak counts while the last active day was today or yesterday, so it runs out at midnight at the start of the day after tomorrow.
  const today = toDateStr(now);
  const active = [...input.recentActiveDates, ...logged].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today).sort();
  let streakValidUntil: number | null = null;
  if (streak > 0) {
    if (active.length) {
      const [y, m, d] = active[active.length - 1].split('-').map(Number);
      streakValidUntil = secs(new Date(y, m - 1, d + 2));
    } else {
      // The server says there is a streak but no recent day was found: show it only until midnight rather than guess.
      streakValidUntil = secs(addDays(midnight(now), 1));
    }
  }

  return {
    v: SNAPSHOT_VERSION,
    streak,
    weekDone: days.filter(Boolean).length,
    weekTarget: target,
    days,
    loggedToday: logged.has(today),
    streakValidUntil,
    weekEndsAt: secs(addDays(weekStart, 7)),
    updatedAt: secs(now),
  };
}

export type Shown = { hasData: boolean; streak: number; weekDone: number; weekTarget: number; days: boolean[]; loggedToday: boolean };
const EMPTY: Shown = { hasData: false, streak: 0, weekDone: 0, weekTarget: 0, days: [false, false, false, false, false, false, false], loggedToday: false };

// Is this something the widget can safely show? (A missing, damaged or newer-version snapshot shows the "open the app" state.)
export function isValidSnapshot(s: unknown): s is WidgetSnapshot {
  if (!s || typeof s !== 'object') return false;
  const x = s as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return (
    x.v === SNAPSHOT_VERSION &&
    num(x.streak) && num(x.weekDone) && num(x.weekTarget) && num(x.weekEndsAt) && num(x.updatedAt) &&
    (x.streakValidUntil === null || num(x.streakValidUntil)) &&
    typeof x.loggedToday === 'boolean' &&
    Array.isArray(x.days) && x.days.length === 7 && x.days.every((d) => typeof d === 'boolean')
  );
}

// What to show at moment `at`. The streak is shown only until it runs out; once the week has ended the week's days read as not trained;
// "trained today" is only true on the day the snapshot was written.
export function snapshotAt(s: unknown, at: Date): Shown {
  if (!isValidSnapshot(s)) return EMPTY;
  const t = secs(at);
  const weekOver = t >= s.weekEndsAt;
  const sameDay = toDateStr(new Date(s.updatedAt * 1000)) === toDateStr(at);
  return {
    hasData: true,
    streak: s.streakValidUntil !== null && t < s.streakValidUntil ? s.streak : 0,
    weekDone: weekOver ? 0 : s.weekDone,
    weekTarget: s.weekTarget,
    days: weekOver ? EMPTY.days : s.days,
    loggedToday: sameDay && !weekOver && s.loggedToday,
  };
}

// The moments (after `now`) when what is shown changes, so the widget can be given a timeline that stays right without the app being opened:
// the streak running out, the week ending, and the next midnight (when "trained today" resets).
export function changeMoments(s: unknown, now: Date): Date[] {
  if (!isValidSnapshot(s)) return [];
  const t = secs(now);
  const candidates = [s.streakValidUntil, s.weekEndsAt, secs(addDays(midnight(now), 1))].filter((v): v is number => v !== null && v > t);
  return [...new Set(candidates)].sort((a, b) => a - b).map((v) => new Date(v * 1000));
}

export const serializeSnapshot = (s: WidgetSnapshot): string => JSON.stringify(s);
