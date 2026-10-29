import type { HealthSource } from './healthTypes';

// Health Connect only exists on Android. On iPhone and the web there is no source, so its card is not shown there.
// The Android version is lib/healthConnect.android.ts.
export const healthConnectSource: HealthSource | null = null;
