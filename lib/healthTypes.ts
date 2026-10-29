import type { DayTotal, HealthSourceId, SleepSample, WorkoutSummary } from './healthSummary';

// What the health card needs from a health source. The real sources are lib/appleHealth.ios.ts (iPhone) and lib/healthConnect.android.ts (Android);
// everywhere else there is none. The screen takes a source as a prop, so it can also be shown with sample data.

export type TodayStats = {
  steps: number;
  activeKcal: number;
  distanceKm: number;
  restingHr: number | null;
  weightKg: number | null;
};

// The words that differ between Apple Health and Health Connect, so the one card can serve both.
export type HealthCopy = {
  intro: string; // shown before connecting
  unavailable: string;
  settingsLink: string;
  disconnected: string;
  nothingCameThrough: string;
};

export type HealthSource = {
  id: HealthSourceId; // also what is stored as sleep_logs.source for imported nights
  name: string; // 'Apple Health' or 'Health Connect'
  copy: HealthCopy;
  // Opens the phone's own screen for changing what this app may read.
  openSettings: () => void | Promise<void>;
  // Is Health on this device at all (it is not on iPad, for example).
  available: () => Promise<boolean>;
  // Shows Apple's permission sheet. Resolves true once the sheet has been answered, whatever the answers were: Apple does not tell an app
  // which read permissions were refused, so an empty result can mean "no data" or "not allowed".
  requestAccess: () => Promise<boolean>;
  today: () => Promise<TodayStats>;
  stepsLastDays: (days: number) => Promise<DayTotal[]>;
  sleepSamples: (days: number) => Promise<SleepSample[]>;
  workouts: (days: number) => Promise<WorkoutSummary[]>;
};
