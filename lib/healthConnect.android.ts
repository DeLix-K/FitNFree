import * as HC from 'react-native-health-connect';
import { createHealthConnectSource, type HcApi } from './healthConnectSource';
import type { HealthSource } from './healthTypes';

// The Android wiring of Health Connect (see lib/healthConnectSource.ts for what it reads and how). Only the Android build includes this file.
// The library's types are stricter than the small HcApi the source needs, so the functions are handed over as they are.
const exerciseTypeNames: Record<number, string> = Object.fromEntries(Object.entries(HC.ExerciseType).map(([name, value]) => [value as number, name]));

export const healthConnectSource: HealthSource | null = createHealthConnectSource(
  {
    getSdkStatus: () => HC.getSdkStatus(),
    initialize: () => HC.initialize(),
    requestPermission: HC.requestPermission,
    getGrantedPermissions: HC.getGrantedPermissions,
    readRecords: HC.readRecords,
    aggregateRecord: HC.aggregateRecord,
    aggregateGroupByPeriod: HC.aggregateGroupByPeriod,
    openHealthConnectSettings: HC.openHealthConnectSettings,
  } as unknown as HcApi,
  exerciseTypeNames
);
