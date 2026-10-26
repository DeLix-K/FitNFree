import type { HealthSource } from './healthTypes';

// Apple Health only exists on iPhone. On the web and on Android there is no source, so the Apple Health card is not shown there.
// (Android's Health Connect is a separate, later piece of work.) The iPhone version is lib/appleHealth.ios.ts.
export const appleHealthSource: HealthSource | null = null;
