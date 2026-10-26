import type { DayTotal, SleepSample, WorkoutSummary } from './healthSummary';

// What the Apple Health card needs from a health source. The real source is lib/appleHealth.ios.ts (iPhone only); everywhere else
// there is none. The screen takes a source as a prop, so it can also be shown with sample data.

export type TodayStats = {
  steps: number;
  activeKcal: number;
  distanceKm: number;
  restingHr: number | null;
  weightKg: number | null;
};

export type HealthSource = {
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
