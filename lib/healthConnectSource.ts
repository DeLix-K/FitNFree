import { dailyTotals, healthConnectSleepSamples, summarizeWorkouts, type HcSleepSession, type SleepSample } from './healthSummary';
import type { HealthSource, TodayStats } from './healthTypes';

// The Android side of Health Connect: READ ONLY. It asks permission to read a short list of record types and never writes anything.
// Everything read stays on the phone unless the person turns on the sleep import (lib/healthSleepSync.ts), which copies only sleep nights.
//
// This file does not import the native library. It is given the library's functions (HcApi), so the way it reads and converts can be tested with
// made-up Health Connect records (scripts/test-health-connect.mjs). The real wiring is lib/healthConnect.android.ts.

export type HcPermission = { accessType: 'read' | 'write'; recordType: string };
type Filter = { operator: 'between'; startTime: string; endTime: string };
type ReadOptions = { timeRangeFilter: Filter; ascendingOrder?: boolean; pageSize?: number; pageToken?: string };

export type HcApi = {
  getSdkStatus: () => Promise<number>;
  initialize: () => Promise<boolean>;
  requestPermission: (permissions: HcPermission[]) => Promise<HcPermission[]>;
  getGrantedPermissions: () => Promise<HcPermission[]>;
  readRecords: (recordType: string, options: ReadOptions) => Promise<{ records: any[]; pageToken?: string }>;
  aggregateRecord: (request: { recordType: string; timeRangeFilter: Filter }) => Promise<any>;
  aggregateGroupByPeriod: (request: { recordType: string; timeRangeFilter: Filter; timeRangeSlicer: { period: 'DAYS'; length: number } }) => Promise<any[]>;
  openHealthConnectSettings: () => void;
};

// Health Connect's SdkAvailabilityStatus.SDK_AVAILABLE.
export const HC_SDK_AVAILABLE = 3;

// Exactly the types this app reads. The matching android.permission.health.READ_* entries are in app.json; keep the two lists in step (a test checks this).
export const HC_READ_TYPES = ['Steps', 'ActiveCaloriesBurned', 'Distance', 'RestingHeartRate', 'Weight', 'SleepSession', 'ExerciseSession'] as const;
export const HC_MANIFEST_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_EXERCISE',
] as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (n: number) => {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
};
const between = (from: Date, to: Date): Filter => ({ operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() });
const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// "STRENGTH_TRAINING" -> "Strength training"; the catch-all type reads as just "Workout".
export function humanizeExerciseType(name: string | undefined): string {
  if (!name || name === 'OTHER_WORKOUT') return 'Workout';
  const words = name.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MASS_TO_KG: Record<string, number> = { kilograms: 1, grams: 0.001, pounds: 0.45359237, ounces: 0.028349523125, milligrams: 0.000001, micrograms: 0.000000001 };
export function massToKg(m: { value?: number; unit?: string } | undefined): number | null {
  if (!m || typeof m.value !== 'number' || !Number.isFinite(m.value) || !m.unit || !(m.unit in MASS_TO_KG)) return null;
  const kg = m.value * MASS_TO_KG[m.unit];
  return kg > 0 ? kg : null;
}

export function createHealthConnectSource(api: HcApi, exerciseTypeNames: Record<number, string> = {}): HealthSource {
  let initialized: Promise<boolean> | null = null;
  const ready = (): Promise<boolean> => (initialized ??= api.initialize().catch(() => false));
  // Which record types the person has allowed. Health Connect, unlike Apple Health, says so.
  const allowed = async (): Promise<Set<string>> => new Set((await api.getGrantedPermissions().catch(() => [])).filter((p) => p.accessType === 'read').map((p) => p.recordType));

  return {
    id: 'health_connect',
    name: 'Health Connect',
    copy: {
      intro:
        'See your steps, workouts, heart rate, weight and sleep from Health Connect, the place on Android where your watch and fitness apps save their data, next to your training. FitNFree only reads, and never changes or adds anything. You choose exactly what to allow on the next screen.',
      unavailable: 'Health Connect is not set up on this phone. Install or update it from Google Play (Android 14 and later have it built in), then come back.',
      settingsLink: 'Change what FitNFree can read (Health Connect)',
      disconnected: 'Disconnected. FitNFree has stopped reading Health Connect. To take back the permission itself, open Health Connect > App permissions > FitNFree.',
      nothingCameThrough:
        'Nothing came through. If you expected data, open Health Connect > App permissions > FitNFree and check the types are allowed, and that your watch or fitness app saves to Health Connect. Health Connect only shares the last 30 days from when you first allowed access.',
    },
    openSettings: () => api.openHealthConnectSettings(),

    available: async () => {
      try {
        if ((await api.getSdkStatus()) !== HC_SDK_AVAILABLE) return false;
        return await ready();
      } catch {
        return false;
      }
    },

    requestAccess: async () => {
      if (!(await ready())) throw new Error('Health Connect could not be started on this phone.');
      const granted = await api.requestPermission(HC_READ_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })));
      // Unlike Apple Health, Health Connect says what was allowed. Nothing allowed means nothing can be read, so do not pretend to be connected.
      if (!granted.some((p) => p.accessType === 'read')) {
        throw new Error('Nothing was allowed, so there is nothing to read. Tap Connect and allow at least one type. If the permission screen did not appear, open Health Connect settings below.');
      }
      return true;
    },

    today: async (): Promise<TodayStats> => {
      await ready();
      const ok = await allowed();
      const now = new Date();
      const todayRange = between(startOfDay(now), now);
      const total = async (type: string, pick: (r: any) => unknown): Promise<number> => {
        if (!ok.has(type)) return 0;
        try {
          return finite(pick(await api.aggregateRecord({ recordType: type, timeRangeFilter: todayRange })));
        } catch {
          return 0;
        }
      };
      const latest = async (type: string, lookbackDays: number): Promise<any | null> => {
        if (!ok.has(type)) return null;
        try {
          const r = await api.readRecords(type, { timeRangeFilter: between(daysAgo(lookbackDays), now), ascendingOrder: false, pageSize: 1 });
          return r.records[0] ?? null;
        } catch {
          return null;
        }
      };
      const [steps, kcal, km, hrRec, weightRec] = await Promise.all([
        total('Steps', (r) => r?.COUNT_TOTAL),
        total('ActiveCaloriesBurned', (r) => r?.ACTIVE_CALORIES_TOTAL?.inKilocalories),
        total('Distance', (r) => r?.DISTANCE?.inKilometers),
        latest('RestingHeartRate', 14),
        latest('Weight', 120),
      ]);
      const hr = finite(hrRec?.beatsPerMinute);
      const kg = massToKg(weightRec?.weight);
      return {
        steps: Math.round(steps),
        activeKcal: Math.round(kcal),
        distanceKm: Math.round(km * 10) / 10,
        restingHr: hr > 0 ? Math.round(hr) : null,
        weightKg: kg === null ? null : Math.round(kg * 10) / 10,
      };
    },

    stepsLastDays: async (days) => {
      await ready();
      const now = new Date();
      if (!(await allowed()).has('Steps')) return dailyTotals([], days, now);
      const anchor = daysAgo(days - 1);
      const groups = await api.aggregateGroupByPeriod({ recordType: 'Steps', timeRangeFilter: between(anchor, now), timeRangeSlicer: { period: 'DAYS', length: 1 } });
      // Health Connect adds up the same steps recorded by two apps only once, which is why the totals come from it and not from adding records here.
      return dailyTotals(
        groups.map((g) => ({ start: new Date(g.startTime), value: g.result?.COUNT_TOTAL })),
        days,
        now
      );
    },

    sleepSamples: async (days): Promise<SleepSample[]> => {
      await ready();
      if (!(await allowed()).has('SleepSession')) return [];
      const now = new Date();
      const sessions: HcSleepSession[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 10; page++) {
        const r = await api.readRecords('SleepSession', { timeRangeFilter: between(daysAgo(days), now), ascendingOrder: true, pageSize: 200, pageToken });
        sessions.push(...r.records);
        pageToken = r.pageToken;
        if (!pageToken || r.records.length === 0) break;
      }
      return healthConnectSleepSamples(sessions);
    },

    workouts: async (days) => {
      await ready();
      const ok = await allowed();
      if (!ok.has('ExerciseSession')) return [];
      const now = new Date();
      const r = await api.readRecords('ExerciseSession', { timeRangeFilter: between(daysAgo(days), now), ascendingOrder: false, pageSize: 40 });
      const valid = r.records.filter((w) => Number.isFinite(Date.parse(w.startTime)) && Number.isFinite(Date.parse(w.endTime)));
      // Energy and distance for each of the most recent sessions, when they were allowed and recorded; a failure just leaves them blank.
      const recent = [...valid].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)).slice(0, 10);
      const extra = await Promise.all(
        recent.map(async (w) => {
          const range: Filter = { operator: 'between', startTime: w.startTime, endTime: w.endTime };
          const get = async (type: string, pick: (x: any) => unknown): Promise<number | null> => {
            if (!ok.has(type)) return null;
            try {
              const v = finite(pick(await api.aggregateRecord({ recordType: type, timeRangeFilter: range })));
              return v > 0 ? v : null;
            } catch {
              return null;
            }
          };
          const [kcal, km] = await Promise.all([get('ActiveCaloriesBurned', (x) => x?.ACTIVE_CALORIES_TOTAL?.inKilocalories), get('Distance', (x) => x?.DISTANCE?.inKilometers)]);
          return { w, kcal, meters: km === null ? null : km * 1000 };
        })
      );
      return summarizeWorkouts(
        extra.map(({ w, kcal, meters }) => ({
          type: Number(w.exerciseType),
          label: humanizeExerciseType(exerciseTypeNames[Number(w.exerciseType)]),
          start: new Date(w.startTime),
          durationSeconds: (Date.parse(w.endTime) - Date.parse(w.startTime)) / 1000,
          kcal,
          meters,
        })),
        10
      );
    },
  };
}
