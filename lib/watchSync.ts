// What the iPhone app and the Apple Watch app say to each other, as pure functions with no native imports, so the rules can be tested on their own
// (scripts/test-watch-sync.mjs). The watch app is Swift (targets/watch/); it cannot read the phone's data, so the two talk over Apple's WatchConnectivity:
//
//   phone -> watch   the same small snapshot the home-screen widget uses (lib/widgetSnapshot.ts), as ONE piece of text in the "application context".
//                    The watch keeps only the latest one. An empty text means "signed out": the watch goes back to "open FitNFree on your iPhone".
//   watch -> phone   one request, "log-workout" for a day. It is queued by iOS and delivered when the phone app next runs, so it can arrive late or
//                    twice; logging a workout for a day is idempotent, and the phone checks the day before it logs anything (resolveLogDate).
//
// PRIVACY: the same three things the widget gets (streak, this week's trained days, weekly target). No names, health data or workout details,
// and the watch holds no sign-in and never contacts a server: everything goes phone <-> watch on the person's own devices.

import type { WidgetSnapshot } from './widgetSnapshot';

export const WATCH_PROTOCOL = 1;
export const REQUEST_LOG_WORKOUT = 'log-workout';
export const MAX_REQUEST_AGE_DAYS = 2;
export const MAX_PENDING = 7;

export type WatchContext = { v: 1; snapshot: string };
export type WatchRequest = { type: 'log-workout'; date: string };

// WatchConnectivity only carries plain property-list values (no null), so the snapshot travels as the same JSON text the widget reads.
export function buildWatchContext(snapshot: WidgetSnapshot | null): WatchContext {
  return { v: WATCH_PROTOCOL, snapshot: snapshot ? JSON.stringify(snapshot) : '' };
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// A real calendar day written YYYY-MM-DD (so 2026-02-30 is not one).
export function isCalendarDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const back = new Date(y, m - 1, d);
  return back.getFullYear() === y && back.getMonth() === m - 1 && back.getDate() === d;
}

// What the phone does with whatever arrives from the watch: only a well-formed "log-workout" is accepted, everything else is ignored.
export function parseWatchRequest(payload: unknown): WatchRequest | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.v !== WATCH_PROTOCOL || p.type !== REQUEST_LOG_WORKOUT || !isCalendarDate(p.date)) return null;
  return { type: REQUEST_LOG_WORKOUT, date: p.date };
}

// Which day to log for a request that says `date`. A day in the future (the watch and phone disagreeing about the time zone) is logged as today;
// a day more than MAX_REQUEST_AGE_DAYS old is a stale request and is dropped.
export function resolveLogDate(date: string, now: Date): string | null {
  if (!isCalendarDate(date)) return null;
  const today = localDate(now);
  if (date > today) return today;
  if (date < localDate(addDays(now, -MAX_REQUEST_AGE_DAYS))) return null;
  return date;
}

// The days waiting to be logged (kept on the phone until they are saved, so a bad connection does not lose a tap on the watch):
// only real, recent days, each once, oldest first, at most MAX_PENDING.
export function normalizePending(list: unknown, now: Date): string[] {
  if (!Array.isArray(list)) return [];
  const days = new Set<string>();
  for (const item of list) {
    const day = typeof item === 'string' ? resolveLogDate(item, now) : null;
    if (day) days.add(day);
  }
  return [...days].sort().slice(-MAX_PENDING);
}

export function addPending(list: unknown, date: string, now: Date): string[] {
  const day = resolveLogDate(date, now);
  return normalizePending(day ? [...normalizePending(list, now), day] : list, now);
}

export function removePending(list: unknown, date: string, now: Date): string[] {
  return normalizePending(list, now).filter((d) => d !== date);
}
