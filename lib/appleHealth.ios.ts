import {
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { dailyTotals, summarizeWorkouts, type SleepSample } from './healthSummary';
import type { HealthSource, TodayStats } from './healthTypes';

// The iPhone side of Apple Health: READ ONLY. It asks for permission to read a short list of things, and never writes anything to Health.
// Everything read stays on the phone unless the person turns on the sleep import (lib/healthSleepSync.ts), which copies only sleep nights.
// The HealthKit library crashes the app if a type is read without being requested first, so every type read below is in READ_TYPES.

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const RESTING_HR = 'HKQuantityTypeIdentifierRestingHeartRate';
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';

const READ_TYPES = [STEPS, ENERGY, DISTANCE, RESTING_HR, BODY_MASS, SLEEP, 'HKWorkoutTypeIdentifier'] as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (n: number) => {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
};
const asNumber = (v: number | undefined | null): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Health reports workout length, energy and distance in whatever unit the quantity names; turn them into seconds, kilocalories, metres.
const toSeconds = (q: { quantity: number; unit: string } | undefined): number => {
  if (!q) return 0;
  const u = q.unit.toLowerCase();
  return q.quantity * (u === 'min' ? 60 : u === 'hr' || u === 'h' ? 3600 : 1);
};
const toKcal = (q: { quantity: number; unit: string } | undefined): number | null => {
  if (!q) return null;
  const u = q.unit.toLowerCase();
  return u === 'kj' ? q.quantity / 4.184 : u === 'cal' ? q.quantity / 1000 : q.quantity;
};
const toMeters = (q: { quantity: number; unit: string } | undefined): number | null => {
  if (!q) return null;
  const u = q.unit.toLowerCase();
  return u === 'km' ? q.quantity * 1000 : u === 'mi' ? q.quantity * 1609.344 : u === 'ft' ? q.quantity * 0.3048 : q.quantity;
};

export const appleHealthSource: HealthSource | null = {
  available: async () => {
    try {
      return await isHealthDataAvailableAsync();
    } catch {
      return false;
    }
  },

  requestAccess: async () => {
    // toShare is empty on purpose: this app never writes to Health.
    await requestAuthorization({ toRead: READ_TYPES as unknown as Parameters<typeof requestAuthorization>[0]['toRead'] });
    return true;
  },

  today: async (): Promise<TodayStats> => {
    const from = startOfDay(new Date());
    const filter = { date: { startDate: from, endDate: new Date() } };
    const sum = async (id: typeof STEPS | typeof ENERGY | typeof DISTANCE, unit: string) => {
      try {
        const r = await queryStatisticsForQuantity(id, ['cumulativeSum'], { filter, unit } as never);
        return asNumber(r.sumQuantity?.quantity);
      } catch {
        return 0;
      }
    };
    const latest = async (id: typeof RESTING_HR | typeof BODY_MASS, unit: string, lookbackDays: number): Promise<number | null> => {
      try {
        const r = await queryStatisticsForQuantity(id, ['mostRecent'], { filter: { date: { startDate: daysAgo(lookbackDays), endDate: new Date() } }, unit } as never);
        const q = r.mostRecentQuantity?.quantity;
        return typeof q === 'number' && Number.isFinite(q) && q > 0 ? q : null;
      } catch {
        return null;
      }
    };
    const [steps, kcal, km, hr, kg] = await Promise.all([sum(STEPS, 'count'), sum(ENERGY, 'kcal'), sum(DISTANCE, 'km'), latest(RESTING_HR, 'count/min', 14), latest(BODY_MASS, 'kg', 120)]);
    return { steps: Math.round(steps), activeKcal: Math.round(kcal), distanceKm: Math.round(km * 10) / 10, restingHr: hr === null ? null : Math.round(hr), weightKg: kg === null ? null : Math.round(kg * 10) / 10 };
  },

  stepsLastDays: async (days) => {
    const anchor = daysAgo(days - 1);
    const buckets = await queryStatisticsCollectionForQuantity(STEPS, ['cumulativeSum'], anchor, { day: 1 }, { filter: { date: { startDate: anchor, endDate: new Date() } }, unit: 'count' } as never);
    return dailyTotals(
      buckets.map((b) => ({ start: b.startDate ?? anchor, value: b.sumQuantity?.quantity })),
      days,
      new Date()
    );
  },

  sleepSamples: async (days) => {
    const rows = await queryCategorySamples(SLEEP, { limit: 0, ascending: true, filter: { date: { startDate: daysAgo(days), endDate: new Date() } } });
    return rows.map((r): SleepSample => ({ start: r.startDate, end: r.endDate, value: Number(r.value) }));
  },

  workouts: async (days) => {
    const list = await queryWorkoutSamples({ limit: 40, ascending: false, filter: { date: { startDate: daysAgo(days), endDate: new Date() } } });
    return summarizeWorkouts(
      list.map((w) => ({ type: Number(w.workoutActivityType), start: w.startDate, durationSeconds: toSeconds(w.duration), kcal: toKcal(w.totalEnergyBurned), meters: toMeters(w.totalDistance) })),
      10
    );
  },
};
