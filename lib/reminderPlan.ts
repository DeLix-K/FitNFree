// The rules behind workout reminders and the rest timer. Pure functions with no imports, so they can be tested on their own
// (scripts/test-reminders.mjs). The scheduling that talks to the phone lives in lib/workoutReminders.ts and lib/restTimer.ts.
//
// Reminders are scheduled one day at a time for the next two weeks and re-planned whenever the app opens, rather than as an open-ended weekly
// repeat. That is what lets today's reminder be dropped once you have already trained, and it means a person who stops opening the app stops
// getting reminders after two weeks instead of being nagged forever.

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── Workout reminders ─────────────────────────────────────────────────────────────────────────────
export type ReminderSettings = {
  enabled: boolean;
  days: number[]; // 0 = Sunday ... 6 = Saturday
  hour: number; // 0 to 23
  minute: number; // 0 to 59
};

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, days: [1, 3, 5], hour: 18, minute: 0 };
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const REMINDER_HORIZON_DAYS = 14;

const wholeIn = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(hi, Math.max(lo, n));
};

// Keeps whatever was saved on the phone (or typed) inside sensible bounds. A reminder with no days chosen cannot be on.
export function sanitizeReminders(raw: unknown): ReminderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(r.days) ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : DEFAULT_REMINDERS.days;
  return {
    enabled: r.enabled === true && days.length > 0,
    days,
    hour: wholeIn(r.hour, 0, 23, DEFAULT_REMINDERS.hour),
    minute: wholeIn(r.minute, 0, 59, DEFAULT_REMINDERS.minute),
  };
}

export const timeLabel = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;

// The moments to remind, soonest first: each chosen weekday in the next `horizonDays` days at the chosen time. A moment already past (or less than a
// minute away) is left out, and so is today's if the person has already trained today.
export function upcomingReminderTimes(settings: ReminderSettings, now: Date, trainedDate: string | null, horizonDays = REMINDER_HORIZON_DAYS): Date[] {
  if (!settings.enabled || settings.days.length === 0) return [];
  const today = isoDate(now);
  const out: Date[] = [];
  for (let i = 0; i < horizonDays; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, settings.hour, settings.minute, 0, 0);
    if (!settings.days.includes(day.getDay())) continue;
    if (day.getTime() <= now.getTime() + 60_000) continue;
    if (isoDate(day) === today && trainedDate === today) continue;
    out.push(day);
  }
  return out;
}

export const reminderId = (when: Date): string => `fitnfree-workout-${isoDate(when)}`;
export const isReminderId = (id: string): boolean => /^fitnfree-workout-\d{4}-\d{2}-\d{2}$/.test(id);

const MESSAGES = [
  'Your workout window is open. Even a short session counts.',
  'Time to move. Pick a session and get it done.',
  'Keep your streak alive: log a workout today.',
  "Today's a training day. You've got this.",
];
// A different line on different days, but always the same line for the same date, so re-planning never changes what a person already sees.
export function reminderText(when: Date): { title: string; body: string } {
  const dayNumber = Math.floor(Date.UTC(when.getFullYear(), when.getMonth(), when.getDate()) / 86_400_000);
  return { title: 'Time to train 💪', body: MESSAGES[dayNumber % MESSAGES.length] };
}

// The next reminder in words, for the settings card. Null if none is planned.
export function describeNext(times: Date[], now: Date): string | null {
  const next = times[0];
  if (!next) return null;
  const when = timeLabel(next.getHours(), next.getMinutes());
  const diff = Math.round((new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return `today at ${when}`;
  if (diff === 1) return `tomorrow at ${when}`;
  return `${DAY_LABELS[next.getDay()]} at ${when}`;
}

// ── Rest timer ───────────────────────────────────────────────────────────────────────────────────
export type RestSettings = {
  seconds: number; // 0 = off; otherwise the rest started after each logged set
  notify: boolean; // also send a notification when it ends (so it rings with the phone locked)
};

export const REST_CHOICES = [60, 90, 120, 180, 300] as const;
export const DEFAULT_REST: RestSettings = { seconds: 0, notify: false };
export const REST_ADD_SECONDS = 15;
export const MAX_REST_SECONDS = 900; // 15 minutes, so "+15" cannot run away

export function sanitizeRest(raw: unknown): RestSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = typeof r.seconds === 'number' ? r.seconds : 0;
  return { seconds: (REST_CHOICES as readonly number[]).includes(s) ? s : 0, notify: r.notify === true };
}

// Whole seconds left, rounded up so the last second shows 1 and never 0 while time remains.
export const restRemaining = (endAtMs: number, nowMs: number): number => {
  const sec = Math.ceil((endAtMs - nowMs) / 1000 - 1e-9);
  return sec > 0 ? sec : 0;
};

// Adds time to a running rest (or restarts from now if it already ended), never past the maximum.
export function extendRest(endAtMs: number, nowMs: number, addSec = REST_ADD_SECONDS): number {
  const base = endAtMs > nowMs ? endAtMs : nowMs;
  return Math.min(base + addSec * 1000, nowMs + MAX_REST_SECONDS * 1000);
}

export function formatRest(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
